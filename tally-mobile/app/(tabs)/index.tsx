import { useState, useCallback } from 'react';
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
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { expenseAPI, remindersAPI, budgetAPI } from '../../services/api';
import { getUserId, getUserName } from '../../services/storage';
import { Feather } from '@expo/vector-icons';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

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

const CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Other"];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<{ category: string; isOverBudget: boolean; isNearLimit: boolean; percentage: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");
  const [quickDescription, setQuickDescription] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      loadProfileImage();
    }, [])
  );

  async function loadProfileImage() {
    try {
      const userId = getUserId();
      const saved = await AsyncStorage.getItem(`profile_image_${userId}`);
      if (saved) {
        setProfileImage(saved);
      } else {
        setProfileImage(null);
      }
    } catch (e) {
      console.log('Error loading profile image on home screen:', e);
    }
  }

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes] = await Promise.all([
        expenseAPI.getUserExpenses(userId),
        budgetAPI.getUserBudgets(userId)
      ]);
      setExpenses(expensesRes.data || []);
      setBudgets(budgetsRes.data || []);
    } catch (err: any) {
      console.log('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please check your connection.');
    } finally {
      setLoading(false);
    }

    // Fetch upcoming reminders independently — failure won't break the home screen
    try {
      const remindersResponse = await remindersAPI.getUpcomingReminders(getUserId());
      setUpcomingReminders(remindersResponse.data || []);
    } catch (error) {
      console.log("Error fetching reminders:", error);
    }

    // Fetch budget alerts independently
    try {
      const userId = getUserId();
      const budgetRes = await budgetAPI.getBudgetSummary(userId);
      const summary = budgetRes.data;
      const alerts = Object.entries(summary)
        .filter(([, data]: any) => data.isOverBudget || data.isNearLimit)
        .map(([category, data]: any) => ({
          category,
          isOverBudget: data.isOverBudget,
          isNearLimit: data.isNearLimit,
          percentage: data.percentage,
        }));
      setBudgetAlerts(alerts);
    } catch (error) {
      console.log("Error fetching budget alerts:", error);
    }
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
      await expenseAPI.createExpense(
        getUserId(),
        quickAmount.trim(),
        quickCategory,
        quickDescription.trim(),
        today,
      );
      // Reset form
      setQuickAmount("");
      setQuickCategory("Food");
      setQuickDescription("");
      setShowQuickAdd(false);
      // Refresh data
      await fetchData();
      Alert.alert("✅ Added", `GHS ${parsed.toFixed(2)} in ${quickCategory} recorded.`);
    } catch (error) {
      Alert.alert("Error", "Could not save expense. Please try again.");
      console.log("Quick add error:", error);
    } finally {
      setSavingExpense(false);
    }
  }

  // Calculate Dynamic Spending & Budget sums
  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  const remaining = totalBudget - totalSpent;

  // Split formatted total spent for premium large-integer / small-decimal layout
  const formattedTotal = totalSpent.toFixed(2);
  const parts = formattedTotal.split('.');
  const integerPart = parseFloat(parts[0]).toLocaleString();
  const decimalPart = parts[1];

  // Group expenses dynamically by Category
  const categoryTotals = expenses.reduce((acc: { [key: string]: number }, e) => {
    const category = e.category || 'Other';
    acc[category] = (acc[category] || 0) + parseFloat(e.amount || '0');
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

  // Calculate weekly chart data dynamically for current week (Monday - Sunday)
  const getWeeklyData = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailySpend = [0, 0, 0, 0, 0, 0, 0];
    
    const now = new Date();
    const currentDay = now.getDay();
    
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    let weeklySum = 0;

    expenses.forEach(e => {
      if (!e.date) return;
      const eDate = new Date(e.date);
      if (eDate >= monday && eDate <= sunday) {
        let dayIdx = eDate.getDay() - 1;
        if (dayIdx === -1) dayIdx = 6; // Sunday
        const amt = parseFloat(e.amount) || 0;
        dailySpend[dayIdx] += amt;
        weeklySum += amt;
      }
    });

    const maxSpend = Math.max(...dailySpend, 0);

    const chartBars = days.map((day, idx) => {
      const spend = dailySpend[idx];
      const heightPercentage = maxSpend > 0 ? (spend / maxSpend) * 94 + 6 : 6;
      return {
        day,
        spend,
        heightPercentage
      };
    });

    return { chartBars, weeklySum };
  };

  const { chartBars, weeklySum } = getWeeklyData();

  const { width: screenWidth } = Dimensions.get('window');
  const chartWidth = screenWidth - 88; // 20*2 screen horizontal padding + 24*2 card padding
  const chartHeight = 140;
  const paddingVertical = 25;
  const chartInset = 16;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpendVal = Math.max(...chartBars.map(b => b.spend), 0);

  const points = chartBars.map((bar, idx) => {
    const x = chartInset + (plotWidth / 6) * idx;
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.welcomeText}>Welcome back 👋</Text>
            <Text style={styles.greetingText}>Good day, {getUserName()}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {getUserName().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Budget Alerts */}
        {budgetAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            {budgetAlerts.map((alert) => (
              <View
                key={alert.category}
                style={[
                  styles.alertCard,
                  alert.isOverBudget ? styles.alertCardOver : styles.alertCardNear,
                ]}
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
              </View>
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

          <View style={styles.trendRow}>
            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>
                {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
              </Text>
            </View>
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

        {/* Weekly Expenses Chart Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Weekly Expenses</Text>
            <Text style={styles.chartTotal}>
              GHS {weeklySum.toLocaleString()}
            </Text>
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

          {/* Separated Days of the Week Component */}
          <View style={styles.chartDaysContainer}>
            {points.map((point, idx) => (
              <View
                key={`day-label-${idx}`}
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
                      <View style={styles.categoryProgressBarBg}>
                        <View style={[styles.categoryProgressBarFill, { width: `${percentage}%` }]} />
                      </View>
                    </View>
                  </View>
                  <View style={styles.categoryInfoRight}>
                    <Text style={styles.categoryAmount}>GHS {total.toFixed(2)}</Text>
                    <Text style={styles.categoryPercentText}>{percentage.toFixed(0)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent Expenses Section */}
        {recentExpenses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Expenses</Text>
            {recentExpenses.map((expense) => (
              <View key={expense.id} style={styles.expenseRow}>
                <View style={[styles.expenseLeft, { flex: 1, marginRight: 12 }]}>
                  <View style={styles.expenseIconCircle}>
                    <Text style={styles.expenseIcon}>{CATEGORY_ICONS[expense.category] || '📦'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseName} numberOfLines={1}>
                      {expense.description || expense.category}
                    </Text>
                    <Text style={styles.expenseDate}>{expense.date}</Text>
                  </View>
                </View>
                <Text style={styles.expenseAmount}>
                  -GHS {parseFloat(expense.amount).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming Bills Section */}
        {upcomingReminders.length > 0 && (() => {
          const today = new Date().toISOString().split("T")[0];
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Bills 🔔</Text>
              {upcomingReminders.map((reminder) => {
                const isUrgent = reminder.dueDate === today || reminder.dueDate === tomorrow;
                return (
                  <View
                    key={reminder.id}
                    style={[styles.reminderCard, isUrgent && styles.reminderCardUrgent]}
                  >
                    <View style={styles.reminderIcon}>
                      <Text style={{ fontSize: 18 }}>🔔</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reminderTitle}>{reminder.title}</Text>
                      {reminder.dueDate && (
                        <Text style={styles.reminderDate}>Due: {reminder.dueDate}</Text>
                      )}
                    </View>
                    {reminder.isPaid || reminder.paid ? (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>Paid</Text>
                      </View>
                    ) : reminder.amount != null ? (
                      <Text style={styles.reminderAmount}>
                        GHS {parseFloat(reminder.amount).toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Empty State Fallback */}
        {expenses.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>💰</Text>
            </View>
            <Text style={styles.emptyText}>No expenses yet</Text>
            <Text style={styles.emptySubtext}>Start tracking your spending by adding your first expense</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push("/(tabs)/add")}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyButtonText}>Add Your First Expense</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom padding so FAB or Tab doesn't cover last item */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating "+" button */}
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

            {/* Amount */}
            <TextInput
              style={styles.amountInput}
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
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, savingExpense && { opacity: 0.7 }]}
                onPress={handleQuickAdd}
                disabled={savingExpense}
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
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
  },
  expensesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  radialCircle1: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1.5,
    borderColor: 'rgba(142, 154, 166, 0.03)',
    top: -50,
    right: -50,
    zIndex: 0,
  },
  radialCircle2: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1.5,
    borderColor: 'rgba(142, 154, 166, 0.02)',
    top: -100,
    right: -100,
    zIndex: 0,
  },
  radialCircle3: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 230,
    borderWidth: 1.5,
    borderColor: 'rgba(142, 154, 166, 0.015)',
    top: -150,
    right: -150,
    zIndex: 0,
  },
  expensesCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 1,
  },
  expensesCardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
    zIndex: 1,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
  },
  amountInteger: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111111',
  },
  amountFraction: {
    fontSize: 22,
    color: '#8E9AA6',
    fontWeight: '600',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 1,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  trendText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  progressContainer: {
    marginBottom: 16,
    zIndex: 1,
  },
  progressBg: {
    height: 8,
    backgroundColor: '#F2F4F7',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  budgetStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  budgetValue: {
    fontSize: 13,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  remainingValue: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
  },
  chartTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  chartContainer: {
    position: 'relative',
    height: 140,
  },
  chartDaysContainer: {
    position: 'relative',
    height: 20,
    marginTop: 12,
  },
  chartDayCol: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
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
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  chartDayText: {
    fontSize: 10,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 12,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
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
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryName: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryProgressBarBg: {
    height: 4,
    backgroundColor: '#F2F4F7',
    borderRadius: 2,
    overflow: 'hidden',
    width: '80%',
  },
  categoryProgressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#8B5CF6',
  },
  categoryInfoRight: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  categoryPercentText: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  expenseRow: {
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  expenseIcon: {
    fontSize: 18,
  },
  expenseName: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
  },
  expenseDate: {
    fontSize: 12,
    color: '#8E9AA6',
    marginLeft: 4,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E9AA6',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#111111',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
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
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#EAEBEF',
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
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
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
  },
  // Upcoming reminders styles
  reminderCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  reminderCardUrgent: {
    borderColor: "#FF9500",
  },
  reminderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF5EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  reminderDate: {
    fontSize: 12,
    color: "#8E9AA6",
    marginTop: 2,
  },
  reminderAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111111",
  },
  paidBadge: {
    backgroundColor: "#F2F4F7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paidBadgeText: {
    fontSize: 12,
    color: "#8E9AA6",
    fontWeight: "600",
  },
  // Alert Section styles
  alertsSection: {
    marginBottom: 16,
    gap: 8,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  alertCardOver: {
    backgroundColor: "#FFEBEB",
    borderColor: "#FF3B30",
  },
  alertCardNear: {
    backgroundColor: "#FFF5EB",
    borderColor: "#FF9500",
  },
  alertIcon: {
    fontSize: 20,
  },
  alertTitle: {
    fontSize: 13,
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
  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 99,
  },
  fabText: {
    fontSize: 28,
    color: "#ffffff",
    fontWeight: "bold",
    lineHeight: 32,
  },
  // Modal styles
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
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
    marginBottom: 16,
    textAlign: "center",
  },
  amountInput: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#111111",
    textAlign: "center",
    paddingVertical: 12,
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: "#EAEBEF",
  },
  categoryScroll: {
    marginBottom: 20,
  },
  categoryScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  categoryChipActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  categoryChipIcon: { fontSize: 16 },
  categoryChipText: {
    fontSize: 13,
    color: "#8E9AA6",
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  descriptionInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    color: "#111111",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    color: "#8E9AA6",
    fontWeight: "600",
  },
  addBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: "#111111",
    alignItems: "center",
  },
  addBtnText: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "bold",
  },
});
