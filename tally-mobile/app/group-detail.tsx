import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupAPI, momoAPI, isTransientApiError } from '../services/api';
import { getUserId, currentUser } from '../services/storage';
import { notifyNewSharedExpense, notifySettleUp } from '../services/notifications';
import Avatar from '../components/Avatar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Button, Input, ProgressBar, Skeleton } from '../components/ui';
import { MemberRow } from '../components/group/MemberRow';
import { BalanceRow } from '../components/group/BalanceRow';
import { SharedExpenseRow } from '../components/group/SharedExpenseRow';

function timeAgo(createdAt: string) {
  if (!createdAt) return '';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const d = new Date(createdAt);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { groupId, groupName } = useLocalSearchParams();

  const [details, setDetails] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form toggles and fields
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  // Split ratio state — EQUAL splits evenly; CUSTOM uses per-member percentages
  const [splitType, setSplitType] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [customRatios, setCustomRatios] = useState<{ [userId: string]: string }>({});
  const [ratioError, setRatioError] = useState('');

  const [showAddMember, setShowAddMember] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // MoMo settle up modal states
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || '');
  const [settlingUserId, setSettlingUserId] = useState<number | null>(null);
  const [settlingName, setSettlingName] = useState('');
  const [settlingAmount, setSettlingAmount] = useState(0);
  const [momoLoading, setMomoLoading] = useState(false);

  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();
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
    (sum: number, m: any) => sum + (parseFloat(customRatios[String(m.userId)] || '0') || 0),
    0,
  );
  const ratiosComplete = Math.abs(ratioTotal - 100) < 0.001;

  /** "Split equally", or a per-member breakdown like "Elikem 60% · Adam 40%" */
  function splitLabel(expense: any): string {
    if (expense.splitType === 'CUSTOM' && expense.splitRatios) {
      try {
        const ratios: { [userId: string]: number } = JSON.parse(expense.splitRatios);
        return Object.entries(ratios)
          .map(([uid, pct]) => {
            const member = details?.members?.find((m: any) => String(m.userId) === String(uid));
            return `${member?.name || `User #${uid}`} ${pct}%`;
          })
          .join(' · ');
      } catch {
        return 'Custom split';
      }
    }
    return 'Split equally';
  }

  function resetExpenseForm() {
    setExpenseAmount('');
    setExpenseDescription('');
    setSplitType('EQUAL');
    setCustomRatios({});
    setRatioError('');
  }

  async function handleAddExpense() {
    if (!expenseAmount || !expenseDescription) {
      showToast('Please enter amount and description', 'error');
      return;
    }
    // Matches the personal add-expense rule — "0" and "-5" are truthy strings,
    // so the check above let them through to the API unvalidated.
    if (isNaN(parseFloat(expenseAmount)) || parseFloat(expenseAmount) <= 0) {
      showToast('Please enter a valid amount greater than zero', 'error');
      return;
    }

    // Build + validate custom split ratios before submitting
    let splitRatiosJson: string | undefined;
    if (splitType === 'CUSTOM') {
      const ratios: { [userId: string]: number } = {};
      for (const m of details?.members || []) {
        ratios[String(m.userId)] = parseFloat(customRatios[String(m.userId)] || '0') || 0;
      }
      const total = Object.values(ratios).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.001) {
        setRatioError('Percentages must add up to exactly 100%.');
        return;
      }
      setRatioError('');
      splitRatiosJson = JSON.stringify(ratios);
    }

    setAddingExpense(true);
    try {
      const userId = getUserId();
      if (splitType === 'CUSTOM') {
        await groupAPI.addSharedExpense(
          String(groupId),
          userId,
          expenseAmount,
          expenseDescription,
          'CUSTOM',
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
        splitType === 'CUSTOM'
          ? 'Expense added with custom split!'
          : 'Expense added and split equally!',
        'success',
      );

      try {
        await notifyNewSharedExpense(String(groupId), 'You', savedAmount, savedDescription);
      } catch {
        // Non-critical — the expense itself was saved
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Failed to add expense', 'error');
    } finally {
      setAddingExpense(false);
    }
  }

  function handleSettleUp(userId: number, name: string, amount: number) {
    const absAmount = Math.abs(amount);
    showConfirm({
      icon: 'check-circle',
      title: 'Settle Up',
      message: `${name} is settling up GHS ${absAmount.toFixed(2)}. This will clear all group expenses.`,
      confirmText: 'Settle Up',
      confirmColor: colors.positive,
      onConfirm: () => {
        setSettlingUserId(userId);
        setSettlingName(name);
        setSettlingAmount(absAmount);
        setMomoPhone(currentUser.phoneNumber || '');
        setShowMomoModal(true);
      },
    });
  }

  async function handleMomoPayment() {
    const phone = momoPhone.trim();
    if (!phone) {
      showToast('Please enter your MoMo phone number.', 'error');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      showToast('Phone number must be exactly 10 digits.', 'error');
      return;
    }

    setMomoLoading(true);
    try {
      const res = await momoAPI.requestPayment(
        String(groupId),
        currentUser.userId,
        phone,
        String(settlingAmount),
        'Tally group settle-up',
      );

      // Sandbox outage (backend signals "unavailable", no referenceId issued):
      // no payment was initiated, so nothing to poll and nothing to settle.
      // Present it as a calm "try again" — not a failure, not a raw error.
      if (res.data?.status === 'unavailable' || !res.data?.referenceId) {
        setShowMomoModal(false);
        showToast(
          "⏳ MoMo isn't responding right now — no payment was taken. Try again shortly, or use Skip & Settle Manually.",
          'info',
        );
        return;
      }

      const referenceId: string = res.data.referenceId;

      setShowMomoModal(false);
      showToast('Payment prompt sent — please approve on your phone.', 'info');

      // Wait 3 seconds then poll status
      await new Promise((r) => setTimeout(r, 3000));

      // A failed status *check* is ambiguous, not a failed payment — treat it
      // as PENDING and let the settle flow below proceed the same way it does
      // for any pending payment.
      let status = 'PENDING';
      try {
        const statusRes = await momoAPI.checkStatus(referenceId);
        status = statusRes.data?.status ?? 'PENDING';
      } catch {
        status = 'PENDING';
      }

      if (status === 'FAILED') {
        // Definitive decline from MTN — an honest error, not a pending state.
        showToast('The MoMo payment failed. Please try again.', 'error');
        return;
      }

      // SUCCESSFUL or PENDING — settle the group balance
      await groupAPI.settleUp(String(groupId), String(settlingUserId));
      await fetchDetails(false);

      try {
        await notifySettleUp(String(groupName), currentUser.userName || 'A member', String(settlingAmount));
      } catch {
        // Non-critical — settle-up itself succeeded
      }

      if (status === 'SUCCESSFUL') {
        showToast('Payment confirmed and group settled! ✅', 'success');
      } else {
        showToast('Payment pending — group balance has been cleared.', 'info');
      }
    } catch (e: any) {
      if (isTransientApiError(e)) {
        // Timeout / no response — we genuinely don't know if the payment went
        // through. Non-alarming pending message instead of a scary error.
        setShowMomoModal(false);
        showToast(
          '⏳ Payment pending — the network dropped before we could confirm. Check the group balance in a moment before retrying.',
          'info',
        );
      } else {
        showToast(e?.response?.data?.error || 'The payment could not be completed. Please try again.', 'error');
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
        await notifySettleUp(String(groupName), currentUser.userName || 'A member', String(settlingAmount));
      } catch {
        // Non-critical
      }
      showToast('Group balance cleared (no payment sent).', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to settle.', 'error');
    }
  }

  // Only the group creator can remove members
  const isCreator = String(details?.group?.createdBy ?? '') === String(currentUser.userId ?? '');

  function handleRemoveMember(member: any) {
    const memberName = member.name || `User #${member.userId}`;
    showConfirm({
      icon: 'user-minus',
      title: 'Remove Member',
      message: `Are you sure you want to remove ${memberName} from this group?`,
      confirmText: 'Remove',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        try {
          await groupAPI.removeMember(String(groupId), String(member.userId), getUserId());
          await fetchDetails(false);
          showToast(`${memberName} removed from group`, 'success');
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Failed to remove member', 'error');
        }
      },
    });
  }

  async function handleAddMember() {
    if (!memberUserId) {
      showToast('Please enter a user ID', 'error');
      return;
    }
    setAddingMember(true);
    try {
      await groupAPI.addMember(String(groupId), memberUserId);
      setMemberUserId('');
      setShowAddMember(false);
      await fetchDetails(false);
      showToast('Member added successfully!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Failed to add member. Check the User ID.', 'error');
    } finally {
      setAddingMember(false);
    }
  }

  function handleDeleteGroup() {
    showConfirm({
      icon: 'trash-2',
      title: 'Delete Group',
      message: 'This will permanently delete the group and all shared expenses. This cannot be undone.',
      confirmText: 'Delete Group',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        try {
          await groupAPI.deleteGroup(String(groupId));
          showToast('Group deleted successfully', 'info');
          router.replace('/(tabs)/groups');
        } catch (err: any) {
          showToast('Failed to delete group', 'error');
        }
      },
    });
  }

  if (loading && !refreshing) {
    // Shaped like the card below rather than a spinner on a blank screen. The
    // group name is a route param and is known immediately, so it renders for
    // real — only the fetched sections below it are placeheld.
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}>
          <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
            <Text
              style={[typography.display, { color: colors.text, marginBottom: spacing.xl }]}
              accessibilityRole="header"
            >
              {groupName}
            </Text>
            <Skeleton width="40%" height={13} style={{ marginBottom: spacing.md }} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} borderRadius={radius.lg} style={{ marginBottom: spacing.sm }} />
            ))}
            <Skeleton width="35%" height={13} style={{ marginTop: spacing.lg, marginBottom: spacing.md }} />
            {[0, 1].map((i) => (
              <Skeleton key={i} height={64} borderRadius={radius.lg} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        </View>
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
        <Feather name="alert-triangle" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.lg }} />
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>{error}</Text>
        <Button title="Retry" onPress={() => fetchDetails(true)} fullWidth={false} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xl }]} accessibilityRole="header">{groupName}</Text>

          {/* Recent Activity */}
          <View style={styles.section}>
            <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.md }]}>Recent Activity</Text>
            {(() => {
              const expenses = details?.expenses || [];
              if (expenses.length === 0) {
                return <Text style={[typography.body, { color: colors.textSecondary, fontStyle: 'italic', paddingVertical: spacing.sm }]}>No activity yet</Text>;
              }
              const sorted = [...expenses]
                .sort((a, b) => {
                  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return tb - ta;
                })
                .slice(0, 5);

              return sorted.map((expense: any) => (
                <View key={expense.id} style={[styles.activityItem, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
                  <Avatar userId={expense.paidBy} name={expense.paidByName || String(expense.paidBy)} size={36} avatarData={expense.paidByAvatarData} style={{ marginRight: spacing.md }} />
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[typography.caption, { color: colors.text, lineHeight: 18 }]}>
                      <Text style={{ fontFamily: typography.bodyStrong.fontFamily }}>{expense.paidByName || `User #${expense.paidBy}`}</Text> paid <Text style={{ fontFamily: typography.bodyStrong.fontFamily }}>GHS {parseFloat(expense.amount).toFixed(2)}</Text> for {expense.description}
                    </Text>
                    <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.xs }]}>{timeAgo(expense.createdAt)}</Text>
                  </View>
                  <View style={[styles.activityBadge, { backgroundColor: colors.neutralBg }]}>
                    <Text style={[typography.label, { color: colors.textSecondary }]}>Shared</Text>
                  </View>
                </View>
              ));
            })()}
          </View>

          {/* Members Section */}
          <View style={styles.section}>
            <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.md }]}>Members</Text>
            {details?.members?.map((member: any, idx: number) => (
              <MemberRow
                key={member.id}
                index={idx}
                userId={member.userId}
                name={member.name || `User #${member.userId}`}
                avatarData={member.avatarData}
                isCreator={String(member.userId) === String(details?.group?.createdBy)}
                onRemove={
                  isCreator && String(member.userId) !== String(details?.group?.createdBy)
                    ? () => handleRemoveMember(member)
                    : undefined
                }
              />
            ))}
          </View>

          {/* Solo empty state */}
          {details?.members?.length === 1 && (
            <View style={[styles.soloMemberCard, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
              {/* The card wrapper stays (it is an inline section, not a
                  full-screen empty state), but the mark now matches
                  EmptyState's: 64px tinted circle, 28px glyph. */}
              <View style={[styles.soloMark, { backgroundColor: colors.primarySubtle }]}>
                <Feather name="user-plus" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.headline, { color: colors.text, marginBottom: spacing.xs }]}>You're the only member here</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }]}>
                Add members to start splitting expenses with friends.
              </Text>
              <Button title="+ Add Member" onPress={() => setShowAddMember(true)} fullWidth={false} />
            </View>
          )}

          {/* Add Member Form */}
          {showAddMember && (
            <View style={[styles.formSection, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>Add Member by User ID</Text>
              <Input
                label="User ID"
                placeholder="Enter User ID (e.g. 2)"
                value={memberUserId}
                onChangeText={setMemberUserId}
                keyboardType="numeric"
                containerStyle={{ marginBottom: spacing.md }}
              />
              <Button title="Add Member" onPress={handleAddMember} loading={addingMember} />
              <TouchableOpacity style={styles.cancelLink} onPress={() => setShowAddMember(false)} activeOpacity={0.7}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddMember && details?.members?.length > 1 && (
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.border }]} onPress={() => setShowAddMember(true)} activeOpacity={0.8}>
              <Text style={[typography.labelStrong, { color: colors.primary }]}>+ Add Member</Text>
            </TouchableOpacity>
          )}

          {/* Balances Section */}
          {balances.length > 0 && (
            <View style={styles.section}>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.md }]}>Balances</Text>
              {balances.map((b: any, index: number) => {
                const isCurrentUser = String(b.userId) === String(currentUser.userId);
                return (
                  <BalanceRow
                    key={index}
                    index={index}
                    userId={b.userId}
                    name={b.name || `User #${b.userId}`}
                    avatarData={b.avatarData}
                    owes={!!b.owes}
                    amount={Math.abs(parseFloat(b.balance))}
                    isCurrentUser={isCurrentUser}
                    onSettleUp={
                      b.owes && isCurrentUser
                        ? () => handleSettleUp(b.userId, b.name || `User #${b.userId}`, parseFloat(b.balance))
                        : undefined
                    }
                  />
                );
              })}
            </View>
          )}

          {balances.length === 0 && (details?.members?.length ?? 0) > 1 && (
            <View style={[styles.settledUpContainer, { backgroundColor: `${colors.positive}15` }]}>
              <Text style={[typography.bodyStrong, { color: colors.positive }]}>Everyone is settled up! 🎉</Text>
            </View>
          )}

          {/* Fairness Score — 100 means everyone has paid exactly their fair share */}
          {(() => {
            const unsettled = (details?.expenses || []).filter((e: any) => !e.settled);
            const totalSpending = unsettled.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0);
            if (totalSpending <= 0 || (details?.members?.length ?? 0) < 2) return null;

            const sumAbsDev = balances.reduce((s: number, b: any) => s + Math.abs(parseFloat(b.balance) || 0), 0);
            const score = Math.round(Math.max(0, Math.min(1, 1 - sumAbsDev / totalSpending)) * 100);
            const barColor = score >= 80 ? colors.positive : score >= 50 ? colors.warning : colors.negative;

            return (
              <View style={[styles.fairnessCard, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
                <View style={styles.fairnessHeader}>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>⚖️ GROUP FAIRNESS</Text>
                  <Text style={[typography.bodyStrong, { color: barColor }]}>{score}/100</Text>
                </View>
                <ProgressBar percentage={score} style={{ marginBottom: spacing.sm }} />
                <Text style={[typography.label, { color: colors.textSecondary }]}>
                  {score === 100
                    ? 'Everyone has paid exactly their fair share'
                    : 'How evenly members have paid vs their fair share'}
                </Text>
              </View>
            );
          })()}

          {/* Shared Expenses List */}
          <View style={styles.section}>
            <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.md }]}>Shared Expenses</Text>
            {details?.expenses?.length === 0 ? (
              <Text style={[typography.body, { color: colors.textSecondary, fontStyle: 'italic', paddingVertical: spacing.sm }]}>No shared expenses yet</Text>
            ) : (
              details?.expenses?.map((expense: any, idx: number) => {
                const hasPersonalized = expense.userShare !== undefined && expense.userShare !== null;
                const userShare = parseFloat(expense.userShare ?? '0') || 0;
                const fullAmount = parseFloat(expense.amount) || 0;
                const othersCount = Math.max((expense.memberCount ?? details?.members?.length ?? 1) - 1, 0);

                if (hasPersonalized && expense.isPayer) {
                  return (
                    <SharedExpenseRow
                      key={expense.id}
                      index={idx}
                      title={`You paid GHS ${fullAmount.toFixed(2)} for ${expense.description}`}
                      subtitle={`Split with ${othersCount} other${othersCount === 1 ? '' : 's'} — you covered GHS ${userShare.toFixed(2)} • ${splitLabel(expense)}`}
                      amount={`GHS ${fullAmount.toFixed(2)}`}
                      amountColor={colors.positive}
                      settled={expense.settled}
                    />
                  );
                }

                if (hasPersonalized) {
                  return (
                    <SharedExpenseRow
                      key={expense.id}
                      index={idx}
                      title={`Your share: GHS ${userShare.toFixed(2)}`}
                      subtitle={`${expense.paidByName || `User #${expense.paidBy}`} paid GHS ${fullAmount.toFixed(2)} total for ${expense.description} • ${splitLabel(expense)}`}
                      amount={`GHS ${userShare.toFixed(2)}`}
                      amountColor={colors.negative}
                      settled={expense.settled}
                    />
                  );
                }

                return (
                  <SharedExpenseRow
                    key={expense.id}
                    index={idx}
                    title={expense.description}
                    subtitle={`Paid by ${expense.paidByName || `User #${expense.paidBy}`} • ${splitLabel(expense)}`}
                    amount={`GHS ${fullAmount.toFixed(2)}`}
                    amountColor={colors.text}
                    settled={expense.settled}
                  />
                );
              })
            )}
          </View>

          {/* Add Expense Form */}
          {showAddExpense && (
            <View style={[styles.formSection, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>Add Shared Expense</Text>
              <Input
                label="Description"
                placeholder="e.g. Dinner"
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                containerStyle={{ marginBottom: spacing.md }}
              />
              <Input
                label="Amount (GHS)"
                placeholder="0.00"
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                keyboardType="decimal-pad"
                containerStyle={{ marginBottom: spacing.md }}
              />

              {/* Split type selector */}
              <View style={styles.splitTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.splitTypeBtn,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    splitType === 'EQUAL' && { backgroundColor: `${colors.positive}18`, borderColor: colors.positive },
                  ]}
                  onPress={() => { setSplitType('EQUAL'); setRatioError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[typography.caption, { color: splitType === 'EQUAL' ? colors.positive : colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>
                    ⚖️ Equal Split
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.splitTypeBtn,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    splitType === 'CUSTOM' && { backgroundColor: `${colors.positive}18`, borderColor: colors.positive },
                  ]}
                  onPress={() => { setSplitType('CUSTOM'); setRatioError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[typography.caption, { color: splitType === 'CUSTOM' ? colors.positive : colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>
                    🎯 Custom Split
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Per-member percentage inputs (custom split only) */}
              {splitType === 'CUSTOM' && (
                <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
                  {details?.members?.map((member: any) => (
                    <View key={member.userId} style={styles.ratioRow}>
                      <Avatar userId={member.userId} name={member.name || String(member.userId)} size={32} avatarData={member.avatarData} style={{ marginRight: spacing.sm + 2 }} />
                      <Text style={[typography.bodyCompact, { color: colors.text, flex: 1, marginRight: spacing.sm + 2 }]} numberOfLines={1}>
                        {member.name || `User #${member.userId}`}
                      </Text>
                      <TextInput
                        style={[typography.bodyStrong, styles.ratioInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }]}
                        value={customRatios[String(member.userId)] ?? ''}
                        onChangeText={(text) => {
                          setCustomRatios((prev) => ({ ...prev, [String(member.userId)]: text.replace(/[^0-9]/g, '') }));
                          setRatioError('');
                        }}
                        keyboardType="numeric"
                        maxLength={3}
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                      />
                      <Text style={[typography.bodyStrong, { color: colors.textSecondary, marginLeft: spacing.xs + 2, width: 18 }]}>%</Text>
                    </View>
                  ))}

                  <Text
                    style={[
                      typography.caption,
                      { fontFamily: typography.bodyStrong.fontFamily, color: ratiosComplete ? colors.positive : ratioTotal < 100 ? colors.warning : colors.negative },
                    ]}
                  >
                    {ratiosComplete
                      ? `Total: ${ratioTotal}% — ✓ Splits add up to 100%`
                      : ratioTotal < 100
                        ? `Total: ${ratioTotal}% — ${+(100 - ratioTotal).toFixed(2)}% remaining to allocate`
                        : `Total: ${ratioTotal}% — ${+(ratioTotal - 100).toFixed(2)}% over 100% — reduce some values`}
                  </Text>
                  {!!ratioError && (
                    <Text style={[typography.caption, { color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>{ratioError}</Text>
                  )}
                </View>
              )}

              <Button
                title={splitType === 'CUSTOM' ? 'Add & Split Custom' : 'Add & Split Equally'}
                onPress={handleAddExpense}
                loading={addingExpense}
                disabled={splitType === 'CUSTOM' && !ratiosComplete}
              />
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={() => { setShowAddExpense(false); resetExpenseForm(); }}
                activeOpacity={0.7}
              >
                <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showAddExpense && details?.members?.length > 1 && (
            <Button title="+ Add Shared Expense" onPress={() => setShowAddExpense(true)} style={{ marginBottom: spacing.md }} />
          )}

          <View style={[styles.actionSection, { borderTopColor: colors.borderSubtle }]}>
            <Button title="Delete Group" onPress={handleDeleteGroup} variant="danger" />
            <TouchableOpacity style={styles.backLink} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={[typography.labelStrong, { color: colors.textSecondary }]}>← Back to Groups</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── MoMo Payment Modal ── */}
      <Modal visible={showMomoModal} transparent animationType="fade" onRequestClose={() => !momoLoading && setShowMomoModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
            <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.headline, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]}>Pay with MoMo</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
                Settling <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>GHS {settlingAmount.toFixed(2)}</Text> with {settlingName}
              </Text>

              <Input
                label="MoMo Number"
                placeholder="e.g. 0241234567"
                value={momoPhone}
                onChangeText={setMomoPhone}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!momoLoading}
                containerStyle={{ marginBottom: spacing.lg }}
              />

              <Button title="💳  Pay Now" onPress={handleMomoPayment} loading={momoLoading} variant="accent" style={{ marginBottom: spacing.sm }} />
              <Button title="Skip & Settle Manually" onPress={handleSkipAndSettle} variant="secondary" disabled={momoLoading} style={{ marginBottom: spacing.md }} />

              {!momoLoading && (
                <TouchableOpacity style={styles.cancelLink} onPress={() => setShowMomoModal(false)} activeOpacity={0.7}>
                  <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {ConfirmModalComponent}
      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  section: {
    marginBottom: spacing.xl,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  activityBadge: {
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  soloMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  soloMemberCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  formSection: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  cancelLink: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  splitTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  splitTypeBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratioInput: {
    width: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
  settledUpContainer: {
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  fairnessCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  fairnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
  },
  actionSection: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  backLink: {
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
  },
});
