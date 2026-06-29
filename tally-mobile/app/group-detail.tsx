import { useState, useEffect } from "react";
import { notifyNewSharedExpense } from "../services/notifications";
import { useLocalSearchParams, router } from "expo-router";
import { groupAPI, momoAPI } from "../services/api";
import { getUserId } from "../services/storage";
import { currentUser } from "./(auth)/login";
import Avatar from "../components/Avatar";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
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
  Modal,
  RefreshControl,
} from "react-native";

export default function GroupDetailScreen() {
  const { groupId, groupName } = useLocalSearchParams();
  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  // MoMo modal state
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || "");
  const [settlingUserId, setSettlingUserId] = useState<number | null>(null);
  const [settlingName, setSettlingName] = useState("");
  const [settlingAmount, setSettlingAmount] = useState(0);
  const [momoLoading, setMomoLoading] = useState(false);

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
      setError(null);
    } catch (err) {
      setError("Something went wrong. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchDetails();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAddExpense() {
    if (!expenseAmount || !expenseDescription) {
      showToast("Please enter amount and description", "error");
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
      showToast("Expense added and split equally!", "success");
      await notifyNewSharedExpense(String(groupId), "You", expenseAmount, expenseDescription);
    } catch (error) {
      showToast("Failed to add expense", "error");
    } finally {
      setAddingExpense(false);
    }
  }

  // Opens the MoMo modal for a balance row
  function handleSettleUp(userId: number, name: string, amount: number) {
    setSettlingUserId(userId);
    setSettlingName(name);
    setSettlingAmount(Math.abs(amount));
    setMomoPhone("");
    setShowMomoModal(true);
  }

  async function handleMomoPayment() {
    const phone = momoPhone.trim();
    if (!phone) {
      showToast("Please enter your MoMo phone number.", "error");
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      showToast("Phone number must be exactly 10 digits.", "error");
      return;
    }

    setMomoLoading(true);
    try {
      const res = await momoAPI.requestPayment(
        String(groupId),
        currentUser.userId,
        phone,
        String(settlingAmount),
        "Tally group settle-up",
      );
      const referenceId: string = res.data.referenceId;

      setShowMomoModal(false);
      showToast("Payment prompt sent — please approve on your phone.", "info");

      // Wait 3 s then poll status
      await new Promise((r) => setTimeout(r, 3000));

      const statusRes = await momoAPI.checkStatus(referenceId);
      const status: string = statusRes.data.status;

      if (status === "FAILED") {
        showToast("The MoMo payment failed. Please try again.", "error");
        return;
      }

      // SUCCESSFUL or PENDING — settle the group balance
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails();

      if (status === "SUCCESSFUL") {
        showToast("Payment confirmed and group settled! ✅", "success");
      } else {
        showToast("Payment pending — group balance has been cleared.", "info");
      }
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || "Something went wrong.", "error");
    } finally {
      setMomoLoading(false);
    }
  }

  async function handleSkipAndSettle() {
    setShowMomoModal(false);
    try {
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails();
      showToast("Group balance cleared (no payment sent).", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || "Failed to settle.", "error");
    }
  }

  async function handleAddMember() {
    if (!memberUserId) {
      showToast("Please enter a user ID", "error");
      return;
    }
    setAddingMember(true);
    try {
      await groupAPI.addMember(String(groupId), memberUserId);
      setMemberUserId("");
      setShowAddMember(false);
      fetchDetails();
      showToast("Member added successfully!", "success");
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        "Failed to add member. Make sure the user ID is correct.";
      showToast(message, "error");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteGroup() {
    // Keep Alert — confirmation dialog with Cancel/Delete buttons
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
              router.back();
            } catch (error) {
              showToast("Failed to delete group", "error");
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

  if (error && !details) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.title}>{groupName}</Text>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {(() => {
            const expenses: any[] = details?.expenses || [];
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

            function timeAgo(createdAt: string) {
              if (!createdAt) return "";
              const diffMs = Date.now() - new Date(createdAt).getTime();
              const diffMins = Math.floor(diffMs / 60000);
              if (diffMins < 60) return `${diffMins}m ago`;
              const diffHours = Math.floor(diffMins / 60);
              if (diffHours < 24) return `${diffHours}h ago`;
              const d = new Date(createdAt);
              return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
            }

            return sorted.map((expense: any) => (
              <View key={expense.id} style={styles.activityItem}>
                <Avatar
                  userId={expense.paidBy}
                  name={expense.paidByName || String(expense.paidBy)}
                  size={36}
                  avatarData={expense.paidByAvatarData}
                  style={{ marginRight: 12 }}
                />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>
                    {expense.paidByName || `User #${expense.paidBy}`} paid GHS{" "}
                    {parseFloat(expense.amount).toFixed(2)} for {expense.description}
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

        <View style={styles.divider} />

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {details?.members?.map((member: any) => (
            <View key={member.id} style={styles.memberRow}>
              <Avatar
                userId={member.userId}
                name={member.name || String(member.userId)}
                size={40}
                avatarData={member.avatarData}
                style={{ marginRight: 12 }}
              />
              <View>
                <Text style={styles.memberText}>{member.name || `User #${member.userId}`}</Text>
                <Text style={styles.memberSubText}>ID: {member.userId}</Text>
              </View>
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
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddMember(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMember(true)}>
            <Text style={styles.addButtonText}>+ Add Member</Text>
          </TouchableOpacity>
        )}

        {/* Balances */}
        {balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Balances</Text>
            {balances.map((b: any, index: number) => (
              <View key={index} style={styles.balanceRow}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Avatar
                    userId={b.userId}
                    name={b.name || String(b.userId)}
                    size={40}
                    avatarData={b.avatarData}
                    style={{ marginRight: 10 }}
                  />
                  <View>
                    <Text style={styles.balanceText}>{b.name || `User #${b.userId}`}</Text>
                    <Text style={styles.balanceSub}>
                      {b.owes ? "Owes money" : "Is owed money"}
                    </Text>
                  </View>
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
                  {b.owes && String(b.userId) === String(currentUser.userId) && (
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() =>
                        handleSettleUp(
                          b.userId,
                          b.name || `User #${b.userId}`,
                          parseFloat(b.balance),
                        )
                      }
                    >
                      <Text style={styles.settleButtonText}>💳 Settle Up</Text>
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseName}>{expense.description}</Text>
                  <Text style={styles.expenseSub}>
                    Paid by {expense.paidByName || `User #${expense.paidBy}`} • Split equally
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
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddExpense(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showAddExpense && (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddExpense(true)}>
            <Text style={styles.addButtonText}>+ Add Shared Expense</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteGroup}>
          <Text style={styles.deleteButtonText}>Delete Group</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back to Groups</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── MoMo Payment Modal ── */}
      <Modal
        visible={showMomoModal}
        transparent
        animationType="fade"
        onRequestClose={() => !momoLoading && setShowMomoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
            <View style={styles.modalCard}>
              {/* Header */}
              <Text style={styles.modalTitle}>Pay with MoMo</Text>
              <Text style={styles.modalSubtitle}>
                Settling{" "}
                <Text style={{ color: "#00C896", fontWeight: "bold" }}>
                  GHS {settlingAmount.toFixed(2)}
                </Text>{" "}
                with {settlingName}
              </Text>

              {/* Phone input */}
              <TextInput
                style={styles.modalInput}
                placeholder="Enter MoMo number e.g. 0241234567"
                placeholderTextColor="#8890A0"
                value={momoPhone}
                onChangeText={setMomoPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!momoLoading}
              />

              {/* Pay Now */}
              <TouchableOpacity
                style={[styles.payButton, momoLoading && { opacity: 0.6 }]}
                onPress={handleMomoPayment}
                disabled={momoLoading}
              >
                {momoLoading ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.payButtonText}>💳  Pay Now</Text>
                )}
              </TouchableOpacity>

              {/* Skip & Settle */}
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkipAndSettle}
                disabled={momoLoading}
              >
                <Text style={styles.skipButtonText}>Skip &amp; Settle</Text>
              </TouchableOpacity>

              {/* Cancel link */}
              {!momoLoading && (
                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={() => setShowMomoModal(false)}
                >
                  <Text style={styles.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },
  centered: {
    flex: 1, backgroundColor: "#0F1117",
    alignItems: "center", justifyContent: "center",
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  content: { padding: 24 },
  title: {
    fontSize: 26, fontWeight: "bold", color: "#ffffff",
    marginBottom: 24, marginTop: 8,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16, fontWeight: "bold", color: "#ffffff", marginBottom: 12,
  },
  memberRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1A1F2E", borderRadius: 12,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#ffffff10",
  },
  memberText: { fontSize: 14, color: "#ffffff", fontWeight: "500" },
  memberSubText: { fontSize: 11, color: "#8890A0", marginTop: 1 },
  balanceRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#1A1F2E", borderRadius: 12,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#ffffff10",
  },
  balanceText: { fontSize: 14, color: "#ffffff", fontWeight: "500" },
  balanceAmount: { fontSize: 15, fontWeight: "bold" },
  balanceSub: { fontSize: 12, color: "#8890A0", marginTop: 2 },
  balanceBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1,
  },
  settleButton: {
    backgroundColor: "#00C89620", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "#00C896",
  },
  settleButtonText: { color: "#00C896", fontSize: 12, fontWeight: "bold" },
  expenseRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#1A1F2E", borderRadius: 12,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#ffffff10",
  },
  expenseName: { fontSize: 14, color: "#ffffff", fontWeight: "500", marginBottom: 3 },
  expenseSub: { fontSize: 12, color: "#8890A0" },
  expenseAmount: { fontSize: 14, fontWeight: "bold", color: "#00C896" },
  emptyText: { fontSize: 14, color: "#8890A0", fontStyle: "italic" },
  addExpenseForm: {
    backgroundColor: "#1A1F2E", borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#ffffff10",
  },
  input: {
    backgroundColor: "#0F1117", borderRadius: 10,
    padding: 14, color: "#ffffff", fontSize: 15,
    borderWidth: 1, borderColor: "#ffffff20", marginBottom: 12,
  },
  button: {
    backgroundColor: "#00C896", borderRadius: 12,
    padding: 14, alignItems: "center", marginBottom: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#000000", fontSize: 15, fontWeight: "bold" },
  cancelButton: { padding: 10, alignItems: "center" },
  cancelText: { color: "#8890A0", fontSize: 14 },
  addButton: {
    borderWidth: 1, borderColor: "#00C896",
    borderRadius: 12, padding: 16,
    alignItems: "center", marginBottom: 12,
  },
  addButtonText: { color: "#00C896", fontSize: 15, fontWeight: "600" },
  deleteButton: {
    borderWidth: 1, borderColor: "#E05C5C",
    borderRadius: 12, padding: 16,
    alignItems: "center", marginBottom: 12,
  },
  deleteButtonText: { color: "#E05C5C", fontSize: 15, fontWeight: "600" },
  backButton: { padding: 16, alignItems: "center" },
  backButtonText: { color: "#8890A0", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#ffffff10", marginBottom: 24 },

  // Activity
  activityItem: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: "#ffffff10",
  },
  activityContent: { flex: 1 },
  activityText: { fontSize: 13, color: "#ffffff", lineHeight: 18 },
  activityTime: { fontSize: 11, color: "#8890A0", marginTop: 3 },
  activityBadge: {
    backgroundColor: "#00C89620", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "#00C896",
  },
  activityBadgeText: { fontSize: 11, color: "#00C896", fontWeight: "600" },

  // MoMo Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 0,
  },
  modalCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 24,
    padding: 24,
    margin: 24,
    borderWidth: 1,
    borderColor: "#00C89630",
  },
  modalTitle: {
    fontSize: 22, fontWeight: "bold", color: "#ffffff",
    marginBottom: 6, textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14, color: "#8890A0",
    textAlign: "center", marginBottom: 4, lineHeight: 20,
  },
  modalInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 18,
    borderWidth: 1,
    borderColor: "#ffffff20",
    marginVertical: 16,
    textAlign: "center",
    letterSpacing: 2,
  },
  payButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  payButtonText: {
    color: "#000000", fontSize: 16, fontWeight: "bold",
  },
  skipButton: {
    borderWidth: 1, borderColor: "#8890A0",
    borderRadius: 12, padding: 16,
    alignItems: "center", marginTop: 8,
  },
  skipButtonText: { color: "#8890A0", fontSize: 15, fontWeight: "600" },
  cancelLink: { padding: 14, alignItems: "center" },
  cancelLinkText: { color: "#ffffff60", fontSize: 14 },
});
