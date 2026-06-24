import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

const CATEGORY_COLORS: { [key: string]: string } = {
  Food: "#00C896",
  Transport: "#4F8EF7",
  Entertainment: "#F7A84F",
  Utilities: "#E05C5C",
  Other: "#8890A0",
};

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

export default function HistoryScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    try {
      // TODO: replace '1' with actual userId from storage
      const userId = getUserId();
      const response = await expenseAPI.getUserExpenses(userId);
      setExpenses(response.data);
    } catch (error) {
      Alert.alert("Error", "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(expenseId: string) {
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await expenseAPI.deleteExpense(expenseId);
              setExpenses(expenses.filter((e) => e.id !== expenseId));
            } catch (error) {
              Alert.alert("Error", "Failed to delete expense");
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (expenses.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>No expenses yet</Text>
        <Text style={styles.emptySubtext}>
          Tap Add to record your first expense
        </Text>
      </View>
    );
  }

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <View style={styles.container}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>GHS {totalSpent.toFixed(2)}</Text>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.expenseCard}
            onLongPress={() => handleDelete(String(item.id))}
          >
            <View style={styles.expenseLeft}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: CATEGORY_COLORS[item.category] + "20" },
                ]}
              >
                <Text style={styles.icon}>
                  {CATEGORY_ICONS[item.category] || "📦"}
                </Text>
              </View>
              <View>
                <Text style={styles.expenseDescription}>
                  {item.description || item.category}
                </Text>
                <Text style={styles.expenseCategory}>
                  {item.category} • {item.date}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.expenseAmount,
                { color: CATEGORY_COLORS[item.category] },
              ]}
            >
              GHS {parseFloat(item.amount).toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
      />
      <Text style={styles.hint}>Long press an expense to delete it</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#8890A0",
  },
  totalCard: {
    margin: 16,
    padding: 20,
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00C89630",
  },
  totalLabel: {
    fontSize: 13,
    color: "#8890A0",
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00C896",
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  expenseCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  expenseLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 20,
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 3,
  },
  expenseCategory: {
    fontSize: 12,
    color: "#8890A0",
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: "bold",
  },
  hint: {
    textAlign: "center",
    fontSize: 11,
    color: "#ffffff20",
    paddingBottom: 16,
  },
});
