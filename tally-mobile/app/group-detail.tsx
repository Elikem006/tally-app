import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groupAPI, momoAPI, isTransientApiError } from "../services/api";
import { getUserId, currentUser } from "../services/storage";
import { notifyNewSharedExpense, notifySettleUp } from "../services/notifications";
import Avatar from "../components/Avatar";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import { useConfirmModal } from "../hooks/useConfirmModal";
import { useTheme } from '../hooks/useTheme';

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
  const { colors, theme } = useTheme();
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

  // Split ratio state — EQUAL splits evenly; CUSTOM uses per-member percentages
  const [splitType, setSplitType] = useState<"EQUAL" | "CUSTOM">("EQUAL");
  const [customRatios, setCustomRatios] = useState<{ [userId: string]: string }>({});
  const [ratioError, setRatioError] = useState("");

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
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  useEffect(() => {
    fetchDetails(true);
  }, []);

  async function fetchDetails(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [detailsRes, balancesRes] = await Promise.all([
        groupAPI.getGroupDetails(String(groupId), getUserId()),
        groupAPI.getBalances(String(groupId)),
      ]);
      setDetails(detailsRes.data);
      setBalances(balancesRes.data || []);
    } catch (err: any) {
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

  // Sum of the custom percentages entered so far (missing inputs count as 0)
  const ratioTotal = (details?.members || []).reduce(
    (sum: number, m: any) => sum + (parseFloat(customRatios[String(m.userId)] || "0") || 0),
    0,
  );
  const ratiosComplete = Math.abs(ratioTotal - 100) < 0.001;

  /** "Split equally", or a per-member breakdown like "Elikem 60% · Adam 40%" */
  function splitLabel(expense: any): string {
    if (expense.splitType === "CUSTOM" && expense.splitRatios) {
      try {
        const ratios: { [userId: string]: number } = JSON.parse(expense.splitRatios);
        return Object.entries(ratios)
          .map(([uid, pct]) => {
            const member = details?.members?.find((m: any) => String(m.userId) === String(uid));
            return `${member?.name || `User #${uid}`} ${pct}%`;
          })
          .join(" · ");
      } catch {
        return "Custom split";
      }
    }
    return "Split equally";
  }

  function resetExpenseForm() {
    setExpenseAmount("");
    setExpenseDescription("");
    setSplitType("EQUAL");
    setCustomRatios({});
    setRatioError("");
  }

  async function handleAddExpense() {
    if (!expenseAmount || !expenseDescription) {
      showToast("Please enter amount and description", "error");
      return;
    }

    // Build + validate custom split ratios before submitting
    let splitRatiosJson: string | undefined;
    if (splitType === "CUSTOM") {
      const ratios: { [userId: string]: number } = {};
      for (const m of details?.members || []) {
        ratios[String(m.userId)] = parseFloat(customRatios[String(m.userId)] || "0") || 0;
      }
      const total = Object.values(ratios).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.001) {
        setRatioError("Percentages must add up to exactly 100%.");
        return;
      }
      setRatioError("");
      splitRatiosJson = JSON.stringify(ratios);
    }

    setAddingExpense(true);
    try {
      const userId = getUserId();
      if (splitType === "CUSTOM") {
        await groupAPI.addSharedExpense(
          String(groupId),
          userId,
          expenseAmount,
          expenseDescription,
          "CUSTOM",
          splitRatiosJson,
        );
      } else {
        await groupAPI.addSharedExpense(
          String(groupId),
          userId,
          expenseAmount,
          expenseDescription,
        );
      }
      const savedAmount = expenseAmount;
      const savedDescription = expenseDescription;
      resetExpenseForm();
      setShowAddExpense(false);
      await fetchDetails(false);
      showToast(
        splitType === "CUSTOM"
          ? "Expense added with custom split!"
          : "Expense added and split equally!",
        "success",
      );

      try {
        await notifyNewSharedExpense(String(groupId), "You", savedAmount, savedDescription);
      } catch {
        // Non-critical — the expense itself was saved
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to add expense", "error");
    } finally {
      setAddingExpense(false);
    }
  }

  function handleSettleUp(userId: number, name: string, amount: number) {
    const absAmount = Math.abs(amount);
    showConfirm({
      icon: '✅',
      title: 'Settle Up',
      message: `${name} is settling up GHS ${absAmount.toFixed(2)}. This will clear all group expenses.`,
      confirmText: 'Settle Up',
      confirmColor: '#00C896',
      onConfirm: () => {
        setSettlingUserId(userId);
        setSettlingName(name);
        setSettlingAmount(absAmount);
        setMomoPhone(currentUser.phoneNumber || "");
        setShowMomoModal(true);
      },
    });
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

      // Sandbox outage (backend signals "unavailable", no referenceId issued):
      // no payment was initiated, so nothing to poll and nothing to settle.
      // Present it as a calm "try again" — not a failure, not a raw error.
      if (res.data?.status === "unavailable" || !res.data?.referenceId) {
        setShowMomoModal(false);
        showToast(
          "⏳ MoMo isn't responding right now — no payment was taken. Try again shortly, or use Skip & Settle Manually.",
          "info",
        );
        return;
      }

      const referenceId: string = res.data.referenceId;

      setShowMomoModal(false);
      showToast("Payment prompt sent — please approve on your phone.", "info");

      // Wait 3 seconds then poll status
      await new Promise((r) => setTimeout(r, 3000));

      // A failed status *check* is ambiguous, not a failed payment — treat it
      // as PENDING and let the settle flow below proceed the same way it does
      // for any pending payment.
      let status = "PENDING";
      try {
        const statusRes = await momoAPI.checkStatus(referenceId);
        status = statusRes.data?.status ?? "PENDING";
      } catch {
        status = "PENDING";
      }

      if (status === "FAILED") {
        // Definitive decline from MTN — an honest error, not a pending state.
        showToast("The MoMo payment failed. Please try again.", "error");
        return;
      }

      // SUCCESSFUL or PENDING — settle the group balance
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails(false);

      try {
        await notifySettleUp(String(groupName), currentUser.userName || "A member", String(settlingAmount));
      } catch {
        // Non-critical — settle-up itself succeeded
      }

      if (status === "SUCCESSFUL") {
        showToast("Payment confirmed and group settled! ✅", "success");
      } else {
        showToast("Payment pending — group balance has been cleared.", "info");
      }
    } catch (e: any) {
      if (isTransientApiError(e)) {
        // Timeout / no response — we genuinely don't know if the payment went
        // through. Non-alarming pending message instead of a scary error.
        setShowMomoModal(false);
        showToast(
          "⏳ Payment pending — the network dropped before we could confirm. Check the group balance in a moment before retrying.",
          "info",
        );
      } else {
        showToast(e?.response?.data?.error || "The payment could not be completed. Please try again.", "error");
      }
    } finally {
      setMomoLoading(false);
    }
  }

  async function handleSkipAndSettle() {
    setShowMomoModal(false);
    try {
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails(false);
      try {
        await notifySettleUp(String(groupName), currentUser.userName || "A member", String(settlingAmount));
      } catch {
        // Non-critical
      }
      showToast("Group balance cleared (no payment sent).", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || "Failed to settle.", "error");
    }
  }

  // Only the group creator can remove members
  const isCreator = String(details?.group?.createdBy ?? "") === String(currentUser.userId ?? "");

  function handleRemoveMember(member: any) {
    const memberName = member.name || `User #${member.userId}`;
    showConfirm({
      icon: '👤',
      title: 'Remove Member',
      message: `Are you sure you want to remove ${memberName} from this group?`,
      confirmText: 'Remove',
      confirmColor: '#E05C5C',
      onConfirm: async () => {
        try {
          await groupAPI.removeMember(String(groupId), String(member.userId), getUserId());
          await fetchDetails(false);
          showToast(`${memberName} removed from group`, "success");
        } catch (err: any) {
          showToast(err?.response?.data?.error || "Failed to remove member", "error");
        }
      },
    });
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

  function handleDeleteGroup() {
    showConfirm({
      icon: '🗑️',
      title: 'Delete Group',
      message: 'This will permanently delete the group and all shared expenses. This cannot be undone.',
      confirmText: 'Delete Group',
      confirmColor: '#E05C5C',
      onConfirm: async () => {
        try {
          await groupAPI.deleteGroup(String(groupId));
          showToast("Group deleted successfully", "info");
          router.replace("/(tabs)/groups");
        } catch (err: any) {
          showToast("Failed to delete group", "error");
        }
      },
    });
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !details) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchDetails(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView 
        style={[styles.container, { backgroundColor: colors.background }]} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Card container */}
        <View style={[styles.mainCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>{groupName}</Text>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Activity</Text>
            {(() => {
              const expenses = details?.expenses || [];
              if (expenses.length === 0) {
                return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No activity yet</Text>;
              }
              const sorted = [...expenses]
                .sort((a, b) => {
                  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return tb - ta;
                })
                .slice(0, 5);

              return sorted.map((expense: any) => (
                <View key={expense.id} style={[styles.activityItem, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Avatar
                    userId={expense.paidBy}
                    name={expense.paidByName || String(expense.paidBy)}
                    size={36}
                    avatarData={expense.paidByAvatarData}
                    style={{ marginRight: 12 }}
                  />
                  <View style={styles.activityContent}>
                    <Text style={[styles.activityText, { color: colors.text }]}>
                      <Text style={{ fontWeight: "700" }}>{expense.paidByName || `User #${expense.paidBy}`}</Text> paid <Text style={{ fontWeight: "700" }}>GHS {parseFloat(expense.amount).toFixed(2)}</Text> for {expense.description}
                    </Text>
                    <Text style={[styles.activityTime, { color: colors.textSecondary }]}>{timeAgo(expense.createdAt)}</Text>
                  </View>
                  <View style={[styles.activityBadge, { backgroundColor: colors.neutralBg }]}>
                    <Text style={[styles.activityBadgeText, { color: colors.textSecondary }]}>Shared</Text>
                  </View>
                </View>
              ));
            })()}
          </View>

          {/* Members Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Members</Text>
            {details?.members?.map((member: any) => (
              <View key={member.id} style={[styles.memberRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Avatar
                  userId={member.userId}
                  name={member.name || String(member.userId)}
                  size={40}
                  avatarData={member.avatarData}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberText, { color: colors.text }]} numberOfLines={1}>
                    {member.name || `User #${member.userId}`}
                    {String(member.userId) === String(details?.group?.createdBy) ? "  👑" : ""}
                  </Text>
                  <Text style={[styles.memberSubText, { color: colors.textSecondary }]}>ID: #{member.userId}</Text>
                </View>
                {/* Remove button — creator only, never on the creator's own row */}
                {isCreator && String(member.userId) !== String(details?.group?.createdBy) && (
                  <TouchableOpacity
                    style={[styles.removeMemberBtn, { backgroundColor: colors.negative + "12", borderColor: colors.negative + "30" }]}
                    onPress={() => handleRemoveMember(member)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.removeMemberBtnText, { color: colors.negative }]}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Solo empty state */}
          {details?.members?.length === 1 && (
            <View style={[styles.soloMemberCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={styles.soloMemberEmoji}>👥</Text>
              <Text style={[styles.soloMemberTitle, { color: colors.text }]}>You're the only member here</Text>
              <Text style={[styles.soloMemberSub, { color: colors.textSecondary }]}>
                Add members to start splitting expenses with friends.
              </Text>
              <TouchableOpacity
                style={[styles.soloAddButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddMember(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.soloAddButtonText}>+ Add Member</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Member Form */}
          {showAddMember && (
            <View style={[styles.formSection, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Add Member by User ID</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text },
                  memberInputFocused && { borderColor: colors.primary }
                ]}
                placeholder="Enter User ID (e.g. 2)"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                value={memberUserId}
                onChangeText={setMemberUserId}
                onFocus={() => setMemberInputFocused(true)}
                onBlur={() => setMemberInputFocused(false)}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }, addingMember && styles.buttonDisabled]}
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
                <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddMember && details?.members?.length > 1 && (
            <TouchableOpacity style={[styles.outlineAddButton, { borderColor: colors.border }]} onPress={() => setShowAddMember(true)} activeOpacity={0.8}>
              <Text style={[styles.outlineAddButtonText, { color: colors.primary }]}>+ Add Member</Text>
            </TouchableOpacity>
          )}

          {/* Balances Section */}
          {balances.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Balances</Text>
              {balances.map((b: any, index: number) => {
                const isCurrentUser = String(b.userId) === String(currentUser.userId);
                return (
                <View
                  key={index}
                  style={[
                    styles.balanceRow,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                    // Highlight the viewing user's own balance row
                    isCurrentUser && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.primary + "0D" },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 }}>
                    <Avatar
                      userId={b.userId}
                      name={b.name || String(b.userId)}
                      size={40}
                      avatarData={b.avatarData}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.balanceText, { color: colors.text }]} numberOfLines={1}>
                        {isCurrentUser ? `${b.name || `User #${b.userId}`} (You)` : (b.name || `User #${b.userId}`)}
                      </Text>
                      <Text style={[styles.balanceSub, { color: colors.textSecondary }]}>
                        {b.owes ? "Owes money" : "Is owed money"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View
                      style={[
                        styles.balanceBadge,
                        {
                          backgroundColor: b.owes ? colors.negative + "12" : colors.positive + "12",
                          borderColor: b.owes ? colors.negative + "30" : colors.positive + "30",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.balanceAmount,
                          { color: b.owes ? colors.negative : colors.positive },
                        ]}
                      >
                        {b.owes ? "Owes" : "Owed"} GHS {Math.abs(parseFloat(b.balance)).toFixed(2)}
                      </Text>
                    </View>
                    {b.owes && String(b.userId) === String(currentUser.userId) && (
                      <TouchableOpacity
                        style={[styles.settleButton, { backgroundColor: colors.primary }]}
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
                );
              })}
            </View>
          )}

          {balances.length === 0 && (details?.members?.length ?? 0) > 1 && (
            <View style={[styles.settledUpContainer, { backgroundColor: colors.positive + '15' }]}>
              <Text style={[styles.settledUpText, { color: colors.positive }]}>Everyone is settled up! 🎉</Text>
            </View>
          )}

          {/* Fairness Score — 100 means everyone has paid exactly their fair share */}
          {(() => {
            const unsettled = (details?.expenses || []).filter((e: any) => !e.settled);
            const totalSpending = unsettled.reduce(
              (s: number, e: any) => s + (parseFloat(e.amount) || 0), 0);
            if (totalSpending <= 0 || (details?.members?.length ?? 0) < 2) return null;

            // Each balance is (paid − fair share); sum of |deviations| vs total
            const sumAbsDev = balances.reduce(
              (s: number, b: any) => s + Math.abs(parseFloat(b.balance) || 0), 0);
            const score = Math.round(Math.max(0, Math.min(1, 1 - sumAbsDev / totalSpending)) * 100);
            const barColor = score >= 80 ? colors.positive : score >= 50 ? '#FF9500' : colors.negative;

            return (
              <View style={[styles.fairnessCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <View style={styles.fairnessHeader}>
                  <Text style={[styles.fairnessLabel, { color: colors.textSecondary }]}>⚖️ GROUP FAIRNESS</Text>
                  <Text style={[styles.fairnessScore, { color: barColor }]}>{score}/100</Text>
                </View>
                <View style={[styles.fairnessTrack, { backgroundColor: colors.neutralBg }]}>
                  <View style={[styles.fairnessFill, { width: `${score}%` as any, backgroundColor: barColor }]} />
                </View>
                <Text style={[styles.fairnessHint, { color: colors.textSecondary }]}>
                  {score === 100
                    ? 'Everyone has paid exactly their fair share'
                    : 'How evenly members have paid vs their fair share'}
                </Text>
              </View>
            );
          })()}

          {/* Shared Expenses List */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Shared Expenses</Text>
            {details?.expenses?.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No shared expenses yet</Text>
            ) : (
              details?.expenses?.map((expense: any) => {
                // Personalized view: what THIS user paid or owes for each expense
                const hasPersonalized = expense.userShare !== undefined && expense.userShare !== null;
                const userShare = parseFloat(expense.userShare ?? "0") || 0;
                const fullAmount = parseFloat(expense.amount) || 0;
                const othersCount = Math.max((expense.memberCount ?? details?.members?.length ?? 1) - 1, 0);

                if (hasPersonalized && expense.isPayer) {
                  return (
                    <View key={expense.id} style={[styles.sharedExpenseRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={2}>
                          You paid GHS {fullAmount.toFixed(2)} for {expense.description}
                        </Text>
                        <Text style={[styles.expenseSub, { color: colors.textSecondary }]}>
                          Split with {othersCount} other{othersCount === 1 ? "" : "s"} — you covered GHS {userShare.toFixed(2)} • {splitLabel(expense)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.expenseAmount, { color: colors.positive }]}>
                          GHS {fullAmount.toFixed(2)}
                        </Text>
                        {expense.settled && (
                          <Text style={{ color: colors.positive, fontSize: 10, fontWeight: '700', marginTop: 2 }}>Settled ✓</Text>
                        )}
                      </View>
                    </View>
                  );
                }

                if (hasPersonalized) {
                  return (
                    <View key={expense.id} style={[styles.sharedExpenseRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={2}>
                          Your share: GHS {userShare.toFixed(2)}
                        </Text>
                        <Text style={[styles.expenseSub, { color: colors.textSecondary }]}>
                          {expense.paidByName || `User #${expense.paidBy}`} paid GHS {fullAmount.toFixed(2)} total for {expense.description} • {splitLabel(expense)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.expenseAmount, { color: colors.negative }]}>
                          GHS {userShare.toFixed(2)}
                        </Text>
                        {expense.settled && (
                          <Text style={{ color: colors.positive, fontSize: 10, fontWeight: '700', marginTop: 2 }}>Settled ✓</Text>
                        )}
                      </View>
                    </View>
                  );
                }

                // Fallback — non-personalized response
                return (
                  <View key={expense.id} style={[styles.sharedExpenseRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={[styles.expenseName, { color: colors.text }]} numberOfLines={1}>{expense.description}</Text>
                      <Text style={[styles.expenseSub, { color: colors.textSecondary }]}>
                        Paid by {expense.paidByName || `User #${expense.paidBy}`} • {splitLabel(expense)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.expenseAmount, { color: colors.text }]}>
                        GHS {fullAmount.toFixed(2)}
                      </Text>
                      {expense.settled && (
                        <Text style={{ color: colors.positive, fontSize: 10, fontWeight: '700', marginTop: 2 }}>Settled ✓</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Add Expense Form (if toggled open) */}
          {showAddExpense && (
            <View style={[styles.formSection, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Add Shared Expense</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text },
                  descFocused && { borderColor: colors.primary }
                ]}
                placeholder="Description (e.g. Dinner)"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
              />
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text },
                  amtFocused && { borderColor: colors.primary }
                ]}
                placeholder="Amount (GHS)"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                onFocus={() => setAmtFocused(true)}
                onBlur={() => setAmtFocused(false)}
                keyboardType="decimal-pad"
              />

              {/* Split type selector */}
              <View style={styles.splitTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.splitTypeBtn,
                    { backgroundColor: colors.cardBg, borderColor: colors.border },
                    splitType === "EQUAL" && { backgroundColor: colors.positive + "18", borderColor: colors.positive },
                  ]}
                  onPress={() => {
                    setSplitType("EQUAL");
                    setRatioError("");
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.splitTypeText,
                      { color: colors.textSecondary },
                      splitType === "EQUAL" && { color: colors.positive, fontWeight: "700" },
                    ]}
                  >
                    ⚖️ Equal Split
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.splitTypeBtn,
                    { backgroundColor: colors.cardBg, borderColor: colors.border },
                    splitType === "CUSTOM" && { backgroundColor: colors.positive + "18", borderColor: colors.positive },
                  ]}
                  onPress={() => {
                    setSplitType("CUSTOM");
                    setRatioError("");
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.splitTypeText,
                      { color: colors.textSecondary },
                      splitType === "CUSTOM" && { color: colors.positive, fontWeight: "700" },
                    ]}
                  >
                    🎯 Custom Split
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Per-member percentage inputs (custom split only) */}
              {splitType === "CUSTOM" && (
                <View style={styles.ratioSection}>
                  {details?.members?.map((member: any) => (
                    <View key={member.userId} style={styles.ratioRow}>
                      <Avatar
                        userId={member.userId}
                        name={member.name || String(member.userId)}
                        size={32}
                        avatarData={member.avatarData}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[styles.ratioName, { color: colors.text }]} numberOfLines={1}>
                        {member.name || `User #${member.userId}`}
                      </Text>
                      <TextInput
                        style={[
                          styles.ratioInput,
                          { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text },
                        ]}
                        value={customRatios[String(member.userId)] ?? ""}
                        onChangeText={(text) => {
                          setCustomRatios((prev) => ({
                            ...prev,
                            [String(member.userId)]: text.replace(/[^0-9]/g, ""),
                          }));
                          setRatioError("");
                        }}
                        keyboardType="numeric"
                        maxLength={3}
                        placeholder="0"
                        placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                      />
                      <Text style={[styles.ratioPercent, { color: colors.textSecondary }]}>%</Text>
                    </View>
                  ))}

                  {/* Real-time total validator */}
                  <Text
                    style={[
                      styles.ratioStatus,
                      {
                        color: ratiosComplete
                          ? colors.positive
                          : ratioTotal < 100
                          ? "#FF9500"
                          : colors.negative,
                      },
                    ]}
                  >
                    {ratiosComplete
                      ? `Total: ${ratioTotal}% — ✓ Splits add up to 100%`
                      : ratioTotal < 100
                      ? `Total: ${ratioTotal}% — ${+(100 - ratioTotal).toFixed(2)}% remaining to allocate`
                      : `Total: ${ratioTotal}% — ${+(ratioTotal - 100).toFixed(2)}% over 100% — reduce some values`}
                  </Text>
                  {!!ratioError && (
                    <Text style={[styles.ratioStatus, { color: colors.negative }]}>{ratioError}</Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  (addingExpense || (splitType === "CUSTOM" && !ratiosComplete)) && styles.buttonDisabled,
                ]}
                onPress={handleAddExpense}
                disabled={addingExpense || (splitType === "CUSTOM" && !ratiosComplete)}
                activeOpacity={0.85}
              >
                {addingExpense ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {splitType === "CUSTOM" ? "Add & Split Custom" : "Add & Split Equally"}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelLinkButton}
                onPress={() => {
                  setShowAddExpense(false);
                  resetExpenseForm();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddExpense && details?.members?.length > 1 && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddExpense(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.addButtonText}>+ Add Shared Expense</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionSection}>
            <TouchableOpacity style={[styles.deleteGroupBtn, { backgroundColor: colors.neutralBg }]} onPress={handleDeleteGroup} activeOpacity={0.8}>
              <Text style={[styles.deleteGroupText, { color: colors.negative }]}>Delete Group</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.neutralBg }]} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={[styles.backButtonText, { color: colors.text }]}>← Back to Groups</Text>
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
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Pay with MoMo</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Settling{" "}
                <Text style={{ color: "#D97706", fontWeight: "bold" }}>
                  GHS {settlingAmount.toFixed(2)}
                </Text>{" "}
                with {settlingName}
              </Text>

              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="Enter MoMo number e.g. 0241234567"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                value={momoPhone}
                onChangeText={setMomoPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!momoLoading}
              />

              <TouchableOpacity
                style={[styles.payButton, { backgroundColor: "#D97706" }, momoLoading && { opacity: 0.6 }]}
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
                style={[styles.skipButton, { backgroundColor: colors.neutralBg }]}
                onPress={handleSkipAndSettle}
                disabled={momoLoading}
                activeOpacity={0.8}
              >
                <Text style={[styles.skipButtonText, { color: colors.text }]}>Skip &amp; Settle Manually</Text>
              </TouchableOpacity>

              {!momoLoading && (
                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={() => setShowMomoModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {ConfirmModalComponent}
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
  removeMemberBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  removeMemberBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 16,
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
  // Split ratio controls
  splitTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  splitTypeBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTypeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratioSection: {
    marginBottom: 12,
    gap: 8,
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratioName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
  },
  ratioInput: {
    width: 64,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  ratioPercent: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    width: 18,
  },
  ratioStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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

  // Fairness score card
  fairnessCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  fairnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fairnessLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  fairnessScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  fairnessTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fairnessFill: {
    height: '100%',
    borderRadius: 4,
  },
  fairnessHint: {
    fontSize: 11,
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
