import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { groupAPI } from '../services/api';
import { getUserId } from '../services/storage';

const USER_NAMES: { [key: string]: string } = {
  '1': 'Elikem',
  '2': 'Kofi',
  '3': 'Ama',
  '4': 'Yaw',
  '5': 'Abena',
};

const getUserDisplayName = (userId: string | number) => {
  const idStr = String(userId);
  return USER_NAMES[idStr] || `User #${idStr}`;
};

export default function GroupDetailScreen() {
  const { groupId, groupName } = useLocalSearchParams();
  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  // States to track input focus for outlines
  const [descFocused, setDescFocused] = useState(false);
  const [amtFocused, setAmtFocused] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, []);

  async function fetchDetails() {
    setLoading(true);
    setError(null);
    try {
      const [detailsRes, balancesRes] = await Promise.all([
        groupAPI.getGroupDetails(String(groupId)),
        groupAPI.getBalances(String(groupId)),
      ]);
      setDetails(detailsRes.data);
      setBalances(balancesRes.data || []);
    } catch (err: any) {
      console.log('Error fetching group details:', err);
      setError('Failed to load group details. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExpense() {
    if (!expenseAmount || !expenseDescription) {
      Alert.alert('Error', 'Please enter amount and description');
      return;
    }

    setAddingExpense(true);
    try {
      const userId = getUserId();
      await groupAPI.addSharedExpense(
        String(groupId),
        userId,
        expenseAmount,
        expenseDescription
      );
      setExpenseAmount('');
      setExpenseDescription('');
      setShowAddExpense(false);
      fetchDetails();
      Alert.alert('Success', 'Expense added and split equally!');
    } catch (error) {
      Alert.alert('Error', 'Failed to add expense');
    } finally {
      setAddingExpense(false);
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
        <TouchableOpacity style={styles.retryButton} onPress={fetchDetails}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>{groupName}</Text>

        {/* Add Expense Form (if toggled open) */}
        {showAddExpense && (
          <View style={styles.addExpenseForm}>
            <Text style={styles.formTitle}>Add Shared Expense</Text>
            <TextInput
              style={[
                styles.input,
                descFocused && styles.inputFocused
              ]}
              placeholder="Description (e.g. Dinner)"
              placeholderTextColor="#8E9AA6"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
            />
            <TextInput
              style={[
                styles.input,
                amtFocused && styles.inputFocused
              ]}
              placeholder="Amount (GHS)"
              placeholderTextColor="#8E9AA6"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              onFocus={() => setAmtFocused(true)}
              onBlur={() => setAmtFocused(false)}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[styles.button, addingExpense && styles.buttonDisabled]}
              onPress={handleAddExpense}
              disabled={addingExpense}
              activeOpacity={0.85}
            >
              {addingExpense ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Add & Split Equally</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddExpense(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showAddExpense && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddExpense(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.addButtonText}>+ Add Shared Expense</Text>
          </TouchableOpacity>
        )}

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {details?.members?.map((member: any) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {getUserDisplayName(member.userId).charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.memberText, { flex: 1 }]} numberOfLines={1}>
                {getUserDisplayName(member.userId)}
              </Text>
            </View>
          ))}
        </View>

        {/* Balances */}
        {balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Balances</Text>
            {balances.map((b: any, index: number) => (
              <View key={index} style={styles.balanceRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.balanceText} numberOfLines={1}>
                    {getUserDisplayName(b.userId)}
                  </Text>
                  <Text style={styles.balanceSub} numberOfLines={1}>
                    {b.owes ? 'Owes money' : 'Is owed money'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.balanceBadge,
                    {
                      backgroundColor: b.owes ? '#FF3B3012' : '#34C75912',
                      borderColor: b.owes ? '#FF3B30' : '#34C759',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.balanceAmount,
                      { color: b.owes ? '#FF3B30' : '#34C759' },
                    ]}
                  >
                    {b.owes ? 'Owes' : 'Owed'} GHS {Math.abs(parseFloat(b.balance)).toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Shared Expenses */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Expenses</Text>
          {details?.expenses?.length === 0 ? (
            <Text style={styles.emptyText}>No expenses yet</Text>
          ) : (
            details?.expenses?.map((expense: any) => (
              <View key={expense.id} style={styles.expenseRow}>
                <View style={[styles.expenseLeft, { flex: 1, marginRight: 12 }]}>
                  <View style={styles.expenseIconCircle}>
                    <Text style={styles.expenseIcon}>💸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseName} numberOfLines={1}>
                      {expense.description}
                    </Text>
                    <Text style={styles.expenseSub} numberOfLines={1}>
                      Paid by {getUserDisplayName(expense.paidBy)} • Split equally
                    </Text>
                  </View>
                </View>
                <Text style={styles.expenseAmountText}>
                  GHS {parseFloat(expense.amount).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>← Back to Groups</Text>
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
    padding: 24,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // White wrapper card
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  memberText: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  balanceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  balanceSub: {
    fontSize: 12,
    color: '#8E9AA6',
    marginTop: 2,
  },
  balanceBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  balanceAmount: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    flex: 1,
    marginRight: 12,
  },
  expenseIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  },
  expenseSub: {
    fontSize: 11,
    color: '#8E9AA6',
  },
  expenseAmountText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  emptyText: {
    fontSize: 13,
    color: '#8E9AA6',
    fontStyle: 'italic',
    paddingLeft: 4,
  },
  addExpenseForm: {
    backgroundColor: '#F8F9FA',
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  formTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    color: '#111111',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 10,
  },
  inputFocused: {
    borderColor: '#111111',
  },
  button: {
    backgroundColor: '#111111', // Black capsule button
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    color: '#8E9AA6',
    fontSize: 13,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#111111', // Black capsule button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  backButtonText: {
    color: '#8E9AA6',
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
});
