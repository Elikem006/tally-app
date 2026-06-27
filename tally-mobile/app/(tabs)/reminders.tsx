import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { remindersAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { addHistoryItem } from "../../services/notificationHistory";

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchReminders();
  }, []);

  async function fetchReminders() {
    try {
      setLoading(true);
      const userId = getUserId();
      const response = await remindersAPI.getUserReminders(userId);
      setReminders(response.data);
    } catch (error) {
      Alert.alert("Error", "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddReminder() {
    if (!title.trim()) {
      Alert.alert("Validation", "Title is required");
      return;
    }
    if (!dueDate.trim()) {
      Alert.alert("Validation", "Due date is required (YYYY-MM-DD)");
      return;
    }

    try {
      setSaving(true);
      const userId = getUserId();
      await remindersAPI.createReminder(
        userId,
        title.trim(),
        amount.trim(),
        dueDate.trim(),
        isRecurring,
        isRecurring ? "MONTHLY" : "",
      );
      // Reset form
      setTitle("");
      setAmount("");
      setDueDate("");
      setIsRecurring(false);
      setShowAddForm(false);
      await fetchReminders();
      await addHistoryItem({
        type: "reminder_due",
        title: "Reminder set",
        body: `"${title.trim()}" due ${dueDate.trim()}${amount.trim() ? ` — GHS ${amount.trim()}` : ""}.`,
      });
      Alert.alert("Success", "Reminder added!");
    } catch (error) {
      Alert.alert("Error", "Failed to save reminder");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(reminderId: string) {
    try {
      await remindersAPI.markAsPaid(reminderId);
      await fetchReminders();
    } catch (error) {
      Alert.alert("Error", "Failed to mark as paid");
    }
  }

  async function handleDelete(reminderId: string) {
    Alert.alert("Delete Reminder", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await remindersAPI.deleteReminder(reminderId);
            await fetchReminders();
          } catch (error) {
            Alert.alert("Error", "Failed to delete reminder");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bill Reminders</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <Text style={styles.addBtnText}>{showAddForm ? "✕" : "+"}</Text>
        </TouchableOpacity>
      </View>

      {/* Add Form */}
      {showAddForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New Reminder</Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. Rent, Electricity"
            placeholderTextColor="#8890A0"
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={styles.input}
            placeholder="Amount (optional)"
            placeholderTextColor="#8890A0"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <TextInput
            style={styles.input}
            placeholder="Due date YYYY-MM-DD"
            placeholderTextColor="#8890A0"
            value={dueDate}
            onChangeText={setDueDate}
          />

          {/* Recurring toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Recurring?</Text>
            <TouchableOpacity
              style={[styles.toggle, isRecurring && styles.toggleActive]}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <Text style={[styles.toggleText, isRecurring && styles.toggleTextActive]}>
                {isRecurring ? "Monthly ✓" : "Off"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleAddReminder}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Saving…" : "Save Reminder"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setShowAddForm(false);
              setTitle("");
              setAmount("");
              setDueDate("");
              setIsRecurring(false);
            }}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reminders list */}
      {reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>No reminders yet</Text>
          <Text style={styles.emptySubtext}>
            Add bills to get notified when they're due
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, item.isPaid && styles.cardPaid]}>
              <View style={styles.cardBody}>
                {/* Left: info */}
                <View style={styles.cardInfo}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {item.dueDate && (
                    <Text style={styles.reminderDue}>Due: {item.dueDate}</Text>
                  )}
                  {item.amount != null && (
                    <Text style={styles.reminderAmount}>
                      GHS {parseFloat(item.amount).toFixed(2)}
                    </Text>
                  )}
                  {item.isRecurring && (
                    <Text style={styles.recurringTag}>
                      🔁 {item.recurrenceType || "Recurring"}
                    </Text>
                  )}
                </View>

                {/* Right: actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(String(item.id))}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>

                  {item.isPaid ? (
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidBadgeText}>Paid</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.markPaidBtn}
                      onPress={() => handleMarkPaid(String(item.id))}
                    >
                      <Text style={styles.markPaidText}>Mark Paid</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#00C896",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: "#000000",
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 24,
  },
  formCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#00C89630",
  },
  formTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  input: {
    backgroundColor: "#0F1117",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  toggleLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#0F1117",
    borderWidth: 1,
    borderColor: "#ffffff20",
  },
  toggleActive: {
    backgroundColor: "#00C89620",
    borderColor: "#00C896",
  },
  toggleText: {
    color: "#8890A0",
    fontSize: 13,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#00C896",
  },
  saveBtn: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff20",
  },
  cancelBtnText: {
    color: "#8890A0",
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  cardPaid: {
    opacity: 0.6,
    borderColor: "#00C89630",
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  reminderTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  reminderDue: {
    color: "#8890A0",
    fontSize: 13,
  },
  reminderAmount: {
    color: "#00C896",
    fontSize: 14,
    fontWeight: "600",
  },
  recurringTag: {
    color: "#8890A0",
    fontSize: 12,
    marginTop: 2,
  },
  cardActions: {
    alignItems: "flex-end",
    gap: 8,
    marginLeft: 12,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E05C5C20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E05C5C60",
  },
  deleteBtnText: {
    color: "#E05C5C",
    fontSize: 12,
    fontWeight: "bold",
  },
  markPaidBtn: {
    backgroundColor: "#00C89620",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#00C896",
  },
  markPaidText: {
    color: "#00C896",
    fontSize: 12,
    fontWeight: "700",
  },
  paidBadge: {
    backgroundColor: "#ffffff10",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paidBadgeText: {
    color: "#8890A0",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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
    textAlign: "center",
  },
});
