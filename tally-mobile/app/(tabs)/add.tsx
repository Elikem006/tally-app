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
      await expenseAPI.createExpense(
        userId,
        amount,
        selectedCategory,
        description,
        today,
      );
      Alert.alert("Success", "Expense added successfully!");
      setAmount("");
      setDescription("");
      setSelectedCategory("Food");
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
});
