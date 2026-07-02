import { useState, useEffect, useCallback } from "react";
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
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groupAPI, momoAPI } from "../services/api";
import { getUserId } from "../services/storage";
import { currentUser } from "./(auth)/login";
import { notifyNewSharedExpense } from "../services/notifications";
import Avatar from "../components/Avatar";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

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

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const { groupId, groupName } = useLocalSearchParams();
  
  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form toggles and fields
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);

  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const [descFocused, setDescFocused] = useState(false);
  const [amtFocused, setAmtFocused] = useState(false);
  const [memberInputFocused, setMemberInputFocused] = useState(false);

  // MoMo settle up modal states
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || "");
  const [settlingUserId, setSettlingUserId] = useState<number | null>(null);
  const [settlingName, setSettlingName] = useState("");
  const [settlingAmount, setSettlingAmount] = useState(0);
  const [momoLoading, setMomoLoading] = useState(false);

  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  useEffect(() => {
    fetchDetails(true);
  }, []);

  async function fetchDetails(showSpinner = true) {
    if (showSpinner) setLoading(true);
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

  async function onRefresh() {
    setRefreshing(true);
    await fetchDetails(false);
    setRefreshing(false);
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
      await fetchDetails(false);
      showToast("Expense added and split equally!", "success");
      
      try {
        await notifyNewSharedExpense(String(groupId), "You", expenseAmount, expenseDescription);
      } catch (notifyErr) {
        console.log('Error sending split notification:', notifyErr);
      }
    } catch (error) {
      showToast("Failed to add expense", "error");
    } finally {
      setAddingExpense(false);
    }
  }

  function handleSettleUp(userId: number, name: string, amount: number) {
    setSettlingUserId(userId);
    setSettlingName(name);
    setSettlingAmount(Math.abs(amount));
    setMomoPhone(currentUser.phoneNumber || "");
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

      // Wait 3 seconds then poll status
      await new Promise((r) => setTimeout(r, 3000));

      const statusRes = await momoAPI.checkStatus(referenceId);
      const status: string = statusRes.data.status;

      if (status === "FAILED") {
        showToast("The MoMo payment failed. Please try again.", "error");
        return;
      }

      // SUCCESSFUL or PENDING — settle the group balance
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails(false);

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
      await fetchDetails(false);
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
      await fetchDetails(false);
      showToast("Member added successfully!", "success");
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to add member. Check the User ID.", "error");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteGroup() {
    Alert.alert(
      "Delete Group",
      "Are you sure you want to delete this group? All records will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Group",
          style: "destructive",
          onPress: async () => {
            try {
              await groupAPI.deleteGroup(String(groupId));
              showToast("Group deleted successfully", "info");
              router.replace("/(tabs)/groups");
            } catch (err: any) {
              showToast("Failed to delete group", "error");
            }
          },
        },
      ]
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (error && !details) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={['#8B5CF6']} />}
      >
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDetails(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={['#8B5CF6']} />}
        keyboardShouldPersistTaps="handled"
      >
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
                  <Avatar
                    userId={expense.paidBy}
                    name={expense.paidByName || String(expense.paidBy)}
                    size={36}
                    avatarData={expense.paidByAvatarData}
                    style={{ marginRight: 12 }}
                  />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      <Text style={{ fontWeight: "700" }}>{expense.paidByName || `User #${expense.paidBy}`}</Text> paid <Text style={{ fontWeight: "700" }}>GHS {parseFloat(expense.amount).toFixed(2)}</Text> for {expense.description}
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

          {/* Members Section */}
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberText} numberOfLines={1}>
                    {member.name || `User #${member.userId}`}
                  </Text>
                  <Text style={styles.memberSubText}>ID: #{member.userId}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Solo empty state */}
          {details?.members?.length === 1 && (
            <View style={styles.soloMemberCard}>
              <Text style={styles.soloMemberEmoji}>👥</Text>
              <Text style={styles.soloMemberTitle}>You're the only member here</Text>
              <Text style={styles.soloMemberSub}>
                Add members to start splitting expenses with friends.
              </Text>
              <TouchableOpacity
                style={styles.soloAddButton}
                onPress={() => setShowAddMember(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.soloAddButtonText}>+ Add Member</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Member Form */}
          {showAddMember && (
            <View style={styles.formSection}>
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
              <TouchableOpacity style={styles.cancelLinkButton} onPress={() => setShowAddMember(false)} activeOpacity={0.7}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddMember && details?.members?.length > 1 && (
            <TouchableOpacity style={styles.outlineAddButton} onPress={() => setShowAddMember(true)} activeOpacity={0.8}>
              <Text style={styles.outlineAddButtonText}>+ Add Member</Text>
            </TouchableOpacity>
          )}

          {/* Balances Section */}
          {balances.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Balances</Text>
              {balances.map((b: any, index: number) => (
                <View key={index} style={styles.balanceRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 }}>
                    <Avatar
                      userId={b.userId}
                      name={b.name || String(b.userId)}
                      size={40}
                      avatarData={b.avatarData}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.balanceText} numberOfLines={1}>
                        {b.name || `User #${b.userId}`}
                      </Text>
                      <Text style={styles.balanceSub}>
                        {b.owes ? "Owes money" : "Is owed money"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View
                      style={[
                        styles.balanceBadge,
                        {
                          backgroundColor: b.owes ? "#FF3B3012" : "#34C75912",
                          borderColor: b.owes ? "#FF3B3030" : "#34C75930",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.balanceAmount,
                          { color: b.owes ? "#FF3B30" : "#34C759" },
                        ]}
                      >
                        {b.owes ? "Owes" : "Owed"} GHS {Math.abs(parseFloat(b.balance)).toFixed(2)}
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
                        activeOpacity={0.8}
                      >
                        <Text style={styles.settleButtonText}>💳 Settle Up</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {balances.length === 0 && (details?.members?.length ?? 0) > 1 && (
            <View style={styles.settledUpContainer}>
              <Text style={styles.settledUpText}>Everyone is settled up! 🎉</Text>
            </View>
          )}

          {/* Shared Expenses List */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shared Expenses</Text>
            {details?.expenses?.length === 0 ? (
              <Text style={styles.emptyText}>No shared expenses yet</Text>
            ) : (
              details?.expenses?.map((expense: any) => (
                <View key={expense.id} style={styles.sharedExpenseRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.expenseName} numberOfLines={1}>{expense.description}</Text>
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

          {/* Add Expense Form (if toggled open) */}
          {showAddExpense && (
            <View style={styles.formSection}>
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
              <TouchableOpacity style={styles.cancelLinkButton} onPress={() => setShowAddExpense(false)} activeOpacity={0.7}>
                <Text style={styles.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddExpense && details?.members?.length > 1 && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.addButtonText}>+ Add Shared Expense</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.deleteGroupBtn} onPress={handleDeleteGroup} activeOpacity={0.8}>
              <Text style={styles.deleteGroupText}>Delete Group</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.backButtonText}>← Back to Groups</Text>
            </TouchableOpacity>
          </View>
        </View>
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
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Pay with MoMo</Text>
              <Text style={styles.modalSubtitle}>
                Settling{" "}
                <Text style={{ color: "#D97706", fontWeight: "bold" }}>
                  GHS {settlingAmount.toFixed(2)}
                </Text>{" "}
                with {settlingName}
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Enter MoMo number e.g. 0241234567"
                placeholderTextColor="#8E9AA6"
                value={momoPhone}
                onChangeText={setMomoPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!momoLoading}
              />

              <TouchableOpacity
                style={[styles.payButton, momoLoading && { opacity: 0.6 }]}
                onPress={handleMomoPayment}
                disabled={momoLoading}
                activeOpacity={0.8}
              >
                {momoLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.payButtonText}>💳  Pay Now</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkipAndSettle}
                disabled={momoLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.skipButtonText}>Skip &amp; Settle Manually</Text>
              </TouchableOpacity>

              {!momoLoading && (
                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={() => setShowMomoModal(false)}
                  activeOpacity={0.7}
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
  flex: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  container: {
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff',
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
  memberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  memberSubText: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  
  // Activity Styles
  activityItem: {
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
  activityContent: {
    flex: 1,
    marginRight: 8,
  },
  activityText: {
    fontSize: 13,
    color: '#111111',
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 4,
  },
  activityBadge: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  activityBadgeText: {
    color: '#8E9AA6',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },

  // Solo Member Styles
  soloMemberCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  soloMemberEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  soloMemberTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 6,
  },
  soloMemberSub: {
    fontSize: 13,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  soloAddButton: {
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  soloAddButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Form Section
  formSection: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
  },
  formTitle: {
    color: '#111111',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    color: '#111111',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 12,
  },
  inputFocused: {
    borderColor: '#111111',
  },
  button: {
    backgroundColor: '#111111',
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cancelLinkButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelLinkText: {
    color: '#8E9AA6',
    fontSize: 13,
    fontWeight: 'bold',
  },
  outlineAddButton: {
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  outlineAddButtonText: {
    color: '#8E9AA6',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Balances Row
  balanceRow: {
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
  balanceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  balanceSub: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  balanceBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  settleButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  settleButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  settledUpContainer: {
    backgroundColor: '#34C75910',
    borderWidth: 1,
    borderColor: '#34C75925',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  settledUpText: {
    color: '#34C759',
    fontWeight: '700',
    fontSize: 14,
  },

  // Shared Expenses list
  sharedExpenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  expenseName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  expenseSub: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  addButton: {
    backgroundColor: '#111111',
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  
  // Action Section
  actionSection: {
    borderTopWidth: 1,
    borderTopColor: '#EAEBEF',
    paddingTop: 16,
    marginTop: 8,
    gap: 8,
  },
  deleteGroupBtn: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#FF3B3010',
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
  },
  deleteGroupText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#8E9AA6',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // MoMo modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    color: '#111111',
    fontSize: 14,
    marginBottom: 16,
  },
  payButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  payButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  skipButton: {
    borderWidth: 1,
    borderColor: '#EAEBEF',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  skipButtonText: {
    color: '#8E9AA6',
    fontWeight: 'bold',
    fontSize: 13,
  },
  cancelLink: {
    alignItems: 'center',
  },


  // General
  emptyText: {
    fontSize: 14,
    color: '#8E9AA6',
    fontStyle: 'italic',
    paddingVertical: 10,
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
