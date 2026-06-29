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
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { remindersAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { addHistoryItem } from "../../services/notificationHistory";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [isRecurring, setIsRecurring] = useState(false);

  const MONTHS = [
    { label: "January",   value: "01", days: 31 },
    { label: "February",  value: "02", days: 28 },
    { label: "March",     value: "03", days: 31 },
    { label: "April",     value: "04", days: 30 },
    { label: "May",       value: "05", days: 31 },
    { label: "June",      value: "06", days: 30 },
    { label: "July",      value: "07", days: 31 },
    { label: "August",    value: "08", days: 31 },
    { label: "September", value: "09", days: 30 },
    { label: "October",   value: "10", days: 31 },
    { label: "November",  value: "11", days: 30 },
    { label: "December",  value: "12", days: 31 },
  ];
  const currentYear = new Date().getFullYear();
  const YEARS = [String(currentYear), String(currentYear + 1), String(currentYear + 2)];
  const daysInMonth = selectedMonth
    ? MONTHS.find((m) => m.value === selectedMonth)?.days || 31
    : 31;
  const DAYS = Array.from({ length: daysInMonth }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );
  const [saving, setSaving] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  useEffect(() => {
    fetchReminders();
  }, []);

  async function fetchReminders(showSpinner = true) {
    try {
      if (showSpinner) setLoading(true);
      const userId = getUserId();
      const response = await remindersAPI.getUserReminders(userId);
      setReminders(response.data);
      setError(null);
    } catch (err) {
      setError("Something went wrong. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchReminders(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAddReminder() {
    if (!title.trim()) {
      showToast("Title is required", "error");
      return;
    }
    if (!selectedDay || !selectedMonth || !selectedYear) {
      showToast("Please select a due date", "error");
      return;
    }

    const dueDateString = `${selectedYear}-${selectedMonth}-${selectedDay}`;
    const friendlyDate = `${selectedDay} ${MONTHS.find((m) => m.value === selectedMonth)?.label} ${selectedYear}`;

    try {
      setSaving(true);
      const userId = getUserId();
      await remindersAPI.createReminder(
        userId,
        title.trim(),
        amount.trim(),
        dueDateString,
        isRecurring,
        isRecurring ? "MONTHLY" : "",
      );
      // Reset form
      setTitle("");
      setAmount("");
      setSelectedDay("");
      setSelectedMonth("");
      setSelectedYear(String(new Date().getFullYear()));
      setIsRecurring(false);
      setShowAddForm(false);
      await fetchReminders();
      await addHistoryItem({
        type: "reminder_due",
        title: "Reminder set",
        body: `"${title.trim()}" due ${friendlyDate}${amount.trim() ? ` — GHS ${amount.trim()}` : ""}.`,
        data: { screen: "reminders" },
      });
      showToast("Reminder added!", "success");
    } catch (error) {
      showToast("Failed to save reminder", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(reminderId: string) {
    try {
      await remindersAPI.markAsPaid(reminderId);
      await fetchReminders();
    } catch (error) {
      showToast("Failed to mark as paid", "error");
    }
  }

  async function handleDelete(reminderId: string) {
    // Keep Alert for confirmation — it requires user action (Cancel/Delete)
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
            showToast("Failed to delete reminder", "error");
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

  if (error && reminders.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <View style={{ flex: 1 }}>
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

          <Text style={styles.label}>Due Date</Text>
          <View style={styles.datePickerRow}>
            {/* Day */}
            <View style={styles.datePickerSection}>
              <Text style={styles.datePickerLabel}>Day</Text>
              <ScrollView
                style={styles.datePickerScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {DAYS.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.datePickerItem, selectedDay === day && styles.datePickerItemSelected]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text style={[styles.datePickerItemText, selectedDay === day && styles.datePickerItemTextSelected]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Month */}
            <View style={[styles.datePickerSection, { flex: 2 }]}>
              <Text style={styles.datePickerLabel}>Month</Text>
              <ScrollView
                style={styles.datePickerScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {MONTHS.map((month) => (
                  <TouchableOpacity
                    key={month.value}
                    style={[styles.datePickerItem, selectedMonth === month.value && styles.datePickerItemSelected]}
                    onPress={() => {
                      setSelectedMonth(month.value);
                      if (parseInt(selectedDay) > month.days) setSelectedDay("01");
                    }}
                  >
                    <Text style={[styles.datePickerItemText, selectedMonth === month.value && styles.datePickerItemTextSelected]}>
                      {month.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Year */}
            <View style={styles.datePickerSection}>
              <Text style={styles.datePickerLabel}>Year</Text>
              <ScrollView
                style={styles.datePickerScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {YEARS.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[styles.datePickerItem, selectedYear === year && styles.datePickerItemSelected]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Text style={[styles.datePickerItemText, selectedYear === year && styles.datePickerItemTextSelected]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          {selectedDay && selectedMonth && selectedYear && (
            <Text style={styles.selectedDateText}>
              📅 Selected: {selectedDay} {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </Text>
          )}

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
              setSelectedDay("");
              setSelectedMonth("");
              setSelectedYear(String(new Date().getFullYear()));
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
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
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
    <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
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
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
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
  label: {
    fontSize: 12,
    color: "#8890A0",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  datePickerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  datePickerSection: {
    flex: 1,
    backgroundColor: "#0F1117",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff15",
    overflow: "hidden",
  },
  datePickerLabel: {
    fontSize: 11,
    color: "#8890A0",
    textAlign: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
    fontWeight: "600",
  },
  datePickerScroll: {
    maxHeight: 140,
  },
  datePickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  datePickerItemSelected: {
    backgroundColor: "#00C89620",
  },
  datePickerItemText: {
    fontSize: 13,
    color: "#8890A0",
    textAlign: "center",
  },
  datePickerItemTextSelected: {
    color: "#00C896",
    fontWeight: "bold",
  },
  selectedDateText: {
    fontSize: 13,
    color: "#00C896",
    marginBottom: 12,
    textAlign: "center",
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
    textAlign: "center",
  },
});
