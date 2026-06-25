import { useState, useEffect } from "react";
import { notifyNewSharedExpense } from "../services/notifications";
import { useLocalSearchParams, router } from "expo-router";
import { groupAPI } from "../services/api";
import { getUserId } from "../services/storage";
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
} from "react-native";

export default function GroupDetailScreen() {
  const { groupId, groupName } = useLocalSearchParams();
  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, []);

  async function fetchDetails() {
    try {
      const [detailsRes, balancesRes] = await Promise.all([
        groupAPI.getGroupDetails(String(groupId)),
        groupAPI.getBalances(String(groupId)),
      ]);
      setDetails(detailsRes.data);
      setBalances(balancesRes.data);
    } catch (error) {
      console.log("Error fetching group details:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExpense() {
    if (!expenseAmount || !expenseDescription) {
      Alert.alert("Error", "Please enter amount and description");
      return;
    }

    setAddingExpense(true);
    try {
      const userId = getUserId();
      await groupAPI.addSharedExpense(
        String(groupId),
        userId,
        expenseAmount,
        expenseDescription,
      );
      setExpenseAmount("");
      setExpenseDescription("");
      setShowAddExpense(false);
      fetchDetails();
      Alert.alert("Success", "Expense added and split equally!");
      await notifyNewSharedExpense(String(groupName), expenseAmount, "You");
    } catch (error) {
      Alert.alert("Error", "Failed to add expense");
    } finally {
      setAddingExpense(false);
    }
  }

  async function handleSettleUp(userId: number) {
    Alert.alert(
      "Settle Up",
      `Are you sure you want to settle up User #${userId}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle Up",
          onPress: async () => {
            try {
              await groupAPI.settleUp(String(groupId), String(userId));
              Alert.alert("Success", "Settled up successfully!");
              fetchDetails();
            } catch (error) {
              Alert.alert("Error", "Failed to settle up");
            }
          },
        },
      ],
    );
  }

  async function handleAddMember() {
    if (!memberUserId) {
      Alert.alert("Error", "Please enter a user ID");
      return;
    }
    setAddingMember(true);
    try {
      await groupAPI.addMember(String(groupId), memberUserId);
      setMemberUserId("");
      setShowAddMember(false);
      fetchDetails();
      Alert.alert("Success", "Member added successfully!");
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        "Failed to add member. Make sure the user ID is correct.";
      Alert.alert("Error", message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteGroup() {
    Alert.alert(
      "Delete Group",
      "Are you sure you want to delete this group? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await groupAPI.deleteGroup(String(groupId));
              Alert.alert("Success", "Group deleted");
              router.back();
            } catch (error) {
              Alert.alert("Error", "Failed to delete group");
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>{groupName}</Text>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {details?.members?.map((member: any) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {String(member.userId).charAt(0)}
                </Text>
              </View>
              <Text style={styles.memberText}>User #{member.userId}</Text>
            </View>
          ))}
        </View>
        {showAddMember ? (
          <View style={styles.addExpenseForm}>
            <Text style={styles.sectionTitle}>Add Member by User ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter User ID (e.g. 2)"
              placeholderTextColor="#8890A0"
              value={memberUserId}
              onChangeText={setMemberUserId}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={[styles.button, addingMember && styles.buttonDisabled]}
              onPress={handleAddMember}
              disabled={addingMember}
            >
              {addingMember ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.buttonText}>Add Member</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddMember(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddMember(true)}
          >
            <Text style={styles.addButtonText}>+ Add Member</Text>
          </TouchableOpacity>
        )}

        {/* Balances */}
        {balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Balances</Text>
            {balances.map((b: any, index: number) => (
              <View key={index} style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceText}>User #{b.userId}</Text>
                  <Text style={styles.balanceSub}>
                    {b.owes ? "Owes money" : "Is owed money"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <View
                    style={[
                      styles.balanceBadge,
                      {
                        backgroundColor: b.owes ? "#E05C5C20" : "#00C89620",
                        borderColor: b.owes ? "#E05C5C" : "#00C896",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.balanceAmount,
                        { color: b.owes ? "#E05C5C" : "#00C896" },
                      ]}
                    >
                      {b.owes ? "Owes" : "Owed"} GHS{" "}
                      {Math.abs(parseFloat(b.balance)).toFixed(2)}
                    </Text>
                  </View>
                  {b.owes && (
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() => handleSettleUp(b.userId)}
                    >
                      <Text style={styles.settleButtonText}>Settle Up</Text>
                    </TouchableOpacity>
                  )}
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
                <View>
                  <Text style={styles.expenseName}>{expense.description}</Text>
                  <Text style={styles.expenseSub}>
                    Paid by User #{expense.paidBy} • Split equally
                  </Text>
                </View>
                <Text style={styles.expenseAmount}>
                  GHS {parseFloat(expense.amount).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Add Expense Form */}
        {showAddExpense && (
          <View style={styles.addExpenseForm}>
            <Text style={styles.sectionTitle}>Add Shared Expense</Text>
            <TextInput
              style={styles.input}
              placeholder="Description (e.g. Dinner)"
              placeholderTextColor="#8890A0"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount (GHS)"
              placeholderTextColor="#8890A0"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[styles.button, addingExpense && styles.buttonDisabled]}
              onPress={handleAddExpense}
              disabled={addingExpense}
            >
              {addingExpense ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.buttonText}>Add & Split Equally</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddExpense(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showAddExpense && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddExpense(true)}
          >
            <Text style={styles.addButtonText}>+ Add Shared Expense</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteGroup}
        >
          <Text style={styles.deleteButtonText}>Delete Group</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back to Groups</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 24,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#00C89620",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00C896",
  },
  memberText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  balanceText: {
    fontSize: 14,
    color: "#ffffff",
  },
  balanceAmount: {
    fontSize: 15,
    fontWeight: "bold",
  },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  expenseName: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 3,
  },
  expenseSub: {
    fontSize: 12,
    color: "#8890A0",
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#00C896",
  },
  emptyText: {
    fontSize: 14,
    color: "#8890A0",
    fontStyle: "italic",
  },
  addExpenseForm: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  input: {
    backgroundColor: "#0F1117",
    borderRadius: 10,
    padding: 14,
    color: "#ffffff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ffffff20",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
  cancelButton: {
    padding: 10,
    alignItems: "center",
  },
  cancelText: {
    color: "#8890A0",
    fontSize: 14,
  },
  addButton: {
    borderWidth: 1,
    borderColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  addButtonText: {
    color: "#00C896",
    fontSize: 15,
    fontWeight: "600",
  },
  backButton: {
    padding: 16,
    alignItems: "center",
  },
  backButtonText: {
    color: "#8890A0",
    fontSize: 14,
  },
  balanceSub: {
    fontSize: 12,
    color: "#8890A0",
    marginTop: 2,
  },
  balanceBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  settleButton: {
    backgroundColor: "#00C89620",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#00C896",
  },
  settleButtonText: {
    color: "#00C896",
    fontSize: 12,
    fontWeight: "bold",
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#E05C5C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  deleteButtonText: {
    color: "#E05C5C",
    fontSize: 15,
    fontWeight: "600",
  },
});
