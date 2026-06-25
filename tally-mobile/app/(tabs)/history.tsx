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
import { expenseAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

function getMonthFilters() {
  const filters: { label: string; value: string }[] = [{ label: 'All', value: 'all' }];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
    filters.push({ label, value });
  }
  return filters;
}

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

const MONTH_FILTERS = getMonthFilters();

export default function HistoryScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, [])
  );

  async function fetchExpenses() {
    setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const response = await expenseAPI.getUserExpenses(userId);
      setExpenses(response.data || []);
    } catch (err: any) {
      console.log('Error fetching expenses:', err);
      setError('Failed to load expenses. Please check your connection.');
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

  // Filter by Month first, then by Search query
  const filteredExpensesByMonth = useMemo(() => {
    if (activeFilter === 'all') return expenses;
    return expenses.filter((e) => e.date && e.date.startsWith(activeFilter));
  }, [expenses, activeFilter]);

  const filteredExpenses = useMemo(() => {
    return filteredExpensesByMonth.filter(e => {
      const desc = (e.description || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      return desc.includes(query) || cat.includes(query);
    });
  }, [filteredExpensesByMonth, searchQuery]);

  const totalSpent = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
  }, [filteredExpenses]);

  const groupExpensesByDate = (list: any[]) => {
    const groups: { [key: string]: any[] } = {};
    list.forEach(e => {
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
        <TouchableOpacity style={styles.retryButton} onPress={fetchExpenses}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>Transactions History</Text>

        {/* Month Filters Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRowContainer}
          contentContainerStyle={styles.filterRow}
        >
          {MONTH_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterBtn, activeFilter === f.value && styles.filterBtnActive]}
              onPress={() => setActiveFilter(f.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, activeFilter === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Total Spent Box */}
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total Spent</Text>
          <Text style={styles.totalAmount}>GHS {totalSpent.toFixed(2)}</Text>
        </View>

        {/* Search Input Box */}
        <View style={[
          styles.searchContainer,
          searchFocused && styles.searchContainerFocused
        ]}>
          <Feather name="search" size={18} color="#8E9AA6" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Search transactions..."
            placeholderTextColor="#8E9AA6"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </View>

        {/* Transactions List */}
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

        {expenses.length > 0 && filteredExpenses.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No matching expenses</Text>
            <Text style={styles.emptySubtext}>Try searching a different description or category</Text>
          </View>
        )}

        {expenses.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No expenses yet</Text>
            <Text style={styles.emptySubtext}>Tap Add tab to record your first transaction</Text>
          </View>
        )}
      </View>
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
  mainCard: {
    backgroundColor: '#ffffff', // Card wrapper
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 20,
  },
  filterRowContainer: {
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginRight: 8,
  },
  filterBtnActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E9AA6',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  totalBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111111',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 20,
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
    marginBottom: 2,
    marginLeft: 4,
  },
  expenseCategory: {
    fontSize: 11,
    color: '#8E9AA6',
    marginLeft: 4,
  },
  expenseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF3B30', // soft red for expenses
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
