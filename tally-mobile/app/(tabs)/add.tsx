import { useState, useEffect } from 'react';
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
import { expenseAPI, budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function AddScreen() {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Food');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Dynamic monthly totals and budget limits
  const [spent, setSpent] = useState<{ [key: string]: number }>({});
  const [limits, setLimits] = useState<{ [key: string]: number }>({});

  // Input focus status for outline treatments
  const [amountFocused, setAmountFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setFetching(true);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes] = await Promise.all([
        expenseAPI.getUserExpenses(userId),
        budgetAPI.getUserBudgets(userId)
      ]);
      
      const totals: { [key: string]: number } = {};
      expensesRes.data.forEach((expense: any) => {
        const cat = expense.category || 'Other';
        totals[cat] = (totals[cat] || 0) + parseFloat(expense.amount || '0');
      });
      setSpent(totals);

      const budgetMap: { [key: string]: number } = {};
      budgetsRes.data.forEach((budget: any) => {
        budgetMap[budget.category] = parseFloat(budget.monthlyLimit) || 0;
      });
      setLimits(budgetMap);
    } catch (err) {
      console.log('Error loading dynamic metrics for categories:', err);
    } finally {
      setFetching(false);
    }
  }

  async function handleAddExpense() {
    if (!amount) {
      Alert.alert('Error', 'Please enter an amount');
      return;
    }

    if (isNaN(parseFloat(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = getUserId();
      await expenseAPI.createExpense(userId, amount, selectedCategory, description, today);
      Alert.alert('Success', 'Expense added successfully!');
      
      // Update spent values locally for responsive UI feedback
      const addedAmt = parseFloat(amount) || 0;
      setSpent(prev => ({
        ...prev,
        [selectedCategory]: (prev[selectedCategory] || 0) + addedAmt
      }));

      setAmount('');
      setDescription('');
      setSelectedCategory('Food');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to add expense.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  // Get dynamic ring color based on budget consumption
  const getRingColor = (cat: string) => {
    const spentAmt = spent[cat] || 0;
    const limitAmt = limits[cat] || 0;

    if (limitAmt > 0) {
      const ratio = spentAmt / limitAmt;
      if (ratio > 1) return '#FF3B30'; // Red - over budget
      if (ratio >= 0.8) return '#FF9500'; // Orange - warning
      if (ratio >= 0.5) return '#FFCC00'; // Yellow - intermediate
      return '#34C759'; // Green - healthy
    }
    return spentAmt > 0 ? '#34C759' : '#C8D2DC'; // Neutral fallback
  };

  if (fetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>Add Expense</Text>

        {/* Enter Amount box styled for the theme */}
        <Text style={styles.label}>Amount</Text>
        <View style={[
          styles.amountBox,
          amountFocused && styles.amountBoxFocused
        ]}>
          <Text style={styles.amountPrefix}>GHS</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor="#C8D2DC"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
          />
        </View>

        {/* Categories capsule selection list */}
        <Text style={styles.label}>Select Category</Text>
        <View style={styles.categoryList}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryCapsule,
                selectedCategory === cat && styles.categoryCapsuleActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.8}
            >
              <View style={styles.categoryLeft}>
                <Text style={styles.categoryEmoji}>{CATEGORY_ICONS[cat]}</Text>
                <Text style={styles.categoryNameText}>{cat}</Text>
              </View>
              <View style={styles.categoryRight}>
                <Text style={styles.categoryAmountText}>
                  GHS {(spent[cat] || 0).toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description box */}
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[
            styles.descriptionBox,
            styles.textArea,
            descFocused && styles.descriptionBoxFocused
          ]}
          placeholder="What was this for?"
          placeholderTextColor="#8E9AA6"
          value={description}
          onChangeText={setDescription}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
          multiline
          numberOfLines={3}
        />

        {/* Black capsule action button */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddExpense}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>⊕ Add Expense</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop from mockup
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
    backgroundColor: '#ffffff', // Card wrapper from mockup
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
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  amountBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountBoxFocused: {
    borderColor: '#111111', // Black border on focus
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    padding: 0,
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
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryCapsuleActive: {
    borderColor: '#111111', // Rounded black outline on selection
    borderWidth: 1.5,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryEmoji: {
    fontSize: 20,
  },
  categoryNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    marginLeft: 4,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginRight: 6,
  },
  circleRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  descriptionBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    color: '#111111',
    fontSize: 15,
    marginBottom: 24,
  },
  descriptionBoxFocused: {
    borderColor: '#111111',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#111111', // Black background button
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
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },
  dotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#111111',
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8D2DC',
  },
});