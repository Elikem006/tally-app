import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { expenseAPI } from "../../services/api";
import { getUserId, getUserName } from "../../services/storage";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

export default function HomeScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, []),
  );

  async function fetchExpenses() {
    try {
      const userId = getUserId();
      const name = getUserName();
      setUserName(name);
      const response = await expenseAPI.getUserExpenses(userId);
      setExpenses(response.data);
    } catch (error) {
      console.log("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const categoryTotals = expenses.reduce((acc: any, e) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount);
    return acc;
  }, {});
  const recentExpenses = expenses.slice(0, 3);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Good day, {userName} 👋</Text>
      <Text style={styles.subtitle}>Here's your spending summary</Text>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>GHS {totalSpent.toFixed(2)}</Text>
        <Text style={styles.totalSub}>{expenses.length} expenses recorded</Text>
      </View>
      {Object.keys(categoryTotals).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Category</Text>
          {Object.entries(categoryTotals).map(([category, total]: any) => (
            <View key={category} style={styles.categoryRow}>
              <Text style={styles.categoryIcon}>
                {CATEGORY_ICONS[category] || "📦"}
              </Text>
              <Text style={styles.categoryName}>{category}</Text>
              <Text style={styles.categoryAmount}>GHS {total.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
      {recentExpenses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Expenses</Text>
          {recentExpenses.map((expense) => (
            <View key={expense.id} style={styles.expenseRow}>
              <View>
                <Text style={styles.expenseName}>
                  {expense.description || expense.category}
                </Text>
                <Text style={styles.expenseDate}>{expense.date}</Text>
              </View>
              <Text style={styles.expenseAmount}>
                GHS {parseFloat(expense.amount).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {expenses.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyText}>No expenses yet</Text>
          <Text style={styles.emptySubtext}>
            Start tracking your spending by adding your first expense
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push("/(tabs)/add")}
          >
            <Text style={styles.emptyButtonText}>Add Your First Expense</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 24 },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: { fontSize: 14, color: "#8890A0", marginBottom: 24 },
  totalCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#00C89630",
  },
  totalLabel: { fontSize: 13, color: "#8890A0", marginBottom: 6 },
  totalAmount: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#00C896",
    marginBottom: 4,
  },
  totalSub: { fontSize: 12, color: "#8890A0" },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  categoryIcon: { fontSize: 20, marginRight: 12 },
  categoryName: { flex: 1, fontSize: 14, color: "#ffffff", fontWeight: "500" },
  categoryAmount: { fontSize: 14, fontWeight: "bold", color: "#00C896" },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  expenseName: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 3,
  },
  expenseDate: { fontSize: 12, color: "#8890A0" },
  expenseAmount: { fontSize: 14, fontWeight: "bold", color: "#00C896" },
  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtext: { fontSize: 14, color: "#8890A0", textAlign: "center", marginBottom: 24 },
  emptyButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  emptyButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
});
