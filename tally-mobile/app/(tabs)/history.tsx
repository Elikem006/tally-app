import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path, Circle } from 'react-native-svg';
import { expenseAPI, budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

// Helper for timezone-independent date parsing
const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length < 3) return new Date(dateStr);
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

// Helper for three-quarter circle progress gauges (from 135 deg to 405 deg)
const getGaugePath = (cx: number, cy: number, r: number, progress: number) => {
  if (progress <= 0) return '';
  const startDeg = 135;
  const totalDeg = 270;
  const endDeg = startDeg + progress * totalDeg;

  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const largeArcFlag = progress * totalDeg > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
};

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Redesigned interactive states
  const [activeTimeFilter, setActiveTimeFilter] = useState<'today' | 'week' | 'month' | 'year'>('month');

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes] = await Promise.all([
        expenseAPI.getUserExpenses(userId),
        budgetAPI.getUserBudgets(userId),
      ]);
      setExpenses(expensesRes.data || []);
      setBudgets(budgetsRes.data || []);
    } catch (err: any) {
      console.log('Error fetching history data:', err);
      setError('Failed to load history data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(expenseId: string) {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await expenseAPI.deleteExpense(expenseId);
              setExpenses(expenses.filter((e) => e.id !== expenseId));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete expense');
            }
          },
        },
      ]
    );
  }

  // Filter based on Time and Search Query (Timezone independent local dates)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;

      // 1. Time filtering
      const expenseDate = parseLocalDate(e.date);
      expenseDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      let matchesTime = false;
      if (activeTimeFilter === 'today') {
        matchesTime = e.date === todayStr;
      } else if (activeTimeFilter === 'week') {
        const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
        const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() + distanceToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        matchesTime = expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      } else if (activeTimeFilter === 'month') {
        const currentYearMonth = `${year}-${month}`; // YYYY-MM
        matchesTime = e.date.startsWith(currentYearMonth);
      } else if (activeTimeFilter === 'year') {
        const currentYear = year.toString();
        matchesTime = e.date.startsWith(currentYear);
      }

      // 2. Search query filtering
      const desc = (e.description || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = desc.includes(query) || cat.includes(query);

      return matchesTime && matchesSearch;
    });
  }, [expenses, activeTimeFilter, searchQuery]);

  // Sum of limits of all user budgets
  const totalBudget = useMemo(() => {
    return budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  }, [budgets]);

  // Dynamically scale budget based on selected time filter (for Total Spend comparison)
  const scaledBudget = useMemo(() => {
    const baseBudget = totalBudget; // Strictly reflects user's budget settings! No hardcoded fallback.
    if (activeTimeFilter === 'today') {
      return parseFloat((baseBudget / 30).toFixed(2));
    }
    if (activeTimeFilter === 'week') {
      return parseFloat((baseBudget * 7 / 30).toFixed(2));
    }
    if (activeTimeFilter === 'month') {
      return baseBudget;
    }
    // year
    return baseBudget * 12;
  }, [totalBudget, activeTimeFilter]);

  const totalSpent = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
  }, [filteredExpenses]);

  // Progress values for gauges (safe division)
  const spendProgress = useMemo(() => {
    return scaledBudget > 0 ? Math.min(totalSpent / scaledBudget, 1.0) : 0;
  }, [totalSpent, scaledBudget]);

  const balanceProgress = 1.0; // Solid progress for static Balance gauge

  const groupExpensesByDate = (list: any[]) => {
    const groups: { [key: string]: any[] } = {};
    list.forEach((e) => {
      if (!e.date) return;
      const dateStr = e.date;
      const todayStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let header = dateStr;
      if (dateStr === todayStr) {
        header = 'Today';
      } else if (dateStr === yesterdayStr) {
        header = 'Yesterday';
      } else {
        try {
          const d = new Date(dateStr);
          header = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch (_) {}
      }

      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(e);
    });

    return Object.entries(groups).map(([date, items]) => ({
      date,
      items,
    }));
  };

  const groupedExpenses = groupExpensesByDate(filteredExpenses);

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
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}>
      <Text style={styles.cardHeaderTitle}>Analytics & History</Text>

      {/* 1. Time Filter Segmented Control (matches color scheme of the app) */}
      <View style={styles.timeFilterContainer}>
        {(['today', 'week', 'month', 'year'] as const).map((filter) => {
          const labelMap = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' };
          const isActive = activeTimeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.timeFilterBtn, isActive && styles.timeFilterBtnActive]}
              onPress={() => setActiveTimeFilter(filter)}
              activeOpacity={0.8}
            >
              <Text style={[styles.timeFilterText, isActive && styles.timeFilterTextActive]}>
                {labelMap[filter]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 2. Side-by-side Gauges: Total Spend and Balance (reflects total budget) */}
      <View style={styles.gaugesRow}>
        {/* Total Spending Gauge */}
        <View style={styles.gaugeCard}>
          <View style={styles.gaugeWrapper}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke="#F2F4F7" strokeWidth="5.5" strokeLinecap="round" />
              {totalSpent > 0 && scaledBudget > 0 && (
                <Path
                  d={getGaugePath(36, 36, 28, spendProgress)}
                  fill="none"
                  stroke="#FF9500"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
              )}
            </Svg>
            <View style={styles.gaugeIconContainer}>
              <Feather name="upload" size={14} color="#FF9500" />
            </View>
          </View>
          <Text style={styles.gaugeLabel}>Total Spend</Text>
          <Text style={styles.gaugeValue}>GHS {totalSpent.toFixed(0)}</Text>
        </View>

        {/* Balance Gauge (displays total budget set by user) */}
        <View style={styles.gaugeCard}>
          <View style={styles.gaugeWrapper}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke="#F2F4F7" strokeWidth="5.5" strokeLinecap="round" />
              {totalBudget > 0 && (
                <Path
                  d={getGaugePath(36, 36, 28, balanceProgress)}
                  fill="none"
                  stroke="#34C759"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
              )}
            </Svg>
            <View style={styles.gaugeIconContainer}>
              <Feather name="pie-chart" size={14} color="#34C759" />
            </View>
          </View>
          <Text style={styles.gaugeLabel}>Balance</Text>
          <Text style={styles.gaugeValue}>GHS {totalBudget.toFixed(0)}</Text>
        </View>
      </View>

      {/* 3. Search Bar */}
      <View style={[
        styles.searchContainer,
        searchFocused && styles.searchContainerFocused
      ]}>
        <Feather name="search" size={18} color="#8E9AA6" style={styles.searchIcon} />
        <TextInput
          style={styles.searchBar}
          placeholder="Search filtered list..."
          placeholderTextColor="#8E9AA6"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      </View>

      {/* 4. List of Transactions */}
      {groupedExpenses.map((group) => (
        <View key={group.date} style={styles.dateGroup}>
          <Text style={styles.dateHeader}>{group.date}</Text>
          {group.items.map((item) => (
            <View key={item.id} style={styles.expenseCard}>
              <View style={styles.expenseLeft}>
                <View style={styles.iconBox}>
                  <Text style={styles.icon}>{CATEGORY_ICONS[item.category] || '📦'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDescription} numberOfLines={1}>
                    {item.description || item.category}
                  </Text>
                  <Text style={styles.expenseCategory}>{item.category}</Text>
                </View>
              </View>
              <View style={styles.expenseRight}>
                <Text style={styles.expenseAmount}>
                  -GHS {parseFloat(item.amount || '0').toFixed(2)}
                </Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(String(item.id))}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ))}

      {filteredExpenses.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>Try changing your filter settings or search query</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  cardHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 20,
    paddingLeft: 4,
  },
  // Time filters styles (aligned with budget.tsx theme)
  timeFilterContainer: {
    flexDirection: 'row',
    backgroundColor: '#EAEBEF',
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E4E8',
  },
  timeFilterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  timeFilterBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  timeFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E9AA6',
  },
  timeFilterTextActive: {
    color: '#111111',
  },
  // Two side-by-side gauges styles
  gaugesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  gaugeWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gaugeIconContainer: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    bottom: 12,
  },
  gaugeLabel: {
    fontSize: 10,
    color: '#8E9AA6',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gaugeValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111111',
  },
  // Search container styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  searchContainerFocused: {
    borderColor: '#111111',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBar: {
    flex: 1,
    color: '#111111',
    fontSize: 14,
    height: '100%',
  },
  // List items styles
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 4,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  expenseCategory: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 4,
  },
  expenseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF3B30',
    marginRight: 4,
  },
  deleteBtn: {
    padding: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
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
});
