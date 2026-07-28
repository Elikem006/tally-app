import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { budgetAPI, expenseAPI, categoriesAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import { notifyBudgetMilestone } from '../../services/notifications';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { useConfirmModal } from '../../hooks/useConfirmModal';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button, CategoryIcon, EmptyState, EmptyBudgetsArt, Skeleton } from '../../components/ui';
import { BudgetCategoryCard } from '../../components/budget/BudgetCategoryCard';
import { BudgetLimitRow } from '../../components/budget/BudgetLimitRow';

const { width: screenWidth } = Dimensions.get('window');

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

// Tracks "category-tier" milestone notifications already sent this app session,
// so re-visiting the screen doesn't re-fire the same alert
const notifiedCategories = new Set<string>();

function milestoneTier(percentage: number): 50 | 80 | 100 | null {
  if (percentage >= 100) return 100;
  if (percentage >= 80) return 80;
  if (percentage >= 50) return 50;
  return null;
}

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [activeTab, setActiveTab] = useState(0); // 0 = Overview, 1 = Setup
  const scrollViewRef = useRef<ScrollView>(null);

  // Data States
  const [summary, setSummary] = useState<{ [key: string]: any }>({});
  const [customCategories, setCustomCategories] = useState<any[]>([]);

  function getCustomEmoji(categoryName: string): string | undefined {
    return customCategories.find((c: any) => c.name === categoryName)?.emoji;
  }
  const [report, setReport] = useState<any>(null);
  const [limits, setLimits] = useState<{ [key: string]: string }>({
    Food: '',
    Transport: '',
    Entertainment: '',
    Utilities: '',
    Other: '',
  });
  const [spent, setSpent] = useState<{ [key: string]: number }>({
    Food: 0,
    Transport: 0,
    Entertainment: 0,
    Utilities: 0,
    Other: 0,
  });

  // UI / Fetching States
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  const notificationsSentRef = useRef(false);

  // Skeleton on the first load only. This screen refetches on every focus and
  // its loading branch replaces the entire screen, so without the guard every
  // return to the Budget tab blanked it out and rebuilt it from scratch.
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      notificationsSentRef.current = false;
      fetchData(!hasLoadedOnce.current);
      // Reset tab and scroll back to Overview on screen focus
      setActiveTab(0);
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: 0, animated: false });
      }, 50);
      return () => clearTimeout(timer);
    }, [])
  );

  async function fetchData(showLoading = true) {
    if (showLoading) setFetching(true);
    setError(null);
    try {
      const userId = getUserId();
      const [response, reportResponse, categoriesRes] = await Promise.all([
        budgetAPI.getBudgetSummary(userId),
        expenseAPI.getMonthlyReport(userId),
        categoriesAPI.getUserCategories(userId).catch(() => ({ data: [] }))
      ]);
      setCustomCategories(categoriesRes.data || []);
      const data = response.data || {};
      setSummary(data);
      setReport(reportResponse.data || null);

      // Reconstruct Setup states from Summary data
      const newLimits: { [key: string]: string } = {};
      const newSpent: { [key: string]: number } = {};

      CATEGORIES.forEach((category) => {
        const catData = data[category];
        if (catData) {
          newLimits[category] = catData.limit > 0 ? String(catData.limit) : '';
          newSpent[category] = parseFloat(catData.spent) || 0;
        } else {
          newLimits[category] = '';
          newSpent[category] = 0;
        }
      });

      setLimits(newLimits);
      setSpent(newSpent);

      // Milestone notifications at 50% / 80% / 100% — each tier fires once per session
      if (!notificationsSentRef.current) {
        notificationsSentRef.current = true;
        for (const category in data) {
          const tier = milestoneTier(data[category].percentage || 0);
          if (tier === null) continue;
          const key = `${category}-${tier}`;
          if (notifiedCategories.has(key)) continue;
          notifiedCategories.add(key);
          try {
            await notifyBudgetMilestone(category, data[category].percentage);
          } catch {
            // Non-critical — the in-app alert banner still shows
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Pull down to refresh.');
    } finally {
      hasLoadedOnce.current = true;
      if (showLoading) setFetching(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  }

  const handleTabPress = (index: number) => {
    setActiveTab(index);
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  const handleScrollEnd = (e: any) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const page = Math.round(contentOffset / screenWidth);
    setActiveTab(page);
  };

  async function handleSave() {
    const userId = getUserId();
    setLoading(true);
    try {
      for (const category of CATEGORIES) {
        const value = limits[category];
        if (value && value.trim() !== '' && value !== '0') {
          await budgetAPI.setBudget(userId, category, value);
        } else {
          try {
            await budgetAPI.deleteBudget(userId, category);
          } catch { }
        }
      }
      showToast('Your budgets have been saved!', 'success');
      await fetchData(false);
      handleTabPress(0); // Transition back to Overview to view updated stats
    } catch (error: any) {
      showToast('Failed to save budgets. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    showConfirm({
      icon: '🗑️',
      title: 'Reset All Budgets',
      message: 'Clear all budget limits? This cannot be undone.',
      confirmText: 'Reset',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        setLimits({ Food: '', Transport: '', Entertainment: '', Utilities: '', Other: '' });
        const userId = getUserId();
        for (const category of CATEGORIES) {
          try {
            await budgetAPI.deleteBudget(userId, category);
          } catch { }
        }
        showToast('Budgets cleared successfully', 'success');
        await fetchData(false);
        handleTabPress(0);
      },
    });
  }

  if (fetching) {
    // Mirrors the real layout below — segmented header, then the overview
    // card — at the same sizes and positions, so nothing shifts when the
    // data lands. Previously a bare spinner on an otherwise blank screen.
    return (
      <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, spacing.md) }]}>
        <View style={styles.headerContainer}>
          <Skeleton height={48} borderRadius={radius.xl} style={{ marginHorizontal: spacing.lg }} />
        </View>
        <View style={styles.scrollContent}>
          <Skeleton height={190} borderRadius={radius.xl} style={{ marginBottom: spacing.lg }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={118} borderRadius={radius.lg} style={{ marginBottom: spacing.md }} />
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="alert-triangle" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.lg }} />
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>{error}</Text>
        <Button title="Retry" onPress={() => fetchData(true)} fullWidth={false} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Segmented control header */}
      <View style={[styles.headerContainer, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, spacing.md) }]}>
        <View style={[styles.tabHeaderContainer, { backgroundColor: colors.neutralBg }]}>
          <TouchableOpacity
            style={[styles.tabHeaderButton, activeTab === 0 && { backgroundColor: colors.surfaceElevated }]}
            onPress={() => handleTabPress(0)}
            activeOpacity={0.7}
          >
            <Text style={[typography.bodyCompact, { color: activeTab === 0 ? colors.text : colors.textSecondary }]}>
              Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabHeaderButton, activeTab === 1 && { backgroundColor: colors.surfaceElevated }]}
            onPress={() => handleTabPress(1)}
            activeOpacity={0.7}
          >
            <Text style={[typography.bodyCompact, { color: activeTab === 1 ? colors.text : colors.textSecondary }]}>
              Setup
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Horizontal paging ScrollView */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.horizontalScrollView}
        scrollEventThrottle={16}
      >
        {/* Slide 0: Overview */}
        <View style={{ width: screenWidth }}>
          <ScrollView
            style={[styles.verticalScrollView, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          >
            {Object.keys(summary).length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surfaceElevated }]}>
                <EmptyState
                  icon="pie-chart"
                  illustration={<EmptyBudgetsArt />}
                  title="No budgets set yet"
                  body="Set your monthly limits first to track overview statistics"
                  ctaLabel="Set up budgets"
                  onPressCta={() => handleTabPress(1)}
                />
              </View>
            ) : (
              <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">Budget Overview</Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
                  Your spending this month vs your limits
                </Text>

                {/* ── Budget Analysis Insights ── */}
                {report && (() => {
                  const currentTotal = parseFloat(report.currentMonth) || 0;
                  const pctChange = parseFloat(report.percentageChange) || 0;
                  const hasLastMonth = parseFloat(report.previousMonth) > 0;
                  const isUp = pctChange > 0;
                  const highCat = report.highestCategory;
                  const perf: any[] = report.budgetPerformance || [];
                  const goodCount = perf.filter((p: any) => p.status === 'good').length;
                  const hasOver = perf.some((p: any) => p.status === 'over');
                  const hasWarning = perf.some((p: any) => p.status === 'warning');
                  const healthColor = hasOver ? colors.negative : hasWarning ? colors.warning : colors.positive;

                  return (
                    <View style={{ marginBottom: spacing.sm }}>
                      {/* Monthly Summary */}
                      <View style={[styles.insightCard, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
                        <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Monthly Summary</Text>
                        <Text style={[typography.title, { color: colors.text }]}>GHS {currentTotal.toFixed(2)}</Text>
                        {hasLastMonth ? (
                          <View style={styles.changeRow}>
                            <Feather name={isUp ? 'arrow-up' : 'arrow-down'} size={14} color={isUp ? colors.negative : colors.positive} />
                            <Text style={[typography.caption, { color: isUp ? colors.negative : colors.positive, fontFamily: typography.bodyStrong.fontFamily }]}>
                              {Math.abs(pctChange).toFixed(1)}% {isUp ? 'more' : 'less'} than last month
                            </Text>
                          </View>
                        ) : (
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>First month of tracking</Text>
                        )}
                      </View>

                      {/* Top Category */}
                      {highCat && highCat.category && (
                        <View style={[styles.insightCard, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
                          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Top Spending Category</Text>
                          <View style={styles.topCatRow}>
                            <CategoryIcon category={highCat.category} customEmoji={getCustomEmoji(highCat.category)} size={40} />
                            <View>
                              <Text style={[typography.bodyStrong, { color: colors.text }]}>{highCat.category}</Text>
                              <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>
                                GHS {parseFloat(highCat.amount).toFixed(2)}
                              </Text>
                            </View>
                          </View>
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                            You spent the most on {highCat.category} this month.
                          </Text>
                        </View>
                      )}

                      {/* Budget Health */}
                      {perf.length > 0 && (
                        <View style={[styles.insightCard, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
                          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Budget Health</Text>
                          <Text style={[typography.title, { color: healthColor }]}>{goodCount}/{perf.length} categories on track</Text>
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                            {hasOver
                              ? "You've exceeded your budget in some categories."
                              : hasWarning
                                ? 'Some categories are getting close to their limit.'
                                : 'Great job — all budgets are under control!'}
                          </Text>
                        </View>
                      )}

                      <Text style={[typography.headline, { color: colors.text, marginTop: spacing.sm, marginBottom: spacing.md }]}>Your Budgets</Text>
                    </View>
                  );
                })()}

                {Object.entries(summary).map(([category, data]: [string, any], idx: number) => (
                  <BudgetCategoryCard
                    key={category}
                    index={idx}
                    category={category}
                    customEmoji={getCustomEmoji(category)}
                    spent={parseFloat(data.spent || 0)}
                    limit={parseFloat(data.limit || 0)}
                    percentage={Math.min(data.percentage || 0, 100)}
                    isOverBudget={data.isOverBudget}
                    isNearLimit={data.isNearLimit}
                  />
                ))}

                <TouchableOpacity
                  style={[styles.reportButton, { borderColor: colors.border }]}
                  onPress={() => router.push('/(tabs)/report')}
                  activeOpacity={0.8}
                >
                  <Text style={[typography.bodyStrong, { color: colors.primary }]}>📈 View Monthly Report</Text>
                </TouchableOpacity>

                <Button title="Edit Budgets" onPress={() => handleTabPress(1)} variant="secondary" style={{ marginTop: spacing.md }} />
              </View>
            )}
          </ScrollView>
        </View>

        {/* Slide 1: Setup */}
        <View style={{ width: screenWidth }}>
          <ScrollView
            style={[styles.verticalScrollView, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">Monthly Budgets</Text>
              <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
                Set how much you want to spend per category this month
              </Text>

              <View style={{ marginBottom: spacing.md }}>
                {CATEGORIES.map((category, idx) => (
                  <BudgetLimitRow
                    key={category}
                    index={idx}
                    category={category}
                    customEmoji={getCustomEmoji(category)}
                    spent={spent[category] || 0}
                    value={limits[category]}
                    onChangeValue={(text) => setLimits((prev) => ({ ...prev, [category]: text }))}
                  />
                ))}
              </View>

              <Button title="Reset All Budgets" onPress={resetAll} variant="danger" style={{ marginBottom: spacing.sm }} />
              <Button title="Save Budgets" onPress={handleSave} loading={loading} />
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
      {ConfirmModalComponent}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerContainer: {
    paddingBottom: spacing.sm,
  },
  tabHeaderContainer: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    padding: 4,
    marginHorizontal: spacing.lg,
  },
  tabHeaderButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  horizontalScrollView: { flex: 1 },
  verticalScrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  insightCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  topCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  reportButton: {
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
  },
  // EmptyState brings its own vertical rhythm — this only supplies the card.
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
  },
});
