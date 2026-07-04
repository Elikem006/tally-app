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
import { router } from "expo-router";
import { expenseAPI, categoriesAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { currentUser } from "../(auth)/login";
import { addHistoryItem } from "../../services/notificationHistory";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

const CATEGORIES = [
  { name: "Food", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Entertainment", emoji: "🎮" },
  { name: "Utilities", emoji: "💡" },
  { name: "Other", emoji: "📦" },
];

type PaymentMethod = "CASH" | "MOMO";

// Module-level vars persist for the whole app session — no async needed
let lastUsedCategory = "Food";
let lastUsedPaymentMethod: PaymentMethod = "CASH";

// Holds form data when navigating away to Pay Vendor so the Add screen
// can be cleared after a successful payment.
export let pendingExpenseData: {
  amount: string;
  category: string;
  description: string;
  paymentMethod: PaymentMethod;
} | null = null;

export function clearPendingExpenseData() {
  pendingExpenseData = null;
}

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
  const [customCategories, setCustomCategories] = useState<{ id: number; name: string; emoji: string }[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("");
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  // Auto-hide the "remembered" hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchCustomCategories();
  }, []);

  async function fetchCustomCategories() {
    try {
      const response = await categoriesAPI.getUserCategories(getUserId());
      setCustomCategories(response.data || []);
    } catch {
      // Non-fatal — custom categories are optional
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryEmoji.trim() || !newCategoryName.trim()) {
      showToast("Please enter both emoji and category name", "error");
      return;
    }
    try {
      const response = await categoriesAPI.createCategory(
        getUserId(),
        newCategoryName.trim(),
        newCategoryEmoji.trim(),
      );
      const created = response.data;
      setCustomCategories((prev) => [...prev, created]);
      handleCategorySelect(created.name);
      setNewCategoryName("");
      setNewCategoryEmoji("");
      setShowAddCategory(false);
      showToast("Category created!", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to create category", "error");
    }
  }

  function handleCategorySelect(cat: string) {
    setSelectedCategory(cat);
    setShowHint(false);
    lastUsedCategory = cat;
  }

  function handlePaymentMethodSelect(method: PaymentMethod) {
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

    // MoMo → navigate to Pay Vendor screen with pre-filled data
    if (paymentMethod === "MOMO") {
      pendingExpenseData = {
        amount: amount.trim(),
        category: selectedCategory,
        description: [description, ...tags].filter(Boolean).join(" "),
        paymentMethod: "MOMO",
      };
      router.push({
        pathname: "/pay-vendor",
        params: {
          amount: amount.trim(),
          description: [description, ...tags].filter(Boolean).join(" "),
          category: selectedCategory,
          fromAddExpense: "true",
        },
      });
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
          {/* Default categories */}
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
          {/* Custom categories */}
          {customCategories.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <TouchableOpacity
                key={`custom-${cat.id}`}
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
        {/* + Add Category button */}
        <TouchableOpacity
          style={styles.addCategoryButton}
          onPress={() => setShowAddCategory(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addCategoryText}>+ Add Category</Text>
        </TouchableOpacity>
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
              {paymentMethod === "MOMO" ? "Pay Vendor via MoMo →" : "Add Expense"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Toast
        message={toastMessage}
        type={toastType}
        visible={toastVisible}
        onHide={hideToast}
      />

      {/* ── Create Custom Category Modal ─────────────────────────────── */}
      <Modal
        visible={showAddCategory}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddCategory(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAddCategory(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Custom Category</Text>

            <Text style={styles.modalLabel}>Choose an emoji</Text>
            <TextInput
              style={styles.modalInput}
              value={newCategoryEmoji}
              onChangeText={setNewCategoryEmoji}
              placeholder="e.g. 🏠 💊 📚"
              placeholderTextColor="#8890A060"
              autoFocus
            />

            <Text style={styles.modalLabel}>Category name</Text>
            <TextInput
              style={styles.modalInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Healthcare, Rent"
              placeholderTextColor="#8890A060"
              returnKeyType="done"
              onSubmitEditing={handleCreateCategory}
            />

            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateCategory}
              activeOpacity={0.8}
            >
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowAddCategory(false);
                setNewCategoryName("");
                setNewCategoryEmoji("");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  // Add Category button
  addCategoryButton: {
    borderWidth: 1,
    borderColor: "#00C896",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  addCategoryText: {
    color: "#00C896",
    fontSize: 14,
    fontWeight: "600",
  },
  // Create category modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  modalCard: {
    backgroundColor: "#1A1F2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#00C89630",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "500",
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 14,
    color: "#ffffff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ffffff15",
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  createButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelButton: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff20",
  },
  cancelButtonText: {
    color: "#8890A0",
    fontSize: 15,
    fontWeight: "600",
  },
});
