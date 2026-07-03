import { useState, useEffect } from "react";
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
  Modal,
} from "react-native";
import { expenseAPI, momoAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { currentUser } from "../(auth)/login";
import { addHistoryItem } from "../../services/notificationHistory";
import { signalMomoRefresh } from "../../services/momoRefresh";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

const CATEGORIES = [
  { name: "Food", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Entertainment", emoji: "🎮" },
  { name: "Utilities", emoji: "💡" },
  { name: "Other", emoji: "📦" },
];

type MomoStatus = "idle" | "sending" | "confirming" | "done";
type PaymentMethod = "CASH" | "MOMO";

// Module-level vars persist for the whole app session — no async needed
let lastUsedCategory = "Food";
let lastUsedPaymentMethod: PaymentMethod = "CASH";

export default function AddScreen() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(lastUsedCategory);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(lastUsedPaymentMethod);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showHint, setShowHint] = useState(true);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  // Auto-hide the "remembered" hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  function handleCategorySelect(cat: string) {
    setSelectedCategory(cat);
    setShowHint(false);
    lastUsedCategory = cat;
  }

  function handlePaymentMethodSelect(method: PaymentMethod) {
    setPaymentMethod(method);
    lastUsedPaymentMethod = method;
  }

  // MoMo payment modal
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || "");
  const [momoStatus, setMomoStatus] = useState<MomoStatus>("idle");
  const [momoLoading, setMomoLoading] = useState(false);

  function handleAddTag() {
    const raw = tagInput.trim();
    if (!raw) return;
    if (tags.length >= 5) {
      showToast("You can add up to 5 tags.", "warning");
      return;
    }
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleAddExpense() {
    if (!amount.trim()) {
      setAmountError("Please enter an amount");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setAmountError("Amount must be a number greater than 0");
      return;
    }
    setAmountError(null);

    // MoMo → open payment modal instead of saving directly
    if (paymentMethod === "MOMO") {
      setShowMomoModal(true);
      return;
    }

    // Cash flow
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const userId = getUserId();
      const fullDescription = [description, ...tags].filter(Boolean).join(" ");
      await expenseAPI.createExpense(
        userId,
        amount,
        selectedCategory,
        fullDescription,
        today,
        "CASH",
      );
      const parsed = parseFloat(amount);
      await addHistoryItem({
        type: "expense_added",
        title: "Expense recorded",
        body: `GHS ${parsed.toFixed(2)} added to ${selectedCategory}${description ? ` — ${description}` : ""}.`,
        data: { screen: "history" },
      });
      showToast("Expense added successfully!", "success");
      setAmount("");
      setDescription("");
      setTags([]);
      setTagInput("");
    } catch (error: any) {
      const message = error.response?.data?.error || "Failed to add expense.";
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMomoPayment() {
    const phone = momoPhone.trim().replace(/\s/g, "");
    if (!/^\d{10}$/.test(phone)) {
      setPhoneError("Phone number must be exactly 10 digits");
      return;
    }
    setPhoneError(null);

    setMomoLoading(true);
    setMomoStatus("sending");

    try {
      const userId = getUserId();
      const fullDescription = [description, ...tags].filter(Boolean).join(" ");

      // Request payment from MTN MoMo sandbox
      const payRes = await momoAPI.requestPayment(
        "",       // no groupId for personal expenses
        userId,
        phone,
        amount,
        fullDescription || selectedCategory,
      );

      const referenceId: string =
        payRes.data?.referenceId ?? payRes.data?.externalId ?? "";

      // Wait 3 s, then check payment status
      setMomoStatus("confirming");
      await new Promise((r) => setTimeout(r, 3000));

      let paymentStatus = "PENDING";
      if (referenceId) {
        try {
          const statusRes = await momoAPI.checkStatus(referenceId);
          paymentStatus = statusRes.data?.status ?? "PENDING";
        } catch {
          // If status check fails, treat as PENDING and record the expense
          paymentStatus = "PENDING";
        }
      }

      if (paymentStatus === "FAILED") {
        showToast("Payment failed. Please try again.", "error");
        setMomoStatus("idle");
        setMomoLoading(false);
        return;
      }

      // SUCCESSFUL or PENDING — record the expense
      const today = new Date().toISOString().split("T")[0];
      const parsed = parseFloat(amount);
      await expenseAPI.createExpense(
        userId,
        amount,
        selectedCategory,
        fullDescription,
        today,
        "MOMO",
      );

      await addHistoryItem({
        type: "expense_added",
        title: "MoMo payment recorded",
        body: `GHS ${parsed.toFixed(2)} paid via MoMo for ${selectedCategory}${description ? ` — ${description}` : ""}.`,
        data: { screen: "history" },
      });

      setMomoStatus("done");
      // Tell Home screen to re-fetch wallet balance on next focus
      signalMomoRefresh();

      // Brief pause so user sees "confirmed" state, then close
      setTimeout(() => {
        setShowMomoModal(false);
        setMomoStatus("idle");
        setMomoLoading(false);
        showToast("Payment successful! Expense recorded.", "success");
        setAmount("");
        setDescription("");
        setTags([]);
        setTagInput("");
        setMomoPhone("");
      }, 1200);
    } catch (err: any) {
      const msg =
        err.response?.data?.error || "Payment request failed. Please try again.";
      showToast(msg, "error");
      setMomoStatus("idle");
      setMomoLoading(false);
    }
  }

  function closeMomoModal() {
    if (momoLoading) return; // block dismissal while in-flight
    setShowMomoModal(false);
    setMomoStatus("idle");
    setPhoneError(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Add Expense</Text>

        <Text style={styles.label}>Amount (GHS)</Text>
        <TextInput
          style={[styles.input, amountError ? styles.inputError : null]}
          placeholder="0.00"
          placeholderTextColor="#8890A0"
          value={amount}
          onChangeText={(text) => {
            setAmount(text);
            if (amountError) setAmountError(null);
          }}
          keyboardType="decimal-pad"
        />
        {amountError && <Text style={styles.fieldError}>{amountError}</Text>}

        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <TouchableOpacity
                key={cat.name}
                style={[styles.categoryCard, isSelected && styles.categoryCardActive]}
                onPress={() => handleCategorySelect(cat.name)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryName, isSelected && styles.categoryNameActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {showHint && (
          <Text style={{ fontSize: 11, color: "#8890A0", textAlign: "center", marginBottom: 8 }}>
            ↩ Remembered from last expense
          </Text>
        )}

        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.paymentMethodRow}>
          <TouchableOpacity
            style={[styles.paymentChip, paymentMethod === "CASH" && styles.paymentChipActive]}
            onPress={() => handlePaymentMethodSelect("CASH")}
            activeOpacity={0.7}
          >
            <Text style={styles.paymentChipIcon}>💵</Text>
            <Text style={[styles.paymentChipText, paymentMethod === "CASH" && styles.paymentChipTextActive]}>
              Cash
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentChip, paymentMethod === "MOMO" && styles.paymentChipActiveMomo]}
            onPress={() => handlePaymentMethodSelect("MOMO")}
            activeOpacity={0.7}
          >
            <Text style={styles.paymentChipIcon}>📱</Text>
            <Text style={[styles.paymentChipText, paymentMethod === "MOMO" && styles.paymentChipTextMomo]}>
              MoMo
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What was this for?"
          placeholderTextColor="#8890A0"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Tags (optional)</Text>
        <View style={styles.tagInputRow}>
          <TextInput
            style={[styles.input, styles.tagInputField]}
            placeholder="Add a tag e.g. #work #food"
            placeholderTextColor="#8890A0"
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.tagAddButton} onPress={handleAddTag} activeOpacity={0.7}>
            <Text style={styles.tagAddText}>Add</Text>
          </TouchableOpacity>
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity onPress={() => handleRemoveTag(tag)} activeOpacity={0.7}>
                  <Text style={styles.tagRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            loading && styles.buttonDisabled,
            paymentMethod === "MOMO" && styles.buttonMomo,
          ]}
          onPress={handleAddExpense}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.buttonText}>
              {paymentMethod === "MOMO" ? "Pay with MoMo →" : "Add Expense"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── MoMo Payment Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showMomoModal}
        transparent
        animationType="slide"
        onRequestClose={closeMomoModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeMomoModal}
          />
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pay with MoMo 📱</Text>
              {!momoLoading && (
                <TouchableOpacity onPress={closeMomoModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} activeOpacity={0.7}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount box */}
            <View style={styles.momoAmountBox}>
              <Text style={styles.momoAmountLabel}>You are paying</Text>
              <Text style={styles.momoAmountValue}>
                GHS {parseFloat(amount || "0").toFixed(2)}
              </Text>
              {(description || selectedCategory) && (
                <Text style={styles.momoAmountDesc}>
                  {description || selectedCategory}
                </Text>
              )}
            </View>

            {/* Phone input — only shown while idle */}
            {momoStatus === "idle" && (
              <>
                <Text style={styles.momoPhoneLabel}>MoMo Number</Text>
                <TextInput
                  style={[styles.momoPhoneInput, phoneError ? styles.inputError : null]}
                  placeholder="e.g. 0241234567"
                  placeholderTextColor="#8890A080"
                  value={momoPhone}
                  onChangeText={(text) => {
                    setMomoPhone(text);
                    if (phoneError) setPhoneError(null);
                  }}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
                {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
              </>
            )}

            {/* Status feedback while processing */}
            {momoStatus !== "idle" && (
              <View style={styles.momoStatusBox}>
                {momoStatus !== "done" && (
                  <ActivityIndicator
                    color="#FFC107"
                    size="large"
                    style={{ marginBottom: 12 }}
                  />
                )}
                {momoStatus === "done" && (
                  <Text style={styles.momoStatusIcon}>✅</Text>
                )}
                <Text style={styles.momoStatusText}>
                  {momoStatus === "sending" && "Sending payment request to your MoMo number..."}
                  {momoStatus === "confirming" && "Confirming payment..."}
                  {momoStatus === "done" && "Payment confirmed!"}
                </Text>
              </View>
            )}

            {/* Buttons — hidden while processing */}
            {momoStatus === "idle" && (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={closeMomoModal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalPayBtn}
                  onPress={handleMomoPayment}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalPayText}>Pay Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Toast
        message={toastMessage}
        type={toastType}
        visible={toastVisible}
        onHide={hideToast}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ffffff15",
    marginBottom: 20,
  },
  inputError: {
    borderColor: "#E05C5C",
    marginBottom: 4,
  },
  fieldError: {
    color: "#E05C5C",
    fontSize: 12,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  categoryCard: {
    width: "18%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffffff10",
    backgroundColor: "#1A1F2E",
    gap: 6,
  },
  categoryCardActive: {
    borderColor: "#00C896",
    backgroundColor: "#00C89615",
  },
  categoryEmoji: {
    fontSize: 26,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8890A0",
    textAlign: "center",
  },
  categoryNameActive: {
    color: "#00C896",
  },
  button: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonMomo: {
    backgroundColor: "#FFC107",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Payment method chips
  paymentMethodRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  paymentChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1A1F2E",
    borderWidth: 2,
    borderColor: "#ffffff15",
  },
  paymentChipActive: {
    borderColor: "#00C896",
    backgroundColor: "#00C89615",
  },
  paymentChipActiveMomo: {
    borderColor: "#FFC107",
    backgroundColor: "#FFC10715",
  },
  paymentChipIcon: {
    fontSize: 18,
  },
  paymentChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8890A0",
  },
  paymentChipTextActive: {
    color: "#00C896",
  },
  paymentChipTextMomo: {
    color: "#FFC107",
  },
  // Tags
  tagInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 0,
  },
  tagInputField: {
    flex: 1,
    marginBottom: 0,
  },
  tagAddButton: {
    backgroundColor: "#00C896",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  tagAddText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 13,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 20,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00C89620",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#00C896",
    gap: 4,
  },
  tagText: {
    fontSize: 12,
    color: "#00C896",
    fontWeight: "500",
  },
  tagRemove: {
    fontSize: 12,
    color: "#00C896",
  },
  // MoMo modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalCard: {
    backgroundColor: "#1A1F2E",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#FFC10740",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
  },
  modalClose: {
    fontSize: 18,
    color: "#8890A0",
    padding: 4,
  },
  momoAmountBox: {
    backgroundColor: "#0F1117",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FFC10730",
  },
  momoAmountLabel: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  momoAmountValue: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#FFC107",
    marginBottom: 4,
  },
  momoAmountDesc: {
    fontSize: 13,
    color: "#8890A0",
  },
  momoPhoneLabel: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 8,
  },
  momoPhoneInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#FFC10740",
    marginBottom: 20,
    letterSpacing: 1,
  },
  momoStatusBox: {
    alignItems: "center",
    paddingVertical: 24,
  },
  momoStatusIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  momoStatusText: {
    fontSize: 15,
    color: "#FFC107",
    fontWeight: "600",
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff30",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    color: "#8890A0",
    fontWeight: "600",
  },
  modalPayBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFC107",
    alignItems: "center",
  },
  modalPayText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 16,
  },
});
