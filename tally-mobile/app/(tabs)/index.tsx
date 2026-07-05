import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expenseAPI, remindersAPI, budgetAPI, momoAPI } from '../../services/api';
import { getUserId, getUserName, safeStorage } from '../../services/storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Svg, Path } from 'react-native-svg';
import {
  addHistoryItem,
  shouldFireBudgetAlert,
  getUnreadCount,
} from '../../services/notificationHistory';
import { consumeMomoRefresh } from '../../services/momoRefresh';

// Module-level MoMo balance cache — survives re-renders, cleared on app restart
let lastMomoFetch = 0;
let cachedMomoBalance: string | null = null;
let cachedMomoStatus: 'loading' | 'available' | 'unavailable' = 'loading';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
  Shared: '👥',
};

const CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Other"];

const getLineStyle = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  
  return {
    position: 'absolute' as const,
    left: x1,
    top: y1,
    width: distance + 0.6,
    height: 3,
    backgroundColor: '#8B5CF6',
    transform: [{ rotate: `${angle}rad` }] as any,
    transformOrigin: ['0%', '50%', 0] as any,
  };
};

function parseTagsFromDescription(description: string | null | undefined): {
  cleanDescription: string;
  tags: string[];
} {
  if (!description) return { cleanDescription: "", tags: [] };
  const words = description.split(" ");
  const tags = words.filter((w) => w.startsWith("#"));
  const cleanDescription = words.filter((w) => !w.startsWith("#")).join(" ").trim();
  return { cleanDescription, tags };
}

const EyelashClosedIcon = ({ size = 20, color = "#D97706" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 10C6 15 18 15 22 10"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
    <Path d="M4 12L2 14.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M8 13.5L7 16.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M12 14L12 17.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M16 13.5L17 16.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M20 12L22 14.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

const EyelashOpenIcon = ({ size = 20, color = "#D97706" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 12C6 6 18 6 22 12C18 18 6 18 2 12Z"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      stroke={color}
      strokeWidth={2.2}
      fill={color}
    />
  </Svg>
);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<{ category: string; isOverBudget: boolean; isNearLimit: boolean; percentage: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState("User");

  // Chart timeline switcher state
  const [chartTimeline, setChartTimeline] = useState<'day' | 'week' | 'month' | 'year'>('week');

  // Notification badge
  const [unreadCount, setUnreadCount] = useState(0);

  // MoMo wallet states
  const [momoBalance, setMomoBalance] = useState("0.00");
  const [momoStatus, setMomoStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [momoBalanceLoading, setMomoBalanceLoading] = useState(false);
  const [momoMonthlySpent, setMomoMonthlySpent] = useState("0.00");
  const [hideMomoBalance, setHideMomoBalance] = useState(false);

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");
  const [quickDescription, setQuickDescription] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData(true);
      loadProfileImage();
      consumeMomoRefresh();
      getUnreadCount().then(setUnreadCount);
      safeStorage.getItem('hide_momo_balance').then((val) => {
        if (val !== null) {
          setHideMomoBalance(val === 'true');
        }
      });
    }, [])
  );

  async function loadProfileImage() {
    try {
      const userId = getUserId();
      const saved = await safeStorage.getItem(`profile_image_${userId}`);
      if (saved) {
        setProfileImage(saved);
      } else {
        setProfileImage(null);
      }
    } catch {
      // Non-critical — the avatar placeholder renders instead
    }
  }

  async function toggleHideMomoBalance() {
    try {
      const newVal = !hideMomoBalance;
      setHideMomoBalance(newVal);
      await safeStorage.setItem('hide_momo_balance', String(newVal));
    } catch {
      // Non-critical — preference just won't persist this time
    }
  }

  async function fetchData(showLoading = true) {
    if (showLoading) setLoading(true);
    setError(null);
    const userId = getUserId();
    try {
      const name = getUserName();
      setUserName(name);

      // Fast local-backend calls only — these decide when the screen renders
      const [expensesRes, budgetsRes, remindersRes] = await Promise.all([
        expenseAPI.getCombinedHistory(userId),
        budgetAPI.getUserBudgets(userId),
        remindersAPI.getUpcomingReminders(userId).catch(() => ({ data: [] }))
      ]);

      const expenseList = expensesRes.data || [];
      setExpenses(expenseList);
      setBudgets(budgetsRes.data || []);
      setUpcomingReminders(remindersRes.data || []);

      // Calculate MoMo spending for this month
      const now = new Date();
      const momoTotal = expenseList
        .filter((e: any) => e.paymentMethod === "MOMO")
        .filter((e: any) => {
          if (!e.date) return false;
          const d = new Date(e.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .filter((e: any) => parseFloat(e.amount || "0") < 0)
        .reduce((sum: number, e: any) => sum + Math.abs(parseFloat(e.amount || "0")), 0);
      setMomoMonthlySpent(momoTotal.toFixed(2));
    } catch (err: any) {
      setError('Failed to load dashboard data. Please check your connection.');
    } finally {
      setLoading(false);
    }

    // Secondary work runs in the background AFTER main content renders.
    // Budget alerts only need local DB — fire immediately.
    checkBudgetAlerts(userId);
    // MoMo balance hits an external sandbox API — delay on initial load so the
    // main content paints first. Cache hits return instantly regardless of delay.
    if (showLoading) {
      setTimeout(() => fetchMomoBalance(), 1000);
    } else {
      fetchMomoBalance();
    }
  }

  async function fetchMomoBalance(force = false) {
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;

    // Serve from module-level cache if still fresh (and not a forced refresh)
    if (!force && cachedMomoBalance !== null && (now - lastMomoFetch) < FIVE_MINUTES) {
      setMomoBalance(cachedMomoBalance);
      setMomoStatus(cachedMomoStatus);
      setMomoBalanceLoading(false);
      return;
    }

    setMomoBalanceLoading(true);
    setMomoStatus("loading");
    try {
      const res = await momoAPI.getBalance();
      const data = res.data;
      if (data.status === "unavailable") {
        cachedMomoStatus = "unavailable";
        setMomoStatus("unavailable");
      } else {
        const bal = data.availableBalance != null
          ? String(Math.max(0, parseFloat(data.availableBalance)).toFixed(2))
          : "0.00";
        cachedMomoBalance = bal;
        cachedMomoStatus = "available";
        lastMomoFetch = now;
        setMomoBalance(bal);
        setMomoStatus("available");
      }
    } catch {
      setMomoStatus("unavailable");
    } finally {
      setMomoBalanceLoading(false);
    }
  }

  async function checkBudgetAlerts(userId: string) {
    try {
      const budgetRes = await budgetAPI.getBudgetSummary(userId);
      const summary = budgetRes.data || {};
      const alerts = Object.entries(summary)
        .filter(([, data]: any) => data.isOverBudget || data.isNearLimit)
        .map(([category, data]: any) => ({
          category,
          isOverBudget: data.isOverBudget,
          isNearLimit: data.isNearLimit,
          percentage: data.percentage,
        }));
      setBudgetAlerts(alerts);

      // Record alerts in history
      for (const alert of alerts) {
        if (alert.isOverBudget) {
          const fire = await shouldFireBudgetAlert(alert.category, "over");
          if (fire) {
            await addHistoryItem({
              type: "budget_over",
              title: `Over budget — ${alert.category}`,
              body: `You've used ${alert.percentage.toFixed(0)}% of your ${alert.category} budget this month.`,
              data: { screen: "budget" },
            });
          }
        } else if (alert.isNearLimit) {
          const fire = await shouldFireBudgetAlert(alert.category, "near");
          if (fire) {
            await addHistoryItem({
              type: "budget_near",
              title: `Near limit — ${alert.category}`,
              body: `${alert.percentage.toFixed(0)}% of your ${alert.category} budget used. Slow down!`,
              data: { screen: "budget" },
            });
          }
        }
      }
      getUnreadCount().then(setUnreadCount);
    } catch {
      // Non-critical — budget alerts simply won't show this pass
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  }

  async function handleQuickAdd() {
    if (!quickAmount.trim()) {
      Alert.alert("Missing amount", "Please enter an amount.");
      return;
    }
    const parsed = parseFloat(quickAmount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }

    setSavingExpense(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      // Quick Add is always an expense — send as negative so history displays correctly
      const negativeAmt = String(-Math.abs(parsed));
      await expenseAPI.createExpense(
        getUserId(),
        negativeAmt,
        quickCategory,
        quickDescription.trim(),
        today,
        "CASH"
      );
      // Reset form
      setQuickAmount("");
      setQuickCategory("Food");
      setQuickDescription("");
      setShowQuickAdd(false);
      
      // Record in notification history
      await addHistoryItem({
        type: "expense_added",
        title: "Expense recorded",
        body: `GHS ${parsed.toFixed(2)} added to ${quickCategory}${quickDescription ? ` — ${quickDescription}` : ""}.`,
        data: { screen: "history" },
      });
      getUnreadCount().then(setUnreadCount);
      
      // Refresh data
      await fetchData(false);
      Alert.alert("✅ Added", `GHS ${parsed.toFixed(2)} in ${quickCategory} recorded.`);
    } catch {
      Alert.alert("Error", "Could not save expense. Please try again.");
    } finally {
      setSavingExpense(false);
    }
  }

  // Calculate Dynamic Spending & Budget sums
  const totalSpent = expenses
    .filter(e => parseFloat(e.amount || '0') < 0)
    .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);
  const totalIncome = expenses
    .filter(e => parseFloat(e.amount || '0') > 0)
    .reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  const remaining = totalBudget - totalSpent;

  // Split formatted total spent for premium large-integer / small-decimal layout
  const formattedTotal = totalSpent.toFixed(2);
  const parts = formattedTotal.split('.');
  const integerPart = parseFloat(parts[0]).toLocaleString();
  const decimalPart = parts[1];

  // Group expenses dynamically by Category (spending only)
  const categoryTotals = expenses.reduce((acc: { [key: string]: number }, e) => {
    const category = e.category || 'Other';
    const numAmt = parseFloat(e.amount || '0');
    if (numAmt < 0) {
      acc[category] = (acc[category] || 0) + Math.abs(numAmt);
    }
    return acc;
  }, {});

  // Sort and slice recent 3 expenses
  const recentExpenses = [...expenses]
    .sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    })
    .slice(0, 3);

  // Dynamic chart data calculation based on selected timeline
  const getChartData = () => {
    const now = new Date();
    
    const parseLocalDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('-');
      if (parts.length < 3) return new Date(dateStr);
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    if (chartTimeline === 'day') {
      // Last 7 days
      const chartBars = [];
      let sum = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayLabel = SHORT_DAYS[d.getDay()];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        const daySpend = expenses
          .filter(e => e.date === dateKey && parseFloat(e.amount || '0') < 0)
          .reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
        
        sum += daySpend;
        chartBars.push({ day: dayLabel, spend: daySpend });
      }
      return { chartBars, chartSum: sum };
    }

    if (chartTimeline === 'week') {
      // Last 4 weeks relative to today
      const chartBars = [];
      let sum = 0;
      for (let i = 3; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(now.getDate() - (i + 1) * 7 + 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(now);
        end.setDate(now.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);

        const weekSpend = expenses.filter(e => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed >= start && ed <= end && parseFloat(e.amount || '0') < 0;
        }).reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);

        sum += weekSpend;
        chartBars.push({ day: `W${4 - i}`, spend: weekSpend });
      }
      return { chartBars, chartSum: sum };
    }

    if (chartTimeline === 'month') {
      // Last 6 months
      const chartBars = [];
      let sum = 0;
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = SHORT_MONTHS[d.getMonth()];
        const yr = d.getFullYear();
        const mo = d.getMonth() + 1;

        const monthSpend = expenses.filter(e => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed.getFullYear() === yr && (ed.getMonth() + 1) === mo && parseFloat(e.amount || '0') < 0;
        }).reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);

        sum += monthSpend;
        chartBars.push({ day: label, spend: monthSpend });
      }
      return { chartBars, chartSum: sum };
    }

    // Yearly: Last 3 years
    const chartBars = [];
    let sum = 0;
    for (let i = 2; i >= 0; i--) {
      const yr = now.getFullYear() - i;
      const yearSpend = expenses.filter(e => {
        if (!e.date) return false;
        const ed = parseLocalDate(e.date);
        return ed.getFullYear() === yr && parseFloat(e.amount || '0') < 0;
      }).reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);

      sum += yearSpend;
      chartBars.push({ day: String(yr), spend: yearSpend });
    }
    return { chartBars, chartSum: sum };
  };

  const { chartBars, chartSum } = getChartData();

  const { width: screenWidth } = Dimensions.get('window');
  const chartWidth = screenWidth - 88; // 20*2 screen horizontal padding + 24*2 card padding
  const chartHeight = 140;
  const paddingVertical = 25;
  const chartInset = 16;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpendVal = Math.max(...chartBars.map(b => b.spend), 0);

  const points = chartBars.map((bar, idx) => {
    const x = chartBars.length > 1
      ? chartInset + (plotWidth / (chartBars.length - 1)) * idx
      : chartInset + plotWidth / 2;
    const y = maxSpendVal > 0 
      ? chartHeight - (paddingVertical + (bar.spend / maxSpendVal) * plotHeight)
      : chartHeight / 2;
    return { x, y, ...bar };
  });

  const curveSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const steps = 12;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    for (let j = 0; j < steps; j++) {
      const t1 = j / steps;
      const t2 = (j + 1) / steps;
      
      const mu1 = (1 - Math.cos(t1 * Math.PI)) / 2;
      const mu2 = (1 - Math.cos(t2 * Math.PI)) / 2;
      
      const x1 = p1.x + t1 * (p2.x - p1.x);
      const x2 = p1.x + t2 * (p2.x - p1.x);
      const y1 = p1.y + mu1 * (p2.y - p1.y);
      const y2 = p1.y + mu2 * (p2.y - p1.y);
      
      curveSegments.push({ x1, y1, x2, y2 });
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && expenses.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.centered, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchData(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 24) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>Welcome back 👋</Text>
            <Text style={[styles.greetingText, { color: colors.text }]}>Good day, {userName}</Text>
          </View>
          <View style={styles.headerRightActions}>
            {/* Notification bell */}
            <TouchableOpacity
              style={[styles.headerActionButton, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => router.push('/notification-history')}
              activeOpacity={0.8}
            >
              <Feather name="bell" size={20} color={colors.text} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 9 ? "9+" : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Reminders icon */}
            <TouchableOpacity
              style={[styles.headerActionButton, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/reminders')}
              activeOpacity={0.8}
            >
              <Feather name="calendar" size={20} color={colors.text} />
            </TouchableOpacity>

            {/* Profile Avatar */}
            <TouchableOpacity
              style={[styles.avatarButton, { borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.neutralBg }]}>
                  <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                    {userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Budget Alerts */}
        {budgetAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            {budgetAlerts.map((alert) => (
              <TouchableOpacity
                key={alert.category}
                style={[
                  styles.alertCard,
                  alert.isOverBudget ? styles.alertCardOver : styles.alertCardNear,
                ]}
                onPress={() => router.push('/(tabs)/budget')}
                activeOpacity={0.75}
              >
                <Text style={styles.alertIcon}>{alert.isOverBudget ? "🚨" : "⚠️"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, alert.isOverBudget ? styles.alertTitleOver : styles.alertTitleNear]}>
                    {alert.isOverBudget ? "Over budget" : "Near limit"} — {alert.category}
                  </Text>
                  <Text style={styles.alertSub}>
                    {alert.percentage.toFixed(0)}% of your {alert.category} budget used
                  </Text>
                </View>
                <Text style={styles.cardChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Expenses Overview Card */}
        <View style={styles.expensesCard}>
          <View style={styles.radialCircle1} />
          <View style={styles.radialCircle2} />
          <View style={styles.radialCircle3} />

          <View style={styles.expensesCardHeader}>
            <Text style={styles.expensesCardLabel}>your Expenses</Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol}>GHS </Text>
            <Text style={styles.amountInteger}>{integerPart}</Text>
            <Text style={styles.amountFraction}>.{decimalPart}</Text>
          </View>

          <View style={[styles.trendRow, { gap: 8 }]}>
            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>
                {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
              </Text>
            </View>
            {totalIncome > 0 && (
              <View style={[styles.trendBadge, { backgroundColor: colors.positive + '20' }]}>
                <Text style={[styles.trendText, { color: colors.positive, fontWeight: 'bold' }]}>
                  +GHS {totalIncome.toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          {totalBudget > 0 && (
            <>
              <View style={styles.progressContainer}>
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.budgetStatsRow}>
                <Text style={styles.budgetValue}>Budget: GHS {totalBudget.toLocaleString()}</Text>
                <Text style={styles.remainingValue}>
                  {remaining >= 0
                    ? `Remaining: GHS ${remaining.toLocaleString()}`
                    : `Overspent: GHS ${Math.abs(remaining).toLocaleString()}`}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* MTN MoMo Wallet Balance Card */}
        <View style={[
          styles.momoCard,
          momoStatus === "unavailable" && styles.momoCardUnavailable,
        ]}>
          <View style={styles.momoCardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text style={styles.momoCardIcon}>📱</Text>
              <Text style={styles.momoCardTitle}>MTN MoMo Sandbox Wallet</Text>
            </View>
            {!momoBalanceLoading && momoStatus === "available" && (
              <TouchableOpacity
                onPress={toggleHideMomoBalance}
                style={styles.hideMomoBtn}
                activeOpacity={0.7}
              >
                {hideMomoBalance ? (
                  <EyelashClosedIcon size={18} color="#D97706" />
                ) : (
                  <EyelashOpenIcon size={18} color="#D97706" />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Skeleton/placeholder while the balance loads in the background */}
          {(momoBalanceLoading || momoStatus === "loading") && (
            <View style={styles.momoStateRow}>
              <ActivityIndicator color="#D97706" size="small" />
              <Text style={styles.momoLoadingText}>Fetching sandbox balance...</Text>
            </View>
          )}

          {!momoBalanceLoading && momoStatus === "available" && (
            <View>
              <Text style={styles.momoBalance}>
                {hideMomoBalance ? "GHS ••••••" : `GHS ${momoBalance}`}
              </Text>
              <Text style={styles.momoSpentSub}>
                GHS {momoMonthlySpent} spent via MoMo this month
              </Text>
              <View style={styles.momoActionRow}>
                <TouchableOpacity
                  onPress={() => fetchMomoBalance(true)}
                  style={styles.momoRefreshBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.momoRefreshText}>Refresh ↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/pay-vendor')}
                  style={styles.momoPayVendorBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.momoPayVendorText}>Pay Vendor →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!momoBalanceLoading && momoStatus === "unavailable" && (
            <View>
              <View style={styles.momoStateRow}>
                <Text style={styles.momoUnavailableIcon}>📡</Text>
                <Text style={styles.momoUnavailableTitle}>
                  Sandbox balance temporarily unavailable
                </Text>
              </View>
              <Text style={styles.momoUnavailableSub}>
                This is normal in sandbox mode. Payments still work.
              </Text>
              <Text style={styles.momoSpentSubYellow}>
                GHS {momoMonthlySpent} spent via MoMo this month
              </Text>
              <View style={styles.momoActionRow}>
                <TouchableOpacity
                  onPress={() => fetchMomoBalance(true)}
                  style={styles.momoRetryBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.momoRetryText}>Retry ↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/pay-vendor')}
                  style={styles.momoPayVendorBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.momoPayVendorText}>Pay Vendor →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Upcoming Bills / Reminders */}
        {upcomingReminders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Bills</Text>
            {upcomingReminders.slice(0, 3).map((reminder: any) => (
              <TouchableOpacity
                key={reminder.id}
                style={[styles.expenseCard, { borderColor: colors.border }]}
                onPress={() => router.push('/(tabs)/reminders')}
                activeOpacity={0.8}
              >
                <View style={styles.expenseLeft}>
                  <View style={styles.iconBox}>
                    <Text style={styles.icon}>📅</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expenseDescription, { color: colors.text }]} numberOfLines={1}>
                      {reminder.title || reminder.description || 'Upcoming bill'}
                    </Text>
                    <Text style={[styles.expenseCategory, { color: colors.textSecondary }]}>
                      Due: {reminder.dueDate || reminder.date || 'Soon'}
                    </Text>
                  </View>
                </View>
                {reminder.amount && (
                  <Text style={[styles.expenseAmount, { color: colors.negative }]}>
                    GHS {parseFloat(reminder.amount || '0').toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
            {upcomingReminders.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/reminders')} activeOpacity={0.7}>
                <Text style={[styles.seeAllText, { textAlign: 'center', paddingVertical: 8 }]}>
                  +{upcomingReminders.length - 3} more →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Spending Activity Chart Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Spending Activity</Text>
              <Text style={styles.chartTotal}>
                GHS {chartSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Timeline Filter Segmented Control */}
            <View style={styles.timelineFilterMini}>
              {(['day', 'week', 'month', 'year'] as const).map((filter) => {
                const labelMap = { day: 'D', week: 'W', month: 'M', year: 'Y' };
                const isActive = chartTimeline === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.timelineMiniBtn, isActive && styles.timelineMiniBtnActive]}
                    onPress={() => setChartTimeline(filter)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timelineMiniText, isActive && styles.timelineMiniTextActive]}>
                      {labelMap[filter]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.chartContainer}>
            {/* Horizontal Grid Lines */}
            <View style={[styles.gridLineHorizontal, { top: paddingVertical }]} />
            <View style={[styles.gridLineHorizontal, { top: chartHeight / 2 }]} />
            <View style={[styles.gridLineHorizontal, { top: chartHeight - paddingVertical }]} />

            {/* Connection Line Segments (Smooth Cosine Wave Curve) */}
            {curveSegments.map((seg, idx) => {
              const lineStyle = getLineStyle(seg.x1, seg.y1, seg.x2, seg.y2);
              return (
                <View
                  key={`line-${idx}`}
                  style={lineStyle}
                />
              );
            })}

            {/* Data Points (Dots) */}
            {points.map((point, idx) => (
              <View
                key={`dot-${idx}`}
                style={[
                  styles.chartDot,
                  {
                    left: point.x - 6,
                    top: point.y - 6,
                  }
                ]}
              />
            ))}
          </View>

          {/* Separated Timeline Labels */}
          <View style={styles.chartDaysContainer}>
            {points.map((point, idx) => (
              <View
                key={`timeline-label-${idx}`}
                style={[
                  styles.chartDayCol,
                  {
                    left: point.x - 20,
                  }
                ]}
              >
                <Text style={styles.chartDayText}>{point.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* By Category Section */}
        {Object.keys(categoryTotals).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By Category</Text>
            {Object.entries(categoryTotals).map(([category, total]: any) => {
              const percentage = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
              return (
                <View key={category} style={styles.categoryRow}>
                  <View style={styles.categoryInfoLeft}>
                    <View style={styles.categoryIconCircle}>
                      <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category] || '📦'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.categoryName}>{category}</Text>
                      <Text style={styles.categoryDetails}>
                        GHS {total.toFixed(2)} spent • {percentage.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.categoryPercentage}>
                    {percentage.toFixed(0)}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent Expenses List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {recentExpenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses yet</Text>
          ) : (
            recentExpenses.map((item) => {
              const isShared = item.isShared || item.type === "shared";
              const isMomo = item.paymentMethod === "MOMO";
              const { cleanDescription, tags } = parseTagsFromDescription(item.description);
              
              return (
                // type+id — personal and shared entries can share numeric ids
                <View key={`${item.type ?? (isShared ? "shared" : "personal")}-${item.id}`} style={[styles.expenseCard, isShared && styles.sharedCard]}>
                  <View style={styles.expenseLeft}>
                    <View style={styles.iconBox}>
                      <Text style={styles.icon}>{CATEGORY_ICONS[isShared ? 'Shared' : item.category] || '📦'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.descRow}>
                        <Text style={styles.expenseDescription} numberOfLines={1}>
                          {cleanDescription || item.category}
                        </Text>
                      </View>
                      <Text style={styles.expenseCategory}>{item.category} • {item.date}</Text>

                      <View style={styles.badgeRow}>
                        {isShared && (
                          <View style={styles.sharedBadge}>
                            <Text style={styles.sharedBadgeText}>👥 Shared</Text>
                          </View>
                        )}
                        <View style={[styles.paymentBadge, isMomo && styles.momoBadge]}>
                          <Text style={[styles.paymentBadgeText, isMomo && styles.momoBadgeText]}>
                            {isMomo ? "📱 MoMo" : "💵 Cash"}
                          </Text>
                        </View>
                      </View>

                      {tags.length > 0 && (
                        <View style={styles.tagsContainer}>
                          {tags.map((tag: string) => (
                            <View key={tag} style={styles.tagPill}>
                              <Text style={styles.tagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[
                    styles.expenseAmount,
                    { color: parseFloat(item.amount || '0') >= 0 ? colors.positive : colors.negative }
                  ]}>
                    {parseFloat(item.amount || '0') >= 0 
                      ? `+GHS ${parseFloat(item.amount || '0').toFixed(2)}` 
                      : `-GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Bottom padding so FAB doesn't cover last item */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowQuickAdd(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Quick Add Modal */}
      <Modal
        visible={showQuickAdd}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQuickAdd(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowQuickAdd(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Quick Add Expense</Text>

            {/* Amount input */}
            <TextInput
              style={styles.quickAmountInput}
              value={quickAmount}
              onChangeText={setQuickAmount}
              placeholder="0.00"
              placeholderTextColor="#8E9AA640"
              keyboardType="decimal-pad"
              autoFocus
            />

            {/* Category selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    quickCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setQuickCategory(cat)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.categoryChipIcon}>{CATEGORY_ICONS[cat]}</Text>
                  <Text style={[
                    styles.categoryChipText,
                    quickCategory === cat && styles.categoryChipTextActive,
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Description */}
            <TextInput
              style={styles.descriptionInput}
              value={quickDescription}
              onChangeText={setQuickDescription}
              placeholder="Description (optional)"
              placeholderTextColor="#8E9AA680"
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowQuickAdd(false);
                  setQuickAmount("");
                  setQuickCategory("Food");
                  setQuickDescription("");
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, savingExpense && { opacity: 0.7 }]}
                onPress={handleQuickAdd}
                disabled={savingExpense}
                activeOpacity={0.85}
              >
                {savingExpense ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.addBtnText}>Add Expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    position: 'relative'
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 13,
    color: '#8E9AA6',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111111',
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Budget Alerts
  alertsSection: {
    marginBottom: 20,
    gap: 8,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  alertCardOver: {
    backgroundColor: "#FF3B300a",
    borderColor: "#FF3B3020",
  },
  alertCardNear: {
    backgroundColor: "#FF95000a",
    borderColor: "#FF950020",
  },
  alertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  alertTitleOver: {
    color: "#FF3B30",
  },
  alertTitleNear: {
    color: "#FF9500",
  },
  alertSub: {
    fontSize: 12,
    color: "#8E9AA6",
  },
  cardChevron: {
    fontSize: 20,
    color: "#8E9AA6",
    marginLeft: 8,
  },

  // Expenses Overview Card
  expensesCard: {
    backgroundColor: '#111111', // Black card backdrop
    borderRadius: 32,
    padding: 24,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  radialCircle1: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#8B5CF6',
    opacity: 0.15,
    top: -120,
    right: -80,
  },
  radialCircle2: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#D97706',
    opacity: 0.1,
    bottom: -90,
    left: -40,
  },
  radialCircle3: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF3B30',
    opacity: 0.05,
    top: 40,
    left: 80,
  },
  expensesCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expensesCardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  amountInteger: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  amountFraction: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  trendBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#8B5CF6', // Purple progress bar
    borderRadius: 3,
  },
  budgetStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetValue: {
    fontSize: 12,
    color: '#8E9AA6',
    fontWeight: '600',
  },
  remainingValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },

  // MoMo Card (Light Premium Redesign)
  momoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F59E0B",
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  momoCardUnavailable: {
    borderColor: "#F59E0B40",
  },
  momoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  hideMomoBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F59E0B10',
    borderWidth: 1,
    borderColor: '#F59E0B20',
  },
  momoCardIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  momoCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#D97706",
  },
  momoStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  momoLoadingText: {
    fontSize: 13,
    color: "#8E9AA6",
  },
  momoBalance: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#D97706",
    marginBottom: 6,
  },
  momoSpentSub: {
    fontSize: 12,
    color: "#8E9AA6",
    marginBottom: 12,
  },
  momoSpentSubYellow: {
    fontSize: 12,
    color: "#D97706",
    marginBottom: 12,
  },
  momoRefreshBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F59E0B10",
    borderWidth: 1,
    borderColor: "#F59E0B30",
  },
  momoRefreshText: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "600",
  },
  momoUnavailableIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  momoUnavailableTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D97706",
  },
  momoUnavailableSub: {
    fontSize: 12,
    color: "#8E9AA6",
    marginBottom: 8,
  },
  momoRetryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F59E0B10",
    borderWidth: 1,
    borderColor: "#F59E0B30",
  },
  momoRetryText: {
    fontSize: 12,
    color: "#D97706",
    fontWeight: "600",
  },
  momoActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  momoPayVendorBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#111111",
  },
  momoPayVendorText: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "700",
  },

  // Spending Activity Chart Card
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartTotal: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginTop: 2,
  },
  timelineFilterMini: {
    flexDirection: 'row',
    backgroundColor: '#F2F4F7',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  timelineMiniBtn: {
    width: 28,
    height: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineMiniBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  timelineMiniText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  timelineMiniTextActive: {
    color: '#111111',
  },
  chartContainer: {
    height: 140,
    position: 'relative',
    marginTop: 4,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#F2F4F7',
  },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 3,
  },
  chartDaysContainer: {
    position: 'relative',
    height: 20,
    marginTop: 10,
  },
  chartDayCol: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  chartDayText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },

  // Category & Recent Sections
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8B5CF6', // Purple see all link
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  categoryInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  categoryDetails: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  categoryPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
    marginRight: 4,
  },

  // Expenses & Cards
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  sharedCard: {
    borderColor: '#8B5CF640',
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  icon: {
    fontSize: 20,
  },
  descRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  expenseCategory: {
    fontSize: 11,
    color: '#8E9AA6',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  sharedBadge: {
    backgroundColor: '#8B5CF610',
    borderWidth: 1,
    borderColor: '#8B5CF625',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  sharedBadgeText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  paymentBadge: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  paymentBadgeText: {
    color: '#8E9AA6',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  momoBadge: {
    backgroundColor: '#F59E0B10',
    borderColor: '#F59E0B25',
  },
  momoBadgeText: {
    color: '#D97706',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
  },
  emptyText: {
    fontSize: 14,
    color: '#8E9AA6',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#111111',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    zIndex: 999,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    textAlign: 'center',
  },

  // Tags styles
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagPill: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  tagText: {
    fontSize: 10,
    color: '#8E9AA6',
    fontWeight: '500',
  },

  // Quick Add Modal (Premium Light Capsule Theme)
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
    textAlign: 'center',
    marginBottom: 16,
  },
  quickAmountInput: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#111111",
    textAlign: "center",
    marginVertical: 12,
    paddingHorizontal: 16,
    height: 60,
  },
  categoryScroll: {
    marginVertical: 12,
  },
  categoryScrollContent: {
    gap: 10,
    paddingHorizontal: 4,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#EAEBEF",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  categoryChipActive: {
    borderColor: "#111111",
    backgroundColor: "#11111105",
  },
  categoryChipIcon: {
    fontSize: 16,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E9AA6",
  },
  categoryChipTextActive: {
    color: "#111111",
  },
  descriptionInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 16,
    color: "#111111",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    marginTop: 8,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  cancelBtnText: {
    fontSize: 15,
    color: "#8E9AA6",
    fontWeight: "600",
  },
  addBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
