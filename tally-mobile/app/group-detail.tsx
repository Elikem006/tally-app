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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupAPI } from '../services/api';
import { getUserId } from '../services/storage';
import { notifyNewSharedExpense } from '../services/notifications';

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
  const insets = useSafeAreaInsets();
  const { groupId, groupName } = useLocalSearchParams();
  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add Expense form states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  
  // Add Member form states
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // States to track input focus for outlines
  const [descFocused, setDescFocused] = useState(false);
  const [amtFocused, setAmtFocused] = useState(false);
  const [memberInputFocused, setMemberInputFocused] = useState(false);

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
      await fetchDetails();
      Alert.alert('Success', 'Expense added and split equally!');
      try {
        await notifyNewSharedExpense(String(groupName), expenseAmount, "You");
      } catch (notifyErr) {
        console.log('Error sending split notification:', notifyErr);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add expense');
    } finally {
      setAddingExpense(false);
    }
  }

  async function handleSettleUp(userId: number) {
    Alert.alert(
      'Settle Up',
      `Are you sure you want to settle up ${getUserDisplayName(userId)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle Up',
          onPress: async () => {
            try {
              await groupAPI.settleUp(String(groupId), String(userId));
              Alert.alert('Success', 'Settled up successfully!');
              fetchDetails();
            } catch (error) {
              Alert.alert('Error', 'Failed to settle up');
            }
          },
        },
      ]
    );
  }

  async function handleAddMember() {
    if (!memberUserId) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }
    setAddingMember(true);
    try {
      await groupAPI.addMember(String(groupId), memberUserId);
      setMemberUserId('');
      setShowAddMember(false);
      fetchDetails();
      Alert.alert('Success', 'Member added successfully!');
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        'Failed to add member. Make sure the user ID is correct.';
      Alert.alert('Error', message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteGroup() {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupAPI.deleteGroup(String(groupId));
              Alert.alert('Success', 'Group deleted');
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  }

  function timeAgo(createdAt: string) {
    if (!createdAt) return "";
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    const d = new Date(createdAt);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}>
        {/* Light card container */}
        <View style={styles.mainCard}>
          <Text style={styles.cardHeaderTitle}>{groupName}</Text>

          {/* Recent Activity Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {(() => {
              const expenses = details?.expenses || [];
              if (expenses.length === 0) {
                return <Text style={styles.emptyText}>No activity yet</Text>;
              }
              const sorted = [...expenses]
                .sort((a, b) => {
                  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return tb - ta;
                })
                .slice(0, 5);

              return sorted.map((expense: any) => (
                <View key={expense.id} style={styles.activityItem}>
                  <View style={styles.activityAvatar}>
                    <Text style={styles.activityAvatarText}>
                      {getUserDisplayName(expense.paidBy).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      {getUserDisplayName(expense.paidBy)} paid GHS {parseFloat(expense.amount).toFixed(2)} for {expense.description}
                    </Text>
                    <Text style={styles.activityTime}>{timeAgo(expense.createdAt)}</Text>
                  </View>
                  <View style={styles.activityBadge}>
                    <Text style={styles.activityBadgeText}>Shared</Text>
                  </View>
                </View>
              ));
            })()}
          </View>

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

          {/* Members Section */}
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

          {/* Add Member Form / Button */}
          {showAddMember ? (
            <View style={styles.addExpenseForm}>
              <Text style={styles.formTitle}>Add Member by User ID</Text>
              <TextInput
                style={[
                  styles.input,
                  memberInputFocused && styles.inputFocused
                ]}
                placeholder="Enter User ID (e.g. 2)"
                placeholderTextColor="#8E9AA6"
                value={memberUserId}
                onChangeText={setMemberUserId}
                onFocus={() => setMemberInputFocused(true)}
                onBlur={() => setMemberInputFocused(false)}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.button, addingMember && styles.buttonDisabled]}
                onPress={handleAddMember}
                disabled={addingMember}
                activeOpacity={0.85}
              >
                {addingMember ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Add Member</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddMember(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddMember(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.addButtonText}>+ Add Member</Text>
            </TouchableOpacity>
          )}

          {/* Balances Section */}
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
                  <View style={styles.balanceRight}>
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
                    {b.owes && (
                      <TouchableOpacity
                        style={styles.settleButton}
                        onPress={() => handleSettleUp(b.userId)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.settleButtonText}>Settle Up</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Shared Expenses Section */}
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

          {/* Delete Group Button */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteGroup}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteButtonText}>Delete Group</Text>
          </TouchableOpacity>

          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>← Back to Groups</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  balanceRight: {
    alignItems: 'flex-end',
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
  settleButton: {
    backgroundColor: '#FF3B3012',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FF3B30',
    marginTop: 6,
  },
  settleButtonText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
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
  deleteButton: {
    backgroundColor: '#FF3B3012',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Recent Activity styles
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    gap: 12,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  activityAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
  },
  activityTime: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
    fontWeight: '500',
  },
  activityBadge: {
    backgroundColor: '#8B5CF612',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#8B5CF630',
  },
  activityBadgeText: {
    fontSize: 10,
    color: '#8B5CF6',
    fontWeight: '600',
  },
});
