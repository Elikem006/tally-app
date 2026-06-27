import { useState } from "react";
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
} from "react-native";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { addHistoryItem } from "../../services/notificationHistory";

const CATEGORIES = [
  { name: "Food", emoji: "🍔" },
  { name: "Transport", emoji: "🚗" },
  { name: "Entertainment", emoji: "🎮" },
  { name: "Utilities", emoji: "💡" },
  { name: "Other", emoji: "📦" },
];

export default function AddScreen() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Food");
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOMO">("CASH");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  function handleAddTag() {
    const raw = tagInput.trim();
    if (!raw) return;
    if (tags.length >= 5) {
      Alert.alert("Limit reached", "You can add up to 5 tags.");
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
      Alert.alert("Error", "Please enter an amount");
      return;
    }
    if (isNaN(parseFloat(amount))) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

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
        paymentMethod,
      );
      // Record in in-app notification history
      const parsed = parseFloat(amount);
      await addHistoryItem({
        type: "expense_added",
        title: "Expense recorded",
        body: `GHS ${parsed.toFixed(2)} added to ${selectedCategory}${description ? ` — ${description}` : ""}.`,
      });
      Alert.alert("Success", "Expense added successfully!");
      setAmount("");
      setDescription("");
      setSelectedCategory("Food");
      setPaymentMethod("CASH");
      setTags([]);
      setTagInput("");
    } catch (error: any) {
      const message = error.response?.data?.error || "Failed to add expense.";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add Expense</Text>

      <Text style={styles.label}>Amount (GHS)</Text>
      <TextInput
        style={styles.input}
        placeholder="0.00"
        placeholderTextColor="#8890A0"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.name;
          return (
            <TouchableOpacity
              key={cat.name}
              style={[styles.categoryCard, isSelected && styles.categoryCardActive]}
              onPress={() => setSelectedCategory(cat.name)}
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

      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.paymentMethodRow}>
        <TouchableOpacity
          style={[styles.paymentChip, paymentMethod === "CASH" && styles.paymentChipActive]}
          onPress={() => setPaymentMethod("CASH")}
          activeOpacity={0.7}
        >
          <Text style={styles.paymentChipIcon}>💵</Text>
          <Text style={[styles.paymentChipText, paymentMethod === "CASH" && styles.paymentChipTextActive]}>
            Cash
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.paymentChip, paymentMethod === "MOMO" && styles.paymentChipActiveMomo]}
          onPress={() => setPaymentMethod("MOMO")}
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

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleAddExpense}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text style={styles.buttonText}>Add Expense</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Payment method
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
});
