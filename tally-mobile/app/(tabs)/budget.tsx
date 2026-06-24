import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { budgetAPI, expenseAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function BudgetScreen() {
  const [limits, setLimits] = useState<{ [key: string]: string }>({
    Food: '',
    Transport: '',
    Entertainment: '',
    Utilities: '',
    Other: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState<{ [key: string]: number }>({});

  // State to track active text input focus for border highlight
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadExistingBudgets();
    }, [])
  );

  async function loadExistingBudgets() {
    setFetching(true);
    setError(null);
    try {
      const userId = getUserId();
      const [budgetsRes, expensesRes] = await Promise.all([
        budgetAPI.getUserBudgets(userId),
        expenseAPI.getUserExpenses(userId)
      ]);
      
      const existing: { [key: string]: string } = {};
      budgetsRes.data.forEach((budget: any) => {
        existing[budget.category] = String(budget.monthlyLimit);
      });
      setLimits(prev => ({ ...prev, ...existing }));

      const totals: { [key: string]: number } = {};
      expensesRes.data.forEach((expense: any) => {
        totals[expense.category] = (totals[expense.category] || 0) + parseFloat(expense.amount);
      });
      setSpent(totals);
    } catch (err: any) {
      console.log('Error loading budgets data:', err);
      setError('Failed to load budgets. Please check your connection.');
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    const userId = getUserId();
    setLoading(true);
    try {
      for (const category of CATEGORIES) {
        if (limits[category] && limits[category] !== '0') {
          await budgetAPI.setBudget(userId, category, limits[category]);
        }
      }
      Alert.alert('Success', 'Your budgets have been saved!');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save budgets. Please try again.');
    } finally {
      setLoading(false);
    }
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
        <TouchableOpacity style={styles.retryButton} onPress={loadExistingBudgets}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>Monthly Budgets</Text>
        <Text style={styles.subtitle}>
          Set how much you want to spend per category this month
        </Text>

        {/* Categories Capsule rows */}
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
                    <Text style={styles.categoryName}>{category}</Text>
                    <Text style={styles.categorySpentText} numberOfLines={1}>
                      Spent: GHS {categorySpent.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Input with focus border outline highlight */}
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

        {/* Black capsule CTA button */}
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
    backgroundColor: '#ffffff', // Card container wrapper
    borderRadius: 28,
    padding: 24,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 24,
    lineHeight: 18,
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
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  categoryName: {
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
    borderColor: '#111111', // Black border on active focus
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
  button: {
    backgroundColor: '#111111', // Black capsule button
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