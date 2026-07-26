import { useState, useCallback, useMemo } from 'react';
import ExpenseDetailModal from '../../components/ExpenseDetailModal';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expenseAPI, remindersAPI, budgetAPI, momoAPI, categoriesAPI, groupAPI } from '../../services/api';
import { getUserId, getUserName, safeStorage } from '../../services/storage';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import Animated, { FadeOut } from 'react-native-reanimated';
import { getExtendedColors, typography, spacing, radius, duration, FONT_FAMILY } from '../../theme';
import { Button, CategoryIcon, EmptyState, EmptyExpensesArt, Reveal } from '../../components/ui';
import { ExpensesHeroCard } from '../../components/home/ExpensesHeroCard';
import { MomoWalletCard } from '../../components/home/MomoWalletCard';
import { SpendingChart, ChartTimeline } from '../../components/home/SpendingChart';
import { SpendingRing } from '../../components/home/SpendingRing';
import { HomeSkeleton } from '../../components/home/HomeSkeleton';
import { HomeBackdrop } from '../../components/home/HomeBackdrop';
import { TransactionRow } from '../../components/home/TransactionRow';
import { QuickAddModal } from '../../components/home/QuickAddModal';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
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

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

function parseTagsFromDescription(description: string | null | undefined): {
  cleanDescription: string;
  tags: string[];
} {
  if (!description) return { cleanDescription: '', tags: [] };
  const words = description.split(' ');
  const tags = words.filter((w) => w.startsWith('#'));
  const cleanDescription = words.filter((w) => !w.startsWith('#')).join(' ').trim();
  return { cleanDescription, tags };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<{ category: string; isOverBudget: boolean; isNearLimit: boolean; percentage: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState('User');
  const [customCategories, setCustomCategories] = useState<any[]>([]);

  // Splitwise-style net position across all groups
  const [groupNet, setGroupNet] = useState<{ youOwe: number; youAreOwed: number } | null>(null);

  function getCustomEmoji(categoryName: string): string | undefined {
    return customCategories.find((c: any) => c.name === categoryName)?.emoji;
  }

  // Chart timeline switcher state
  const [chartTimeline, setChartTimeline] = useState<ChartTimeline>('week');

  // Notification badge
  const [unreadCount, setUnreadCount] = useState(0);

  // MoMo wallet states
  const [momoBalance, setMomoBalance] = useState('0.00');
  const [momoStatus, setMomoStatus] = useState<'loading' | 'available' | 'unavailable'>('loading');
  const [momoBalanceLoading, setMomoBalanceLoading] = useState(false);
  const [momoMonthlySpent, setMomoMonthlySpent] = useState('0.00');
  const [hideMomoBalance, setHideMomoBalance] = useState(false);

  // Expense detail modal state
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState('Food');
  const [quickDescription, setQuickDescription] = useState('');
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
      const [expensesRes, budgetsRes, remindersRes, recurringRes, categoriesRes] = await Promise.all([
        expenseAPI.getCombinedHistory(userId),
        budgetAPI.getUserBudgets(userId),
        remindersAPI.getUpcomingReminders(userId).catch(() => ({ data: [] })),
        expenseAPI.getRecurringExpenses(userId).catch(() => ({ data: [] })),
        categoriesAPI.getUserCategories(userId).catch(() => ({ data: [] })),
      ]);

      const expenseList = expensesRes.data || [];
      setExpenses(expenseList);
      setBudgets(budgetsRes.data || []);
      setUpcomingReminders(remindersRes.data || []);
      setRecurringExpenses(recurringRes.data || []);
      setCustomCategories(categoriesRes.data || []);

      // Non-blocking: net owe/owed across all groups
      groupAPI.getNetBalance(userId)
        .then((r: any) => setGroupNet({
          youOwe: parseFloat(r.data?.youOwe ?? '0') || 0,
          youAreOwed: parseFloat(r.data?.youAreOwed ?? '0') || 0,
        }))
        .catch(() => setGroupNet(null));

      // Calculate MoMo spending for this month
      const now = new Date();
      const momoTotal = expenseList
        .filter((e: any) => e.paymentMethod === 'MOMO')
        .filter((e: any) => {
          if (!e.date) return false;
          const d = new Date(e.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .filter((e: any) => e.type !== 'income')
        .reduce((sum: number, e: any) => sum + Math.abs(parseFloat(e.amount || '0')), 0);
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
    setMomoStatus('loading');
    try {
      const res = await momoAPI.getBalance();
      const data = res.data;
      if (data.status === 'unavailable') {
        cachedMomoStatus = 'unavailable';
        setMomoStatus('unavailable');
      } else {
        const bal = data.availableBalance != null
          ? String(Math.max(0, parseFloat(data.availableBalance)).toFixed(2))
          : '0.00';
        cachedMomoBalance = bal;
        cachedMomoStatus = 'available';
        lastMomoFetch = now;
        setMomoBalance(bal);
        setMomoStatus('available');
      }
    } catch {
      setMomoStatus('unavailable');
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
          const fire = await shouldFireBudgetAlert(alert.category, 'over');
          if (fire) {
            await addHistoryItem({
              type: 'budget_over',
              title: `Over budget — ${alert.category}`,
              body: `You've used ${alert.percentage.toFixed(0)}% of your ${alert.category} budget this month.`,
              data: { screen: 'budget' },
            });
          }
        } else if (alert.isNearLimit) {
          const fire = await shouldFireBudgetAlert(alert.category, 'near');
          if (fire) {
            await addHistoryItem({
              type: 'budget_near',
              title: `Near limit — ${alert.category}`,
              body: `${alert.percentage.toFixed(0)}% of your ${alert.category} budget used. Slow down!`,
              data: { screen: 'budget' },
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
      showToast('Please enter an amount', 'error');
      return;
    }
    const parsed = parseFloat(quickAmount);
    if (isNaN(parsed) || parsed <= 0) {
      showToast('Please enter a valid amount greater than 0', 'error');
      return;
    }

    setSavingExpense(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      // Quick Add is always an expense — send as negative so history displays correctly
      const negativeAmt = String(-Math.abs(parsed));
      await expenseAPI.createExpense(
        getUserId(),
        negativeAmt,
        quickCategory,
        quickDescription.trim(),
        today,
        'CASH'
      );
      // Reset form
      setQuickAmount('');
      setQuickCategory('Food');
      setQuickDescription('');
      setShowQuickAdd(false);

      // Record in notification history
      await addHistoryItem({
        type: 'expense_added',
        title: 'Expense recorded',
        body: `GHS ${parsed.toFixed(2)} added to ${quickCategory}${quickDescription ? ` — ${quickDescription}` : ''}.`,
        data: { screen: 'history' },
      });
      getUnreadCount().then(setUnreadCount);

      // Refresh data
      await fetchData(false);
      showToast(`GHS ${parsed.toFixed(2)} in ${quickCategory} recorded`, 'success');
    } catch {
      showToast('Could not save expense. Please try again.', 'error');
    } finally {
      setSavingExpense(false);
    }
  }

  // Calculate Dynamic Spending & Budget sums.
  // Every transaction is money going OUT (personal AND shared) unless it is
  // explicitly an income transaction — never infer income from a positive sign.
  const totalSpent = expenses
    .filter(e => e.type !== 'income' && e.paymentMethod !== 'SETTLEMENT')
    .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);
  const totalIncome = expenses
    .filter(e => e.type === 'income' || e.paymentMethod === 'SETTLEMENT')
    .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  const remaining = totalBudget - totalSpent;

  // ── Spending pace (Upgrade: expense velocity tracking) ────────────────────
  // Daily average this month → projected end-of-month total, colored vs budget.
  const paceNow = new Date();
  const dayOfMonth = paceNow.getDate();
  const monthPrefix = `${paceNow.getFullYear()}-${String(paceNow.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(paceNow.getFullYear(), paceNow.getMonth() + 1, 0).getDate();
  const monthSpent = expenses
    .filter(e => e.date && e.date.startsWith(monthPrefix)
      && e.type !== 'income' && e.paymentMethod !== 'SETTLEMENT')
    .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);
  const dailyAvg = dayOfMonth > 0 ? monthSpent / dayOfMonth : 0;
  const projected = dailyAvg * daysInMonth;
  const paceOverBudget = totalBudget > 0 && projected > totalBudget;

  // Greeting. The salutation is time-of-day; the line above it reports what
  // has actually happened today, so the header says something rather than
  // greeting the user twice — and reads as part of the same screen as the
  // hero figure instead of unrelated decoration sitting above it.
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Same date construction the create path uses, so this matches what is stored.
    const todayKey = new Date().toISOString().split('T')[0];
    const loggedToday = expenses.filter(
      (e) => e.date === todayKey && e.type !== 'income' && e.paymentMethod !== 'SETTLEMENT',
    ).length;

    const lead =
      loggedToday === 0
        ? 'Nothing logged today yet'
        : `${loggedToday} expense${loggedToday === 1 ? '' : 's'} logged today`;

    return { salutation, lead };
  }, [expenses]);

  // Group expenses dynamically by Category (spending only)
  const categoryTotals = expenses.reduce((acc: { [key: string]: number }, e) => {
    const category = e.category || 'Other';
    const numAmt = parseFloat(e.amount || '0');
    if (e.type !== 'income') {
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
  function getChartData() {
    const now = new Date();

    const parseLocalDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('-');
      if (parts.length < 3) return new Date(dateStr);
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
          .filter(e => e.date === dateKey && e.type !== 'income')
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
          return ed >= start && ed <= end && e.type !== 'income';
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
          return ed.getFullYear() === yr && (ed.getMonth() + 1) === mo && e.type !== 'income';
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
        return ed.getFullYear() === yr && e.type !== 'income';
      }).reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);

      sum += yearSpend;
      chartBars.push({ day: String(yr), spend: yearSpend });
    }
    return { chartBars, chartSum: sum };
  }

  const { chartBars, chartSum } = getChartData();

  if (error && expenses.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.centered, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Feather name="alert-triangle" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.lg }} />
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>{error}</Text>
        <Button title="Retry" onPress={() => fetchData(true)} fullWidth={false} />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <HomeBackdrop />
      <ScrollView
        // Transparent so the backdrop shows through; the wrapper owns the fill.
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={[typography.label, { color: colors.textSecondary }]}>{greeting.lead}</Text>
            <Text
              style={[typography.headline, { color: colors.text, marginTop: 2 }]}
              accessibilityRole="header"
              numberOfLines={1}
            >
              {greeting.salutation}, {userName}
            </Text>
          </View>
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={[styles.headerActionButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              onPress={() => router.push('/notification-history')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={20} color={colors.text} />
              {unreadCount > 0 && (
                <View style={[styles.bellBadge, { backgroundColor: colors.negative }]}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerActionButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              onPress={() => router.push('/(tabs)/reminders')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Reminders"
            >
              <Feather name="calendar" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.avatarButton, { borderColor: colors.borderSubtle }]}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.neutralBg }]}>
                  <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>
                    {userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* The header above stays put through loading; only the body below
            swaps, so nothing on screen jumps when data lands. */}
        {loading && (
          <Animated.View exiting={FadeOut.duration(duration.fast)}>
            <HomeSkeleton />
          </Animated.View>
        )}

        {!loading && (
        <>
        {/* Budget Alerts */}
        {budgetAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            {budgetAlerts.map((alert) => (
              <TouchableOpacity
                key={alert.category}
                style={[
                  styles.alertCard,
                  {
                    backgroundColor: `${alert.isOverBudget ? colors.negative : colors.warning}12`,
                    borderColor: `${alert.isOverBudget ? colors.negative : colors.warning}35`,
                  },
                ]}
                onPress={() => router.push('/(tabs)/budget')}
                activeOpacity={0.75}
              >
                <Feather
                  name={alert.isOverBudget ? 'alert-octagon' : 'alert-triangle'}
                  size={22}
                  color={alert.isOverBudget ? colors.negative : colors.warning}
                  style={{ marginRight: spacing.md }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: alert.isOverBudget ? colors.negative : colors.warning }]}>
                    {alert.isOverBudget ? 'Over budget' : 'Near limit'} — {alert.category}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {alert.percentage.toFixed(0)}% of your {alert.category} budget used
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Reveal beat="hero">
          <ExpensesHeroCard
            totalSpent={totalSpent}
            totalIncome={totalIncome}
            totalBudget={totalBudget}
            remaining={remaining}
            transactionCount={expenses.length}
          />
        </Reveal>

        {/* Spending pace indicator — needs at least 3 days of data to project */}
        {monthSpent > 0 && dayOfMonth > 3 && (
          <View style={[
            styles.paceCard,
            {
              backgroundColor: `${paceOverBudget ? colors.negative : colors.positive}12`,
              borderColor: `${paceOverBudget ? colors.negative : colors.positive}35`,
            },
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Feather name="trending-up" size={15} color={paceOverBudget ? colors.negative : colors.positive} />
              <Text style={[typography.bodyStrong, { color: paceOverBudget ? colors.negative : colors.positive, flex: 1 }]}>
                Spending pace: GHS {dailyAvg.toFixed(2)}/day — projected GHS {projected.toFixed(0)} this month
              </Text>
            </View>
            {totalBudget > 0 && (
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {paceOverBudget
                  ? `Heads up — that's GHS ${(projected - totalBudget).toFixed(0)} over your GHS ${totalBudget.toFixed(0)} budget`
                  : `On track to stay within your GHS ${totalBudget.toFixed(0)} budget`}
              </Text>
            )}
          </View>
        )}

        {/* Net group position — you owe / you are owed across ALL groups */}
        {groupNet && (groupNet.youOwe > 0 || groupNet.youAreOwed > 0) && (
          <TouchableOpacity
            style={[styles.netCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
            onPress={() => router.push('/(tabs)/groups')}
            activeOpacity={0.8}
          >
            <View style={styles.netCol}>
              <Text style={[typography.label, { color: colors.textSecondary }]}>YOU OWE</Text>
              <Text style={[typography.headline, { color: groupNet.youOwe > 0 ? colors.negative : colors.textSecondary, marginTop: 3 }]}>
                GHS {groupNet.youOwe.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.netDivider, { backgroundColor: colors.border }]} />
            <View style={styles.netCol}>
              <Text style={[typography.label, { color: colors.textSecondary }]}>YOU ARE OWED</Text>
              <Text style={[typography.headline, { color: groupNet.youAreOwed > 0 ? colors.positive : colors.textSecondary, marginTop: 3 }]}>
                GHS {groupNet.youAreOwed.toFixed(2)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <Reveal beat="primary">
          <MomoWalletCard
            status={momoStatus}
            balanceLoading={momoBalanceLoading}
            balance={momoBalance}
            hideBalance={hideMomoBalance}
            monthlySpent={momoMonthlySpent}
            onToggleHide={toggleHideMomoBalance}
            onRefresh={() => fetchMomoBalance(true)}
            onPayVendor={() => router.push('/pay-vendor')}
          />
        </Reveal>

        {/* Upcoming Bills / Reminders */}
        {upcomingReminders.length > 0 && (
          <View style={styles.section}>
            <Text style={[typography.headline, { color: colors.text, marginBottom: spacing.md }]}>Upcoming Bills</Text>
            {upcomingReminders.slice(0, 3).map((reminder: any, idx: number) => (
              <TransactionRow
                key={reminder.id}
                index={idx}
                leading={
                  <View style={[styles.iconBox, { backgroundColor: colors.neutralBg, borderColor: colors.borderSubtle }]}>
                    <Feather name="calendar" size={18} color={colors.textSecondary} />
                  </View>
                }
                title={reminder.title || reminder.description || 'Upcoming bill'}
                subtitle={`Due: ${reminder.dueDate || reminder.date || 'Soon'}`}
                amount={reminder.amount ? `GHS ${parseFloat(reminder.amount || '0').toFixed(2)}` : ''}
                amountColor={colors.negative}
                onPress={() => router.push('/(tabs)/reminders')}
              />
            ))}
            {upcomingReminders.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/reminders')} activeOpacity={0.7}>
                <Text style={[typography.bodyStrong, { color: colors.primary, textAlign: 'center', paddingVertical: spacing.sm }]}>
                  +{upcomingReminders.length - 3} more →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recurring Expenses */}
        {recurringExpenses.length > 0 && (
          <View style={styles.section}>
            <Text style={[typography.headline, { color: colors.text, marginBottom: spacing.md }]}>Recurring Expenses</Text>
            {recurringExpenses.map((item: any, idx: number) => (
              <TransactionRow
                key={`recurring-${item.id}`}
                index={idx}
                leading={
                  <View style={[styles.iconBox, { backgroundColor: colors.neutralBg, borderColor: colors.borderSubtle }]}>
                    <Feather name="repeat" size={18} color={colors.textSecondary} />
                  </View>
                }
                title={item.description || item.category}
                subtitle={item.nextDueDate ? `Next: ${item.nextDueDate}` : 'Repeats automatically'}
                amount={`GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`}
                amountColor={colors.negative}
                badges={
                  <View
                    style={[
                      styles.recurrenceBadge,
                      { backgroundColor: colors.primarySubtle, alignSelf: 'flex-start' },
                    ]}
                  >
                    <Text style={[typography.label, { color: colors.primary }]}>
                      {item.recurrenceType
                        ? item.recurrenceType.charAt(0) + item.recurrenceType.slice(1).toLowerCase()
                        : 'Recurring'}
                    </Text>
                  </View>
                }
                onPress={() => router.push('/(tabs)/history')}
              />
            ))}
          </View>
        )}

        <Reveal beat="secondary">
          <SpendingChart bars={chartBars} sum={chartSum} timeline={chartTimeline} onTimelineChange={setChartTimeline} />
        </Reveal>

        {/* Where the money went — one ring, tap a segment to break it down */}
        {Object.keys(categoryTotals).length > 0 && (
          <Reveal beat="secondary" delay={80} style={styles.section}>
            <Text style={[typography.headline, { color: colors.text, marginBottom: spacing.lg }]}>
              Where it went
            </Text>
            <SpendingRing categoryTotals={categoryTotals} />
          </Reveal>
        )}

        {/* Recent Expenses List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[typography.headline, { color: colors.text }]}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7}>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>See All</Text>
            </TouchableOpacity>
          </View>

          {recentExpenses.length === 0 ? (
            <EmptyState
              icon="file-text"
              illustration={<EmptyExpensesArt />}
              title="No expenses yet"
              body="Log your first one and it'll show up here, along with your spending breakdown."
              ctaLabel="Add an expense"
              onPressCta={() => setShowQuickAdd(true)}
            />
          ) : (
            recentExpenses.map((item, idx) => {
              const isShared = item.isShared || item.type === 'shared';
              const isMomo = item.paymentMethod === 'MOMO';
              const { cleanDescription, tags } = parseTagsFromDescription(item.description);
              const isIncome = item.type === 'income';

              return (
                <TransactionRow
                  // type+id — personal and shared entries can share numeric ids
                  key={`${item.type ?? (isShared ? 'shared' : 'personal')}-${item.id}`}
                  index={idx}
                  leading={
                    <CategoryIcon
                      category={isShared ? 'Shared' : item.category}
                      customEmoji={isShared ? undefined : getCustomEmoji(item.category)}
                      size={44}
                    />
                  }
                  title={cleanDescription || item.category}
                  subtitle={`${item.category} • ${item.date}`}
                  accentBorder={isShared}
                  badges={
                    <View style={styles.badgeRow}>
                      {isShared && (
                        <View style={[styles.pillBadge, { backgroundColor: colors.primarySubtle }]}>
                          <Text style={[typography.label, { color: colors.primary }]}>👥 Shared</Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.pillBadge,
                          { backgroundColor: isMomo ? colors.accentSubtle : colors.neutralBg },
                        ]}
                      >
                        <Text style={[typography.label, { color: isMomo ? colors.accent : colors.textSecondary }]}>
                          {isMomo ? '📱 MoMo' : '💵 Cash'}
                        </Text>
                      </View>
                    </View>
                  }
                  tags={tags}
                  amount={
                    isIncome
                      ? `+GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`
                      : `-GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`
                  }
                  amountColor={isIncome ? colors.positive : colors.negative}
                  onPress={() => { setSelectedExpense(item); setShowExpenseDetail(true); }}
                />
              );
            })
          )}
        </View>

        </>
        )}

        {/* Bottom padding so FAB doesn't cover last item */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.text }]}
        onPress={() => setShowQuickAdd(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Quick add expense"
      >
        <Feather name="plus" size={26} color={colors.background} />
      </TouchableOpacity>

      <QuickAddModal
        visible={showQuickAdd}
        amount={quickAmount}
        category={quickCategory}
        description={quickDescription}
        categories={CATEGORIES}
        saving={savingExpense}
        onAmountChange={setQuickAmount}
        onCategoryChange={setQuickCategory}
        onDescriptionChange={setQuickDescription}
        onClose={() => {
          setShowQuickAdd(false);
          setQuickAmount('');
          setQuickCategory('Food');
          setQuickDescription('');
        }}
        onSubmit={handleQuickAdd}
      />

      <ExpenseDetailModal
        visible={showExpenseDetail}
        expense={selectedExpense}
        onClose={() => { setShowExpenseDetail(false); setSelectedExpense(null); }}
        onDelete={() => { setShowExpenseDetail(false); setSelectedExpense(null); }}
        customCategories={customCategories}
      />

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#ffffff',
    // Deliberately below the type scale's smallest step — this is a count
    // bubble, not running text. Family still comes from the scale so it
    // renders in Inter rather than the OS font.
    fontSize: 9,
    fontFamily: FONT_FAMILY.bold,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Budget Alerts
  alertsSection: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },

  // Spending pace indicator
  paceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },

  // Net group position card
  netCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  netCol: {
    flex: 1,
    alignItems: 'center',
  },
  netDivider: {
    width: 1,
    height: 32,
  },

  section: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  pillBadge: {
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs + 2,
  },
  recurrenceBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
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
});
