import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { expenseAPI, remindersAPI, budgetAPI } from "../../services/api";
import { getUserId, getUserName } from "../../services/storage";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

const CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Other"];

export default function HomeScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<{ category: string; isOverBudget: boolean; isNearLimit: boolean; percentage: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  // Quick add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategory, setQuickCategory] = useState("Food");
  const [quickDescription, setQuickDescription] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

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

    // Fetch upcoming reminders independently — failure won't break the home screen
    try {
      const remindersResponse = await remindersAPI.getUpcomingReminders(getUserId());
      setUpcomingReminders(remindersResponse.data);
    } catch (error) {
      console.log("Error fetching reminders:", error);
    }

    // Fetch budget alerts independently
    try {
      const userId = getUserId();
      console.log("Fetching budget summary for userId:", userId);
      const budgetRes = await budgetAPI.getBudgetSummary(userId);
      const summary = budgetRes.data;
      const alerts = Object.entries(summary)
        .filter(([, data]: any) => data.isOverBudget || data.isNearLimit)
        .map(([category, data]: any) => ({
          category,
          isOverBudget: data.isOverBudget,
          isNearLimit: data.isNearLimit,
          percentage: data.percentage,
        }));
      console.log("Budget alerts:", alerts);
      setBudgetAlerts(alerts);
    } catch (error) {
      console.log("Error fetching budget alerts:", error);
    }
  }

  async function handleQuickAdd() {
    if (!quickAmount.trim()) {
      Alert.alert("Missing amount", "Please enter an amount.");
      return;
    }
    const parsed = parseFloat(quickAmount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }

    setSavingExpense(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await expenseAPI.createExpense(
        getUserId(),
        quickAmount,
        quickCategory,
        quickDescription,
        today,
      );
      // Reset form
      setQuickAmount("");
      setQuickCategory("Food");
      setQuickDescription("");
      setShowQuickAdd(false);
      // Refresh data
      await fetchExpenses();
      Alert.alert("✅ Added", `GHS ${parsed.toFixed(2)} in ${quickCategory} recorded.`);
    } catch (error) {
      Alert.alert("Error", "Could not save expense. Please try again.");
      console.log("Quick add error:", error);
    } finally {
      setSavingExpense(false);
    }
  }

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const categoryTotals = expenses.reduce((acc: any, e) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount);
    return acc;
  }, {});
  const recentExpenses = [...expenses]
    .sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Same date — sort by creation time so newest shows first
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    })
    .slice(0, 3);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  console.log('budgetAlerts:', budgetAlerts);

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Budget Alerts */}
        {budgetAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            {budgetAlerts.map((alert) => (
              <View
                key={alert.category}
                style={[
                  styles.alertCard,
                  alert.isOverBudget ? styles.alertCardOver : styles.alertCardNear,
                ]}
              >
                <Text style={styles.alertIcon}>{alert.isOverBudget ? "🚨" : "⚠️"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: alert.isOverBudget ? "#E05C5C" : "#F7A84F" }]}>
                    {alert.isOverBudget ? "Over budget" : "Near limit"} — {alert.category}
                  </Text>
                  <Text style={styles.alertSub}>
                    {alert.percentage.toFixed(0)}% of your {alert.category} budget used
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

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
        {upcomingReminders.length > 0 && (() => {
          const today = new Date().toISOString().split("T")[0];
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Bills 🔔</Text>
              {upcomingReminders.map((reminder) => {
                const isUrgent = reminder.dueDate === today || reminder.dueDate === tomorrow;
                return (
                  <View
                    key={reminder.id}
                    style={[styles.reminderCard, isUrgent && styles.reminderCardUrgent]}
                  >
                    <View style={styles.reminderIcon}>
                      <Text style={{ fontSize: 18 }}>🔔</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reminderTitle}>{reminder.title}</Text>
                      {reminder.dueDate && (
                        <Text style={styles.reminderDate}>Due: {reminder.dueDate}</Text>
                      )}
                    </View>
                    {reminder.isPaid ? (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>Paid</Text>
                      </View>
                    ) : reminder.amount != null ? (
                      <Text style={styles.reminderAmount}>
                        GHS {parseFloat(reminder.amount).toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })()}

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

        {/* Bottom padding so FAB doesn't cover last item */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating "+" button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowQuickAdd(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Quick Add Modal */}
      <Modal
        visible={showQuickAdd}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQuickAdd(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowQuickAdd(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Quick Add Expense</Text>

            {/* Amount */}
            <TextInput
              style={styles.amountInput}
              value={quickAmount}
              onChangeText={setQuickAmount}
              placeholder="0.00"
              placeholderTextColor="#8890A040"
              keyboardType="decimal-pad"
              autoFocus
            />

            {/* Category selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    quickCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setQuickCategory(cat)}
                >
                  <Text style={styles.categoryChipIcon}>{CATEGORY_ICONS[cat]}</Text>
                  <Text style={[
                    styles.categoryChipText,
                    quickCategory === cat && styles.categoryChipTextActive,
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Description */}
            <TextInput
              style={styles.descriptionInput}
              value={quickDescription}
              onChangeText={setQuickDescription}
              placeholder="Description (optional)"
              placeholderTextColor="#8890A080"
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowQuickAdd(false);
                  setQuickAmount("");
                  setQuickCategory("Food");
                  setQuickDescription("");
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, savingExpense && { opacity: 0.7 }]}
                onPress={handleQuickAdd}
                disabled={savingExpense}
              >
                {savingExpense ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <Text style={styles.addBtnText}>Add Expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#0F1117", position: "relative" },
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
  reminderCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  reminderCardUrgent: {
    borderColor: "#F7A84F",
  },
  reminderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00C89620",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  reminderDate: {
    fontSize: 12,
    color: "#8890A0",
    marginTop: 2,
  },
  reminderAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#00C896",
  },
  paidBadge: {
    backgroundColor: "#ffffff10",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paidBadgeText: {
    fontSize: 12,
    color: "#8890A0",
    fontWeight: "600",
  },
  alertsSection: {
    marginBottom: 16,
    gap: 8,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  alertCardOver: {
    backgroundColor: "#E05C5C15",
    borderColor: "#E05C5C",
  },
  alertCardNear: {
    backgroundColor: "#F7A84F15",
    borderColor: "#F7A84F",
  },
  alertIcon: {
    fontSize: 20,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  alertSub: {
    fontSize: 12,
    color: "#8890A0",
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#00C896",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: "#000000",
    fontWeight: "bold",
    lineHeight: 32,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: {
    backgroundColor: "#1A1F2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 16,
    textAlign: "center",
  },
  amountInput: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#00C896",
    textAlign: "center",
    paddingVertical: 12,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#00C89640",
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#ffffff10",
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  categoryChipActive: {
    backgroundColor: "#00C89620",
    borderColor: "#00C896",
  },
  categoryChipIcon: { fontSize: 16 },
  categoryChipText: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: "#00C896",
    fontWeight: "700",
  },
  descriptionInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: "#ffffff",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff30",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    color: "#8890A0",
    fontWeight: "600",
  },
  addBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#00C896",
    alignItems: "center",
  },
  addBtnText: {
    fontSize: 15,
    color: "#000000",
    fontWeight: "bold",
  },
});
