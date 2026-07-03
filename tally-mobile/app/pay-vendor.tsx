import React, { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { momoAPI } from "../services/api";
import { currentUser } from "./(auth)/login";

const CATEGORIES = [
  { name: "Food", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Entertainment", emoji: "🎮" },
  { name: "Utilities", emoji: "💡" },
  { name: "Other", emoji: "📦" },
];

export default function PayVendorScreen() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [vendorPhone, setVendorPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [referenceId, setReferenceId] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      const res = await momoAPI.transfer(
        vendorPhone.trim(),
        amount.trim(),
        description.trim() || "MoMo transfer",
        String(currentUser.id ?? ""),
        category,
      );

      const ref: string = res.data?.referenceId ?? "";
      setReferenceId(ref);

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
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        "Transfer failed. Please try again.";
      setError(msg);
      setTransferStatus("FAILED");
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
            <Text style={styles.title}>Pay Vendor via MoMo</Text>
            <Text style={styles.subtitle}>
              Send money directly to a vendor's MoMo wallet.
            </Text>

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
                </Text>
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
                  The transfer is still being processed. Check back shortly.
                </Text>
                {!!referenceId && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: "#FFC107" }]}
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const r = await momoAPI.checkTransferStatus(referenceId);
                        setTransferStatus(r.data?.status ?? "PENDING");
                      } catch {
                        // keep PENDING
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

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.replace("/(tabs)")}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>Back to Home</Text>
            </TouchableOpacity>

            {transferStatus !== "SUCCESSFUL" && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 0 }]}
                onPress={() => {
                  setStep(1);
                  setError("");
                  setReferenceId("");
                  setTransferStatus("");
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Try Again</Text>
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
