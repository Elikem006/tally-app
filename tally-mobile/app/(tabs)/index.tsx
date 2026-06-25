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
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { expenseAPI, budgetAPI } from '../../services/api';
import { getUserId, getUserName } from '../../services/storage';

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
    width: distance,
    height: 2.5,
    backgroundColor: '#8B5CF6',
    transform: [{ rotate: `${angle}rad` }] as any,
    transformOrigin: '0% 50%' as any,
  };
};

export default function HomeScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profileImage, setProfileImage] = useState<string | null>(null);

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
  }

  // 1. Calculate Dynamic Spending & Budget sums
  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  const remaining = totalBudget - totalSpent;

  // Split formatted total spent for premium large-integer / small-decimal layout
  const formattedTotal = totalSpent.toFixed(2);
  const parts = formattedTotal.split('.');
  const integerPart = parseFloat(parts[0]).toLocaleString();
  const decimalPart = parts[1];

  // 2. Group expenses dynamically by Category
  const categoryTotals = expenses.reduce((acc: { [key: string]: number }, e) => {
    const category = e.category || 'Other';
    acc[category] = (acc[category] || 0) + parseFloat(e.amount || '0');
    return acc;
  }, {});

  // 3. Slice recent 3 expenses
  const recentExpenses = expenses.slice(0, 3);

  // 4. Calculate weekly chart data dynamically for current week (Monday - Sunday)
  const getWeeklyData = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailySpend = [0, 0, 0, 0, 0, 0, 0];
    
    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday, etc.
    
    // Align current week starting Monday
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
      // Height defaults to 6% minimum so it renders a small dot rather than vanishing when 0
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
  const chartHeight = 100;
  const paddingVertical = 15;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpend = Math.max(...chartBars.map(b => b.spend), 0);

  const points = chartBars.map((bar, idx) => {
    const x = (chartWidth / 6) * idx;
    const y = maxSpend > 0 
      ? chartHeight - (paddingVertical + (bar.spend / maxSpend) * plotHeight)
      : chartHeight / 2;
    return { x, y, ...bar };
  });

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* Expenses Overview Card */}
      <View style={styles.expensesCard}>
        {/* Concentric Circle Background Pattern (faint and subtle in light theme) */}
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

          {/* Connection Line Segments */}
          {points.map((point, idx) => {
            if (idx === points.length - 1) return null;
            const nextPoint = points[idx + 1];
            const lineStyle = getLineStyle(point.x, point.y, nextPoint.x, nextPoint.y);
            return (
              <View
                key={`line-${idx}`}
                style={lineStyle}
              />
            );
          })}

          {/* Data Points (Dots) & Day Labels */}
          {points.map((point, idx) => (
            <View key={`pt-container-${idx}`}>
              {/* Dot */}
              <View
                style={[
                  styles.chartDot,
                  {
                    left: point.x - 6,
                    top: point.y - 6,
                  }
                ]}
              />
              {/* Label */}
              <View
                style={{
                  position: 'absolute',
                  left: point.x - 20,
                  bottom: -22,
                  width: 40,
                  alignItems: 'center',
                }}
              >
                <Text style={styles.chartDayText}>{point.day}</Text>
              </View>
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

      {/* Empty State Fallback */}
      {expenses.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>💰</Text>
          </View>
          <Text style={styles.emptyText}>No expenses yet</Text>
          <Text style={styles.emptySubtext}>Tap the Add tab to record your first expense</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
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
    backgroundColor: '#ffffff', // Card wrapper (white background)
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
    backgroundColor: '#8B5CF6', // Purple/Violet progress
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
    backgroundColor: '#ffffff', // Card wrapper (white background)
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
    height: 100,
    marginBottom: 25,
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
    color: '#FF3B30', // soft red for transaction spends
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
});