import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import { notifyBudgetWarning } from '../../services/notifications';

const { width: screenWidth } = Dimensions.get('window');

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState(0); // 0 = Overview, 1 = Setup
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Data States
  const [summary, setSummary] = useState<{ [key: string]: any }>({});
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
  const [error, setError] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  
  const notificationsSentRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      notificationsSentRef.current = false;
      fetchData(true);
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
      const response = await budgetAPI.getBudgetSummary(userId);
      const data = response.data || {};
      setSummary(data);

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

      // Trigger local push notifications for limits warning best-effort
      if (!notificationsSentRef.current) {
        notificationsSentRef.current = true;
        for (const category in data) {
          if (data[category].isNearLimit || data[category].isOverBudget) {
            try {
              await notifyBudgetWarning(category, data[category].percentage);
            } catch (notifyErr) {
              console.log('Error triggering budget warning notification:', notifyErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.log('Error fetching budget summary:', err);
      setError(err?.message || String(err));
    } finally {
      if (showLoading) setFetching(false);
    }
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
          } catch {}
        }
      }
      Alert.alert('Success', 'Your budgets have been saved!');
      await fetchData(false);
      handleTabPress(0); // Transition back to Overview to view updated stats
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save budgets. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    Alert.alert('Reset All Budgets', 'Clear all budget limits?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setLimits({ Food: '', Transport: '', Entertainment: '', Utilities: '', Other: '' });
          const userId = getUserId();
          for (const category of CATEGORIES) {
            try {
              await budgetAPI.deleteBudget(userId, category);
            } catch {}
          }
          await fetchData(false);
          handleTabPress(0);
        },
      },
    ]);
  }

  function getBarColor(isOverBudget: boolean, isNearLimit: boolean) {
    if (isOverBudget) return '#FF3B30'; // Red
    if (isNearLimit) return '#FF9500'; // Orange
    return '#8B5CF6'; // Violet / Purple
  }

  if (fetching) {
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
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Premium segmented control header */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.tabHeaderContainer}>
          <TouchableOpacity
            style={[styles.tabHeaderButton, activeTab === 0 && styles.tabHeaderButtonActive]}
            onPress={() => handleTabPress(0)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabHeaderButtonText, activeTab === 0 && styles.tabHeaderButtonTextActive]}>
              Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabHeaderButton, activeTab === 1 && styles.tabHeaderButtonActive]}
            onPress={() => handleTabPress(1)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabHeaderButtonText, activeTab === 1 && styles.tabHeaderButtonTextActive]}>
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
            style={styles.verticalScrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {Object.keys(summary).length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Text style={styles.emptyIcon}>📊</Text>
                </View>
                <Text style={styles.emptyText}>No budgets set yet</Text>
                <Text style={styles.emptySubtext}>Set your monthly limits first to track overview statistics</Text>
                <TouchableOpacity
                  style={styles.setupLinkButton}
                  onPress={() => handleTabPress(1)}
                >
                  <Text style={styles.setupLinkButtonText}>Set Up Budgets</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mainCard}>
                <Text style={styles.cardHeaderTitle}>Budget Overview</Text>
                <Text style={styles.subtitle}>Your spending this month vs your limits</Text>

                {Object.entries(summary).map(([category, data]: [string, any]) => {
                  const percentage = Math.min(data.percentage || 0, 100);
                  const barColor = getBarColor(data.isOverBudget, data.isNearLimit);

                  return (
                    <View key={category} style={styles.categoryCard}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardLeft}>
                          <View style={styles.iconCircle}>
                            <Text style={styles.icon}>{CATEGORY_ICONS[category] || '📦'}</Text>
                          </View>
                          <Text style={styles.categoryTitle}>{category}</Text>
                        </View>
                        
                        {data.isOverBudget && (
                          <View style={styles.warningBadge}>
                            <Text style={styles.warningText}>Over!</Text>
                          </View>
                        )}
                        {data.isNearLimit && !data.isOverBudget && (
                          <View style={styles.nearBadge}>
                            <Text style={styles.nearText}>Near limit</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.progressContainer}>
                        <View style={styles.progressBackground}>
                          <View
                            style={[
                              styles.progressBar,
                              {
                                width: `${percentage}%` as any,
                                backgroundColor: barColor,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.percentage, { color: barColor }]}>
                          {(data.percentage || 0).toFixed(0)}%
                        </Text>
                      </View>

                      <View style={styles.amountRow}>
                        <Text style={styles.spentText}>
                          GHS {parseFloat(data.spent || 0).toFixed(2)} spent
                        </Text>
                        <Text style={styles.limitText}>
                          of GHS {parseFloat(data.limit || 0).toFixed(2)}
                        </Text>
                      </View>

                      <Text style={[
                        styles.remaining,
                        data.isOverBudget && styles.remainingOver
                      ]}>
                        {data.isOverBudget
                          ? `GHS ${(parseFloat(data.spent || 0) - parseFloat(data.limit || 0)).toFixed(2)} over budget`
                          : `GHS ${(parseFloat(data.limit || 0) - parseFloat(data.spent || 0)).toFixed(2)} remaining`}
                      </Text>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleTabPress(1)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editButtonText}>Edit Budgets</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Slide 1: Setup */}
        <View style={{ width: screenWidth }}>
          <ScrollView
            style={styles.verticalScrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.mainCard}>
              <Text style={styles.cardHeaderTitle}>Monthly Budgets</Text>
              <Text style={styles.subtitle}>Set how much you want to spend per category this month</Text>

              <View style={styles.categoryList}>
                {CATEGORIES.map((category) => {
                  const categorySpent = spent[category] || 0;
                  const isInputFocused = focusedInput === category;

                  return (
                    <View key={category} style={styles.categoryCapsule}>
                      <View style={[styles.categoryLeft, { flex: 1, marginRight: 12 }]}>
                        <View style={styles.categoryIconCircle}>
                          <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.categoryLabelName}>{category}</Text>
                          <Text style={styles.categorySpentText} numberOfLines={1}>
                            Spent: GHS {(Number(categorySpent) || 0).toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      <View style={[
                        styles.inputContainer,
                        isInputFocused && styles.inputContainerFocused
                      ]}>
                        <Text style={styles.currency}>GHS</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="0.00"
                          placeholderTextColor="#C8D2DC"
                          value={limits[category]}
                          onChangeText={(text) =>
                            setLimits((prev) => ({ ...prev, [category]: text }))
                          }
                          onFocus={() => setFocusedInput(category)}
                          onBlur={() => setFocusedInput(null)}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.resetButton} onPress={resetAll}>
                <Text style={styles.resetButtonText}>Reset All Budgets</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Save Budgets</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
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
  headerContainer: {
    backgroundColor: '#F2F4F7',
    paddingBottom: 8,
  },
  tabHeaderContainer: {
    flexDirection: 'row',
    backgroundColor: '#EAEBEF',
    borderRadius: 24,
    padding: 4,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E2E4E8',
  },
  tabHeaderButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  tabHeaderButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabHeaderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8E9AA6',
  },
  tabHeaderButtonTextActive: {
    color: '#111111',
  },
  horizontalScrollView: {
    flex: 1,
  },
  verticalScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 24,
    lineHeight: 18,
  },
  
  // Overview Tab Styles
  categoryCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  icon: {
    fontSize: 18,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  warningBadge: {
    backgroundColor: '#FF3B3012',
    borderWidth: 1,
    borderColor: '#FF3B3030',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  warningText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
  },
  nearBadge: {
    backgroundColor: '#FF950012',
    borderWidth: 1,
    borderColor: '#FF950030',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  nearText: {
    color: '#FF9500',
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  progressBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#EAEBEF',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  percentage: {
    fontSize: 13,
    fontWeight: 'bold',
    width: 36,
    textAlign: 'right',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  spentText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111111',
  },
  limitText: {
    fontSize: 13,
    color: '#8E9AA6',
  },
  remaining: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34A853',
    marginTop: 2,
  },
  remainingOver: {
    color: '#FF3B30',
  },
  editButton: {
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  editButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Setup Tab Styles
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryList: {
    marginBottom: 16,
  },
  categoryCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
    fontSize: 20,
  },
  categoryLabelName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  categorySpentText: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    height: 40,
  },
  inputContainerFocused: {
    borderColor: '#111111',
  },
  currency: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    marginRight: 6,
  },
  input: {
    color: '#111111',
    fontSize: 14,
    fontWeight: 'bold',
    width: 60,
    padding: 0,
    textAlign: 'right',
  },
  resetButton: {
    borderWidth: 1,
    borderColor: '#E05C5C',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#E05C5C10',
  },
  resetButtonText: {
    color: '#E05C5C',
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#111111',
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Empty State Styles
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
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
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupLinkButton: {
    backgroundColor: '#111111',
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  setupLinkButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  
  // General / Error Styles
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
});
