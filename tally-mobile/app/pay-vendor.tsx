import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { momoAPI, isTransientApiError } from "../services/api";
import { getUserId, currentUser, safeStorage } from "../services/storage";
import { addHistoryItem } from "../services/notificationHistory";
import * as Haptics from "expo-haptics";

const CATEGORIES = [
  { name: "Food", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Entertainment", emoji: "🎮" },
  { name: "Utilities", emoji: "💡" },
  { name: "Other", emoji: "📦" },
];

export default function PayVendorScreen() {
  const router = useRouter();

  // Pre-fill from Add Expense screen if navigated from there
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
  const [vendorPhone, setVendorPhone] = useState("");
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [category, setCategory] = useState(initialCategory ?? "Other");
  const [referenceId, setReferenceId] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  // Manual status checks that still came back PENDING — after a few, stop
  // implying it will resolve here and point the user to History instead.
  const [pendingChecks, setPendingChecks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Recent recipients (last 3 numbers) for quick re-pay, like the MoMo app
  const RECENTS_KEY = "tally_recent_recipients";
  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);

  useEffect(() => {
    safeStorage.getItem(RECENTS_KEY)
      .then((raw) => raw && setRecentRecipients(JSON.parse(raw)))
      .catch(() => { });
  }, []);

  async function rememberRecipient(phone: string) {
    try {
      const next = [phone, ...recentRecipients.filter((p) => p !== phone)].slice(0, 3);
      setRecentRecipients(next);
      await safeStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Non-critical
    }
  }

  // ── Step 1 validation ──────────────────────────────────────────────────────
  const handleProceedToConfirm = () => {
    setError("");
    if (!vendorPhone.trim()) {
      setError("Please enter the vendor's MoMo phone number.");
      return;
    }
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid amount greater than zero.");
      return;
    }
    setStep(2);
  };

  // ── Step 2 → initiate transfer ─────────────────────────────────────────────
  const handleTransfer = async () => {
    setStep(3);
    setLoading(true);
    setError("");

    try {
      const userId = getUserId();

      // Sanitize inputs: strip spaces/dashes from the phone number and
      // normalize the amount to exactly 2 decimal places.
      const cleanPhone = vendorPhone.replace(/\D/g, "");
      const cleanAmount = Number(amount).toFixed(2);

      const res = await momoAPI.transfer(
        cleanPhone,
        cleanAmount,
        description.trim() || "MoMo transfer",
        userId,                 // ← was currentUser.id (undefined); now correctly uses getUserId()
        category,
      );

      // Backend signals the MoMo sandbox is down. This is an upstream outage, not a
      // rejected payment, so present it as PENDING rather than FAILED — the user is
      // told it is still being processed instead of being wrongly told it failed.
      if (res.data?.status === "unavailable") {
        setError(
          res.data?.message ??
          "The payment service is not responding right now. Your transfer is pending — check the status again shortly."
        );
        setTransferStatus("PENDING");
        return; // finally block still runs → setLoading(false) + setStep(4)
      }

      // The backend records the expense when the transfer is initiated. If that
      // write failed, the money still moved — surface it instead of failing silently.
      if (res.data?.expenseRecorded === false) {
        Alert.alert(
          "Expense not saved",
          "The transfer went through, but we could not save it to your expense history" +
          (res.data?.expenseError ? `: ${res.data.expenseError}` : ".") +
          "\n\nYou may need to add this expense manually.",
        );
      }

      const ref: string = res.data?.referenceId ?? "";
      setReferenceId(ref);
      await rememberRecipient(cleanPhone);

      // Wait 5 s then poll for final status
      await new Promise((resolve) => setTimeout(resolve, 5000));

      let status = "PENDING";
      if (ref) {
        try {
          const statusRes = await momoAPI.checkTransferStatus(ref);
          status = statusRes.data?.status ?? "PENDING";
        } catch {
          status = "PENDING";
        }
      }

      setTransferStatus(status);

      // Haptic feedback on payment outcome
      if (status === "SUCCESSFUL") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      } else if (status === "FAILED") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
      }

      // Expense is recorded by the backend (MoMoController) when the transfer is initiated.
      // Only add a local notification history entry here.
      if (status === "SUCCESSFUL") {
        await addHistoryItem({
          type: "expense_added",
          title: "MoMo Transfer",
          body: `GHS ${parseFloat(amount).toFixed(2)} sent to ${vendorPhone.trim()} via MoMo.`,
          data: { screen: "history" },
        }).catch(() => { });
      }

      // If navigated from Add Expense, go back to Add tab after a short delay
      if (status === "SUCCESSFUL" && fromAddExpense === "true") {
        setTimeout(() => {
          router.replace("/(tabs)/add");
        }, 2000);
      }
    } catch (err: any) {
      if (isTransientApiError(err)) {
        // Timeout or dead network between app and backend — the transfer may
        // still have gone through (the backend keeps working after our request
        // times out). Ambiguous, so show pending, never "failed".
        setError(
          "We couldn't confirm the transfer — the connection dropped. If it went through it will appear in your History shortly; otherwise it's safe to try again."
        );
        setTransferStatus("PENDING");
      } else {
        // Definitive rejection (validation error or explicit MoMo decline) —
        // show the backend's message, but translate technical auth/config
        // failures (expired or missing sandbox credentials) into plain words.
        const raw: string | undefined = err?.response?.data?.error;
        const msg =
          raw && /401|UNAUTHORIZED|token/i.test(raw)
            ? "The payment service rejected our credentials, so no money was sent. Please try again later."
            : raw ?? "The transfer could not be completed. Please try again.";
        setError(msg);
        setTransferStatus("FAILED");
      }
    } finally {
      setLoading(false);
      setStep(4);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step indicator ── */}
        {step < 4 && (
          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View
                key={s}
                style={[styles.stepDot, step >= s && styles.stepDotActive]}
              />
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
                  router.back(); // Goes back to Add Expense screen
                } else {
                  router.push('/(tabs)/'); // Goes back to Home
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Pay Vendor via MoMo</Text>
            <Text style={styles.subtitle}>
              Send money directly to a vendor's MoMo wallet.
            </Text>

            {/* Recent recipients for quick re-pay */}
            {recentRecipients.length > 0 && (
              <View style={styles.recentsSection}>
                <Text style={styles.label}>Recent Recipients</Text>
                <View style={styles.recentsRow}>
                  {recentRecipients.map((phone) => (
                    <TouchableOpacity
                      key={phone}
                      style={styles.recentChip}
                      onPress={() => setVendorPhone(phone)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.recentChipText}>📱 {phone}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.label}>Vendor Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 0241234567"
              placeholderTextColor="#8890A0"
              value={vendorPhone}
              onChangeText={setVendorPhone}
              keyboardType="phone-pad"
              maxLength={15}
            />

            <Text style={styles.label}>Amount (GHS)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50.00"
              placeholderTextColor="#8890A0"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Groceries, Taxi fare…"
              placeholderTextColor="#8890A0"
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.categoryPill,
                    category === cat.name && styles.categoryPillActive,
                  ]}
                  onPress={() => setCategory(cat.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryLabel,
                      category === cat.name && styles.categoryLabelActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleProceedToConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ──────────────────── STEP 2 — Confirm ──────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={styles.title}>Confirm Transfer</Text>
            <Text style={styles.subtitle}>Review the details before sending.</Text>

            <View style={styles.confirmCard}>
              <Row label="To" value={vendorPhone} />
              <Row label="Amount" value={`GHS ${Number(amount).toFixed(2)}`} highlight />
              {!!description && <Row label="Note" value={description} />}
              <Row label="Category" value={category} />
              <Row label="Payment" value="MoMo Wallet" />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleTransfer}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Confirm & Send 📤</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep(1)}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>← Edit Details</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ──────────────────── STEP 3 — Processing ──────────────────── */}
        {step === 3 && (
          <View style={styles.centeredSection}>
            <ActivityIndicator size="large" color="#FFC107" />
            <Text style={styles.processingTitle}>Processing Transfer…</Text>
            <Text style={styles.processingSubtitle}>
              Please wait while we send{" "}
              <Text style={styles.highlight}>GHS {Number(amount).toFixed(2)}</Text>{" "}
              to {vendorPhone}.
            </Text>
          </View>
        )}

        {/* ──────────────────── STEP 4 — Result ──────────────────────── */}
        {step === 4 && (
          <View style={styles.centeredSection}>
            {transferStatus === "SUCCESSFUL" && (
              <>
                <Text style={styles.resultIcon}>✅</Text>
                <Text style={[styles.resultTitle, { color: "#00C896" }]}>
                  Payment Successful!
                </Text>
                <Text style={styles.resultBody}>
                  GHS {Number(amount).toFixed(2)} was sent to {vendorPhone}.
                  {"\n"}Expense recorded in your history.
                </Text>
                {fromAddExpense === "true" && (
                  <Text style={[styles.resultBody, { color: "#8890A0", marginTop: 4 }]}>
                    Returning to Add Expense…
                  </Text>
                )}
              </>
            )}

            {transferStatus === "FAILED" && (
              <>
                <Text style={styles.resultIcon}>❌</Text>
                <Text style={[styles.resultTitle, { color: "#E05C5C" }]}>
                  Payment Failed
                </Text>
                <Text style={styles.resultBody}>
                  {error ||
                    "The transfer could not be completed. Please try again."}
                </Text>
              </>
            )}

            {transferStatus === "PENDING" && (
              <>
                <Text style={styles.resultIcon}>⏳</Text>
                <Text style={[styles.resultTitle, { color: "#FFC107" }]}>
                  Payment Pending
                </Text>
                <Text style={styles.resultBody}>
                  {pendingChecks >= 3
                    ? "This is taking longer than usual. You can safely leave — the final result will show in your History. No money is lost if it didn't go through."
                    : error || "The transfer is still being processed. Check back shortly."}
                </Text>
                {!!referenceId && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: "#FFC107" }]}
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const r = await momoAPI.checkTransferStatus(referenceId);
                        const newStatus = r.data?.status ?? "PENDING";
                        setTransferStatus(newStatus);
                        if (newStatus === "PENDING") setPendingChecks((n) => n + 1);
                        // Expense already recorded by backend when transfer was initiated.
                        if (newStatus === "SUCCESSFUL" && fromAddExpense === "true") {
                          setTimeout(() => router.replace("/(tabs)/add"), 2000);
                        }
                      } catch {
                        setPendingChecks((n) => n + 1); // keep PENDING
                      } finally {
                        setLoading(false);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#0F1117" />
                    ) : (
                      <Text style={[styles.primaryBtnText, { color: "#0F1117" }]}>
                        Check Status
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}

            {transferStatus !== "SUCCESSFUL" && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.replace("/(tabs)")}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Back to Home</Text>
              </TouchableOpacity>
            )}

            {transferStatus !== "SUCCESSFUL" && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 0 }]}
                onPress={() => {
                  setStep(1);
                  setError("");
                  setReferenceId("");
                  setTransferStatus("");
                  setPendingChecks(0);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            )}

            {transferStatus === "SUCCESSFUL" && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.replace("/(tabs)/history")}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>View in History</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Helper component ──────────────────────────────────────────────────────────
function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={[styles.confirmValue, highlight && styles.confirmValueHL]}>
        {value}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#0F1117" },
  container: { flex: 1, backgroundColor: "#0F1117" },
  content: { padding: 20, paddingBottom: 40 },

  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2A2F3E",
  },
  stepDotActive: { backgroundColor: "#FFC107" },

  backButton: {
    padding: 8,
    marginBottom: 16,
  },
  backButtonText: {
    color: "#00C896",
    fontSize: 16,
    fontWeight: "600",
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 24,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8890A0",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#1A1F2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffffff15",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#FFFFFF",
  },

  recentsSection: { marginBottom: 4 },
  recentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentChip: {
    backgroundColor: "#1A1F2E",
    borderWidth: 1,
    borderColor: "#00C89640",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recentChipText: {
    color: "#00C896",
    fontSize: 13,
    fontWeight: "600",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1A1F2E",
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  categoryPillActive: {
    borderColor: "#FFC107",
    backgroundColor: "#FFC10720",
  },
  categoryEmoji: { fontSize: 16 },
  categoryLabel: { fontSize: 13, color: "#8890A0" },
  categoryLabelActive: { color: "#FFC107", fontWeight: "600" },

  errorText: {
    color: "#E05C5C",
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },

  primaryBtn: {
    backgroundColor: "#FFC107",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryBtnText: {
    color: "#0F1117",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ffffff20",
  },
  secondaryBtnText: {
    color: "#8890A0",
    fontSize: 15,
    fontWeight: "600",
  },

  // Confirm step
  confirmCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff10",
    padding: 16,
    marginBottom: 8,
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff08",
  },
  confirmLabel: { fontSize: 13, color: "#8890A0" },
  confirmValue: { fontSize: 14, color: "#FFFFFF", fontWeight: "500", maxWidth: "60%", textAlign: "right" },
  confirmValueHL: { color: "#FFC107", fontWeight: "700", fontSize: 16 },

  // Processing / Result steps
  centeredSection: {
    alignItems: "center",
    paddingTop: 40,
    gap: 12,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  processingSubtitle: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  highlight: { color: "#FFC107", fontWeight: "700" },
  resultIcon: { fontSize: 56, marginBottom: 8 },
  resultTitle: { fontSize: 22, fontWeight: "700" },
  resultBody: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
