import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expenseAPI, budgetAPI, momoAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import { currentUser } from '../(auth)/login';
import { addHistoryItem } from '../../services/notificationHistory';
import { signalMomoRefresh } from '../../services/momoRefresh';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

type MomoStatus = "idle" | "sending" | "confirming" | "done";

// Module-level vars persist for the whole app session — no async needed
let lastUsedCategory = "Food";
let lastUsedPaymentMethod: "CASH" | "MOMO" = "CASH";

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(lastUsedCategory);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOMO">(lastUsedPaymentMethod);

  // Dynamic monthly totals and budget limits
  const [spent, setSpent] = useState<{ [key: string]: number }>({});
  const [limits, setLimits] = useState<{ [key: string]: number }>({});

  // Input focus status for outline treatments
  const [amountFocused, setAmountFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [tagFocused, setTagFocused] = useState(false);

  // Tag list state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showHint, setShowHint] = useState(true);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  // MoMo payment modal
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || "");
  const [momoStatus, setMomoStatus] = useState<MomoStatus>("idle");
  const [momoLoading, setMomoLoading] = useState(false);

  // Auto-hide the "remembered" hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setFetching(true);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes] = await Promise.all([
        expenseAPI.getUserExpenses(userId),
        budgetAPI.getUserBudgets(userId)
      ]);
      
      const totals: { [key: string]: number } = {};
      expensesRes.data.forEach((expense: any) => {
        const cat = expense.category || 'Other';
        totals[cat] = (totals[cat] || 0) + parseFloat(expense.amount || '0');
      });
      setSpent(totals);

      const budgetMap: { [key: string]: number } = {};
      budgetsRes.data.forEach((budget: any) => {
        budgetMap[budget.category] = parseFloat(budget.monthlyLimit) || 0;
      });
      setLimits(budgetMap);
    } catch (err) {
      console.log('Error loading dynamic metrics for categories:', err);
    } finally {
      setFetching(false);
    }
  }

  function handleCategorySelect(cat: string) {
    setSelectedCategory(cat);
    setShowHint(false);
    lastUsedCategory = cat;
  }

  function handlePaymentMethodSelect(method: "CASH" | "MOMO") {
    setPaymentMethod(method);
    lastUsedPaymentMethod = method;
  }

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
    if (!amount) {
      showToast("Please enter an amount", "error");
      return;
    }
    if (isNaN(parseFloat(amount))) {
      showToast("Please enter a valid amount", "error");
      return;
    }

    // MoMo → open payment modal instead of saving directly
    if (paymentMethod === "MOMO") {
      setShowMomoModal(true);
      return;
    }

    // Cash flow
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = getUserId();
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(" ");
      await expenseAPI.createExpense(userId, amount, selectedCategory, fullDescription, today, "CASH");
      
      const parsed = parseFloat(amount);
      await addHistoryItem({
        type: "expense_added",
        title: "Expense recorded",
        body: `GHS ${parsed.toFixed(2)} added to ${selectedCategory}${description ? ` — ${description}` : ""}.`,
        data: { screen: "history" },
      });

      showToast("Expense added successfully!", "success");

      // Update spent values locally for responsive UI feedback
      const addedAmt = parseFloat(amount) || 0;
      setSpent(prev => ({
        ...prev,
        [selectedCategory]: (prev[selectedCategory] || 0) + addedAmt
      }));

      setAmount('');
      setDescription('');
      setTags([]);
      setTagInput("");
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to add expense.';
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMomoPayment() {
    const phone = momoPhone.trim().replace(/\s/g, "");
    if (phone.length < 10) {
      showToast("Enter a valid 10-digit MoMo number", "error");
      return;
    }

    setMomoLoading(true);
    setMomoStatus("sending");

    try {
      const userId = getUserId();
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(" ");

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

      // Wait 3s, then check payment status
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

      // Update spent values locally for responsive UI feedback
      const addedAmt = parseFloat(amount) || 0;
      setSpent(prev => ({
        ...prev,
        [selectedCategory]: (prev[selectedCategory] || 0) + addedAmt
      }));

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
  }



  if (fetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]} keyboardShouldPersistTaps="handled">
        {/* Light card container */}
        <View style={styles.mainCard}>
          <Text style={styles.cardHeaderTitle}>Add Expense</Text>

          {/* Enter Amount box styled for the theme */}
          <Text style={styles.label}>Amount (GHS)</Text>
          <View style={[
            styles.amountBox,
            amountFocused && styles.amountBoxFocused
          ]}>
            <Text style={styles.amountPrefix}>GHS</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#C8D2DC"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
            />
          </View>

          {/* Categories capsule selection list */}
          <Text style={styles.label}>Select Category</Text>
          <View style={styles.categoryList}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryCapsule,
                  selectedCategory === cat && styles.categoryCapsuleActive,
                ]}
                onPress={() => handleCategorySelect(cat)}
                activeOpacity={0.8}
              >
                <View style={styles.categoryLeft}>
                  <Text style={styles.categoryEmoji}>{CATEGORY_ICONS[cat]}</Text>
                  <Text style={styles.categoryNameText}>{cat}</Text>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={styles.categoryAmountText}>
                    GHS {(spent[cat] || 0).toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {showHint && (
            <Text style={styles.lastUsedHint}>
              ↩ Remembered from last expense
            </Text>
          )}

          {/* Payment Method Selector */}
          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.paymentMethodRow}>
            <TouchableOpacity
              style={[
                styles.paymentChip,
                paymentMethod === "CASH" && styles.paymentChipActive
              ]}
              onPress={() => handlePaymentMethodSelect("CASH")}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentChipIcon}>💵</Text>
              <Text style={[
                styles.paymentChipText,
                paymentMethod === "CASH" && styles.paymentChipTextActive
              ]}>
                Cash
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paymentChip,
                paymentMethod === "MOMO" && styles.paymentChipActiveMomo
              ]}
              onPress={() => handlePaymentMethodSelect("MOMO")}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentChipIcon}>📱</Text>
              <Text style={[
                styles.paymentChipText,
                paymentMethod === "MOMO" && styles.paymentChipTextMomo
              ]}>
                MoMo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Description box */}
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[
              styles.descriptionBox,
              styles.textArea,
              descFocused && styles.descriptionBoxFocused
            ]}
            placeholder="What was this for?"
            placeholderTextColor="#8E9AA6"
            value={description}
            onChangeText={setDescription}
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
            multiline
            numberOfLines={3}
          />

          {/* Tags Section */}
          <Text style={styles.label}>Tags (optional)</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[
                styles.tagInputField,
                tagFocused && styles.tagInputFieldFocused
              ]}
              placeholder="Add a tag e.g. #work #food"
              placeholderTextColor="#8E9AA6"
              value={tagInput}
              onChangeText={setTagInput}
              onFocus={() => setTagFocused(true)}
              onBlur={() => setTagFocused(false)}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.tagAddButton} onPress={handleAddTag}>
              <Text style={styles.tagAddText}>Add</Text>
            </TouchableOpacity>
          </View>

          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                  <TouchableOpacity onPress={() => handleRemoveTag(tag)}>
                    <Text style={styles.tagRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Black capsule action button */}
          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
              paymentMethod === "MOMO" && styles.buttonMomo,
            ]}
            onPress={handleAddExpense}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                {paymentMethod === "MOMO" ? "Pay with MoMo →" : "⊕ Add Expense"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── MoMo Payment Modal (Redesigned for Premium Light Capsule Theme) ── */}
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
                <TouchableOpacity onPress={closeMomoModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
                  style={styles.momoPhoneInput}
                  placeholder="e.g. 0241234567"
                  placeholderTextColor="#8E9AA6"
                  value={momoPhone}
                  onChangeText={setMomoPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </>
            )}

            {/* Status feedback while processing */}
            {momoStatus !== "idle" && (
              <View style={styles.momoStatusBox}>
                {momoStatus !== "done" && (
                  <ActivityIndicator
                    color="#D97706"
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
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalPayBtn}
                  onPress={handleMomoPayment}
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
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // Card wrapper
    borderRadius: 28,
    padding: 24,
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
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  amountBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountBoxFocused: {
    borderColor: '#111111', // Black border on focus
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    padding: 0,
  },
  categoryList: {
    marginBottom: 16,
  },
  categoryCapsule: {
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
  categoryCapsuleActive: {
    borderColor: '#111111', // Rounded black outline on selection
    borderWidth: 1.5,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryEmoji: {
    fontSize: 20,
  },
  categoryNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    marginLeft: 4,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginRight: 6,
  },

  descriptionBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    color: '#111111',
    fontSize: 15,
    marginBottom: 16,
  },
  descriptionBoxFocused: {
    borderColor: '#111111',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  lastUsedHint: {
    fontSize: 11,
    color: "#8890A0",
    textAlign: "center",
    marginTop: -8,
    marginBottom: 12,
  },
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
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  paymentChipActive: {
    borderColor: "#111111",
    backgroundColor: "#11111105",
  },
  paymentChipActiveMomo: {
    borderColor: "#F59E0B",
    backgroundColor: "#F59E0B0a",
  },
  paymentChipIcon: {
    fontSize: 18,
  },
  paymentChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E9AA6",
  },
  paymentChipTextActive: {
    color: "#111111",
  },
  paymentChipTextMomo: {
    color: "#D97706",
  },
  button: {
    backgroundColor: '#111111', // Black background button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonMomo: {
    backgroundColor: "#D97706",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  tagInputField: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    color: '#111111',
    fontSize: 15,
  },
  tagInputFieldFocused: {
    borderColor: '#111111',
  },
  tagAddButton: {
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '500',
  },
  tagRemove: {
    fontSize: 12,
    color: '#8E9AA6',
    fontWeight: 'bold',
  },
  // MoMo modal (Light Redesign)
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
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
    color: "#111111",
  },
  modalClose: {
    fontSize: 18,
    color: "#8E9AA6",
    padding: 4,
  },
  momoAmountBox: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F59E0B1a",
  },
  momoAmountLabel: {
    fontSize: 12,
    color: "#8E9AA6",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  momoAmountValue: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#D97706",
    marginBottom: 4,
  },
  momoAmountDesc: {
    fontSize: 13,
    color: "#8E9AA6",
  },
  momoPhoneLabel: {
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
    marginBottom: 8,
  },
  momoPhoneInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    color: "#111111",
    fontSize: 18,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#EAEBEF",
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
    color: "#D97706",
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
    borderColor: "#EAEBEF",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  modalCancelText: {
    fontSize: 15,
    color: "#8E9AA6",
    fontWeight: "600",
  },
  modalPayBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
  },
  modalPayText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
