import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { momoAPI, isTransientApiError } from '../services/api';
import { getUserId, safeStorage } from '../services/storage';
import { addHistoryItem } from '../services/notificationHistory';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getExtendedColors, getCategoryColor, typography, spacing, radius } from '../theme';
import { Input, Button, Chip, getCategoryIconName } from '../components/ui';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

export default function PayVendorScreen() {
  const router = useRouter();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  const {
    amount: initialAmount,
    description: initialDescription,
    category: initialCategory,
    fromAddExpense,
  } = useLocalSearchParams<{
    amount?: string;
    description?: string;
    category?: string;
    fromAddExpense?: string;
  }>();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [vendorPhone, setVendorPhone] = useState('');
  const [amount, setAmount] = useState(initialAmount ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [category, setCategory] = useState(initialCategory ?? 'Other');
  const [referenceId, setReferenceId] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [pendingChecks, setPendingChecks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const RECENTS_KEY = `tally_recent_recipients:${getUserId()}`;
  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);

  useEffect(() => {
    setRecentRecipients([]);
    safeStorage.getItem(RECENTS_KEY)
      .then((raw) => setRecentRecipients(raw ? JSON.parse(raw) : []))
      .catch(() => { });
  }, [RECENTS_KEY]);

  async function rememberRecipient(phone: string) {
    try {
      const next = [phone, ...recentRecipients.filter((p) => p !== phone)].slice(0, 3);
      setRecentRecipients(next);
      await safeStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Non-critical
    }
  }

  const handleProceedToConfirm = () => {
    setError('');
    if (!vendorPhone.trim()) {
      setError("Please enter the vendor's MoMo phone number.");
      return;
    }
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }
    setStep(2);
  };

  const handleTransfer = async () => {
    setStep(3);
    setLoading(true);
    setError('');

    try {
      const userId = getUserId();
      const cleanPhone = vendorPhone.replace(/\D/g, '');
      const cleanAmount = Number(amount).toFixed(2);

      const res = await momoAPI.transfer(
        cleanPhone,
        cleanAmount,
        description.trim() || 'MoMo transfer',
        userId,
        category,
      );

      if (res.data?.status === 'unavailable') {
        setError(
          res.data?.message ??
          'The payment service is not responding right now. Your transfer is pending — check the status again shortly.'
        );
        setTransferStatus('PENDING');
        return;
      }

      if (res.data?.expenseRecorded === false) {
        showToast(
          'Transfer went through, but could not save to history' + (res.data?.expenseError ? `: ${res.data.expenseError}` : '.'),
          'warning',
        );
      }

      const ref: string = res.data?.referenceId ?? '';
      setReferenceId(ref);
      await rememberRecipient(cleanPhone);

      await new Promise((resolve) => setTimeout(resolve, 5000));

      let status = 'PENDING';
      if (ref) {
        try {
          const statusRes = await momoAPI.checkTransferStatus(ref);
          status = statusRes.data?.status ?? 'PENDING';
        } catch {
          status = 'PENDING';
        }
      }

      setTransferStatus(status);

      if (status === 'SUCCESSFUL') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      } else if (status === 'FAILED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
      }

      if (status === 'SUCCESSFUL') {
        await addHistoryItem({
          type: 'expense_added',
          title: 'MoMo Transfer',
          body: `GHS ${parseFloat(amount).toFixed(2)} sent to ${vendorPhone.trim()} via MoMo.`,
          data: { screen: 'history' },
        }).catch(() => { });
      }

      if (status === 'SUCCESSFUL' && fromAddExpense === 'true') {
        setTimeout(() => {
          router.replace('/(tabs)/add');
        }, 2000);
      }
    } catch (err: any) {
      if (isTransientApiError(err)) {
        setError(
          "We couldn't confirm the transfer — the connection dropped. If it went through it will appear in your History shortly; otherwise it's safe to try again."
        );
        setTransferStatus('PENDING');
      } else {
        const raw: string | undefined = err?.response?.data?.error;
        const msg =
          raw && /401|UNAUTHORIZED|token/i.test(raw)
            ? 'The payment service rejected our credentials, so no money was sent. Please try again later.'
            : raw ?? 'The transfer could not be completed. Please try again.';
        setError(msg);
        setTransferStatus('FAILED');
      }
    } finally {
      setLoading(false);
      setStep(4);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step < 4 && (
          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.stepDot, { backgroundColor: step >= s ? colors.accent : colors.borderSubtle }]} />
            ))}
          </View>
        )}

        {/* ──────────────────── STEP 1 — Enter Details ──────────────────── */}
        {step === 1 && (
          <View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (fromAddExpense === 'true') {
                  router.back();
                } else {
                  router.push('/(tabs)/');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[typography.bodyStrong, { color: colors.primary, fontSize: 16 }]}>← Back</Text>
            </TouchableOpacity>

            <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">Pay Vendor via MoMo</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
              Send money directly to a vendor's MoMo wallet.
            </Text>

            {recentRecipients.length > 0 && (
              <View style={{ marginBottom: spacing.xs }}>
                <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Recent Recipients</Text>
                <View style={styles.recentsRow}>
                  {recentRecipients.map((phone) => (
                    <Chip key={phone} label={`📱 ${phone}`} onPress={() => setVendorPhone(phone)} />
                  ))}
                </View>
              </View>
            )}

            <Input
              label="Vendor Phone Number"
              placeholder="e.g. 0241234567"
              value={vendorPhone}
              onChangeText={setVendorPhone}
              keyboardType="phone-pad"
              maxLength={15}
              containerStyle={{ marginTop: spacing.md }}
            />

            <Input
              label="Amount (GHS)"
              placeholder="e.g. 50.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              containerStyle={{ marginTop: spacing.md }}
            />

            <Input
              label="Description (optional)"
              placeholder="e.g. Groceries, Taxi fare…"
              value={description}
              onChangeText={setDescription}
              containerStyle={{ marginTop: spacing.md }}
            />

            <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={cat}
                  icon={<MaterialCommunityIcons name={getCategoryIconName(cat)} size={14} color={category === cat ? '#FFFFFF' : getCategoryColor(cat)} />}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                  style={category === cat ? { backgroundColor: colors.accent } : undefined}
                />
              ))}
            </View>

            {!!error && <Text style={[typography.caption, { color: colors.negative, marginTop: spacing.sm + 2, textAlign: 'center' }]}>{error}</Text>}

            <Button title="Continue →" onPress={handleProceedToConfirm} style={{ backgroundColor: colors.accent, marginTop: spacing.xl }} />
          </View>
        )}

        {/* ──────────────────── STEP 2 — Confirm ──────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">Confirm Transfer</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>Review the details before sending.</Text>

            <View style={[styles.confirmCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <Row label="To" value={vendorPhone} colors={colors} />
              <Row label="Amount" value={`GHS ${Number(amount).toFixed(2)}`} highlight colors={colors} />
              {!!description && <Row label="Note" value={description} colors={colors} />}
              <Row label="Category" value={category} colors={colors} />
              <Row label="Payment" value="MoMo Wallet" colors={colors} last />
            </View>

            <Button title="Confirm & Send 📤" onPress={handleTransfer} style={{ backgroundColor: colors.accent, marginTop: spacing.xl }} />
            <Button title="← Edit Details" onPress={() => setStep(1)} variant="secondary" style={{ marginTop: spacing.md }} />
          </View>
        )}

        {/* ──────────────────── STEP 3 — Processing ──────────────────── */}
        {step === 3 && (
          <View style={styles.centeredSection}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>Processing Transfer…</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg }]}>
              Please wait while we send{' '}
              <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>GHS {Number(amount).toFixed(2)}</Text>{' '}
              to {vendorPhone}.
            </Text>
          </View>
        )}

        {/* ──────────────────── STEP 4 — Result ──────────────────────── */}
        {step === 4 && (
          <View style={styles.centeredSection}>
            {transferStatus === 'SUCCESSFUL' && (
              <>
                <Text style={{ fontSize: 56, marginBottom: spacing.sm }}>✅</Text>
                <Text style={[typography.title, { color: colors.positive }]}>Payment Successful!</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg }]}>
                  GHS {Number(amount).toFixed(2)} was sent to {vendorPhone}.{'\n'}Expense recorded in your history.
                </Text>
                {fromAddExpense === 'true' && (
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>Returning to Add Expense…</Text>
                )}
              </>
            )}

            {transferStatus === 'FAILED' && (
              <>
                <Text style={{ fontSize: 56, marginBottom: spacing.sm }}>❌</Text>
                <Text style={[typography.title, { color: colors.negative }]}>Payment Failed</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg }]}>
                  {error || 'The transfer could not be completed. Please try again.'}
                </Text>
              </>
            )}

            {transferStatus === 'PENDING' && (
              <>
                <Text style={{ fontSize: 56, marginBottom: spacing.sm }}>⏳</Text>
                <Text style={[typography.title, { color: colors.accent }]}>Payment Pending</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.lg }]}>
                  {pendingChecks >= 3
                    ? "This is taking longer than usual. You can safely leave — the final result will show in your History. No money is lost if it didn't go through."
                    : error || 'The transfer is still being processed. Check back shortly.'}
                </Text>
                {!!referenceId && (
                  <Button
                    title="Check Status"
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const r = await momoAPI.checkTransferStatus(referenceId);
                        const newStatus = r.data?.status ?? 'PENDING';
                        setTransferStatus(newStatus);
                        if (newStatus === 'PENDING') setPendingChecks((n) => n + 1);
                        if (newStatus === 'SUCCESSFUL' && fromAddExpense === 'true') {
                          setTimeout(() => router.replace('/(tabs)/add'), 2000);
                        }
                      } catch {
                        setPendingChecks((n) => n + 1);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    loading={loading}
                    style={{ backgroundColor: colors.accent, marginTop: spacing.md }}
                  />
                )}
              </>
            )}

            {transferStatus !== 'SUCCESSFUL' && (
              <Button title="Back to Home" onPress={() => router.replace('/(tabs)')} variant="secondary" style={{ marginTop: spacing.md }} />
            )}

            {transferStatus !== 'SUCCESSFUL' && (
              <Button
                title="Try Again"
                onPress={() => {
                  setStep(1);
                  setError('');
                  setReferenceId('');
                  setTransferStatus('');
                  setPendingChecks(0);
                }}
                variant="secondary"
                style={{ marginTop: spacing.sm }}
              />
            )}

            {transferStatus === 'SUCCESSFUL' && (
              <Button title="View in History" onPress={() => router.replace('/(tabs)/history')} variant="secondary" style={{ marginTop: spacing.md }} />
            )}
          </View>
        )}
      </ScrollView>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, highlight, colors, last }: { label: string; value: string; highlight?: boolean; colors: ReturnType<typeof getExtendedColors>; last?: boolean }) {
  return (
    <View style={[styles.confirmRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          typography.bodyStrong,
          { color: highlight ? colors.accent : colors.text, fontSize: highlight ? 16 : 14, maxWidth: '60%', textAlign: 'right' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 40 },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  backButton: {
    padding: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  recentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  confirmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
  },
  centeredSection: {
    alignItems: 'center',
    paddingTop: 40,
    gap: spacing.sm + 2,
  },
});
