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
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { remindersAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { addHistoryItem } from "../../services/notificationHistory";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

// Helper to check urgency (overdue or due within 2 days)
const getUrgentStatus = (dueDateStr: string, isPaid: boolean): { urgent: boolean; label: string; color: string } | null => {
  if (isPaid) return null;
  if (!dueDateStr) return null;
  try {
    const parts = dueDateStr.split("-");
    if (parts.length < 3) return null;
    const dueYear = parseInt(parts[0]);
    const dueMonth = parseInt(parts[1]) - 1;
    const dueDay = parseInt(parts[2]);

    const dueDateObj = new Date(dueYear, dueMonth, dueDay);
    dueDateObj.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = dueDateObj.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { urgent: true, label: "Overdue", color: "#FF3B30" };
    } else if (diffDays === 0) {
      return { urgent: true, label: "Due Today", color: "#FF9500" };
    } else if (diffDays <= 2) {
      return { urgent: true, label: `Due in ${diffDays}d`, color: "#FF9500" };
    }
  } catch (e) {
    // silent catch
  }
  return null;
};

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
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
      setReminders(response.data || []);
      setError(null);
    } catch (error) {
      console.log("Error loading reminders:", error);
      setError("Failed to load reminders. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchReminders(false);
    setRefreshing(false);
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
      
      await fetchReminders(false);
      
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
      await fetchReminders(false);
      showToast("Marked as paid", "success");
    } catch (error) {
      showToast("Failed to mark as paid", "error");
    }
  }

  async function handleDelete(reminderId: string) {
    Alert.alert("Delete Reminder", "Are you sure you want to delete this reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await remindersAPI.deleteReminder(reminderId);
            await fetchReminders(false);
            showToast("Reminder deleted", "info");
          } catch (error) {
            showToast("Failed to delete reminder", "error");
          }
        },
      },
    ]);
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (error && reminders.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={['#8B5CF6']} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.flex, { paddingTop: Math.max(insets.top, 20) }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Bill Reminders</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAddForm(!showAddForm)}
            activeOpacity={0.8}
          >
            <Feather name={showAddForm ? "x" : "plus"} size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Add Form */}
        {showAddForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Reminder</Text>

            <TextInput
              style={styles.input}
              placeholder="Bill Title (e.g. Rent, Electricity)"
              placeholderTextColor="#8E9AA6"
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Amount GHS (optional)"
              placeholderTextColor="#8E9AA6"
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
              <Text style={styles.toggleLabel}>Is this a monthly recurring bill?</Text>
              <TouchableOpacity
                style={[styles.toggleBtn, isRecurring && styles.toggleBtnActive]}
                onPress={() => setIsRecurring(!isRecurring)}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleBtnText, isRecurring && styles.toggleBtnTextActive]}>
                  {isRecurring ? "Monthly ✓" : "Once"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleAddReminder}
              disabled={saving}
              activeOpacity={0.8}
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
              activeOpacity={0.8}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={['#8B5CF6']} />}
            renderItem={({ item }) => {
              const isPaid = item.isPaid || item.paid || false;
              const urgentStatus = getUrgentStatus(item.dueDate, isPaid);

              return (
                <View style={[styles.card, isPaid && styles.cardPaid]}>
                  <View style={styles.cardBody}>
                    {/* Left Icon */}
                    <View style={[styles.iconBox, isPaid && styles.iconBoxPaid]}>
                      <Feather 
                        name={isPaid ? "check-circle" : "file-text"} 
                        size={20} 
                        color={isPaid ? "#34C759" : "#111111"} 
                      />
                    </View>

                    {/* Info details */}
                    <View style={styles.cardInfo}>
                      <View style={styles.titleRow}>
                        <Text style={styles.reminderTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {urgentStatus?.urgent && (
                          <View style={[styles.urgentBadge, { backgroundColor: urgentStatus.color + "12", borderColor: urgentStatus.color + "30" }]}>
                            <Text style={[styles.urgentBadgeText, { color: urgentStatus.color }]}>
                              ⚠️ {urgentStatus.label}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.metaRow}>
                        {item.dueDate && (
                          <Text style={styles.reminderDue}>
                            Due: {item.dueDate}
                          </Text>
                        )}
                        {item.isRecurring && (
                          <Text style={styles.recurringTag}>
                            • {item.recurrenceType || "Recurring"}
                          </Text>
                        )}
                      </View>

                      {item.amount != null && item.amount !== "" && (
                        <Text style={styles.reminderAmount}>
                          GHS {parseFloat(item.amount).toFixed(2)}
                        </Text>
                      )}
                    </View>

                    {/* Actions (Paid Badge / Mark Paid button, Delete button) */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(String(item.id))}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={16} color="#FF3B30" />
                      </TouchableOpacity>

                      {isPaid ? (
                        <View style={styles.paidBadge}>
                          <Text style={styles.paidBadgeText}>✓ Paid</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.markPaidBtn}
                          onPress={() => handleMarkPaid(String(item.id))}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.markPaidText}>Mark Paid</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#F2F4F7",
  },
  centered: {
    flex: 1,
    backgroundColor: "#F2F4F7",
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111111",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  formTitle: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#111111",
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  label: {
    fontSize: 12,
    color: "#8E9AA6",
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
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    overflow: "hidden",
  },
  datePickerLabel: {
    fontSize: 11,
    color: "#8E9AA6",
    textAlign: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEBEF",
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
    backgroundColor: "#8B5CF612",
  },
  datePickerItemText: {
    fontSize: 13,
    color: "#8E9AA6",
    textAlign: "center",
  },
  datePickerItemTextSelected: {
    color: "#8B5CF6",
    fontWeight: "bold",
  },
  selectedDateText: {
    fontSize: 13,
    color: "#8B5CF6",
    marginBottom: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  toggleLabel: {
    color: "#8E9AA6",
    fontSize: 13,
    fontWeight: "600",
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F2F4F7",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  toggleBtnActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  toggleBtnText: {
    color: "#8E9AA6",
    fontSize: 12,
    fontWeight: "700",
  },
  toggleBtnTextActive: {
    color: "#ffffff",
  },
  saveBtn: {
    backgroundColor: "#111111",
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelBtn: {
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  cancelBtnText: {
    color: "#8E9AA6",
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardPaid: {
    opacity: 0.65,
    backgroundColor: "#F8F9FA",
    borderColor: "#EAEBEF",
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F8F9FA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAEBEF",
    marginRight: 12,
  },
  iconBoxPaid: {
    backgroundColor: "#34C75912",
    borderColor: "#34C75930",
  },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  reminderTitle: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "bold",
    maxWidth: "60%",
  },
  urgentBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  reminderDue: {
    color: "#8E9AA6",
    fontSize: 12,
    fontWeight: "500",
  },
  recurringTag: {
    color: "#8E9AA6",
    fontSize: 11,
    fontWeight: "500",
  },
  reminderAmount: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "bold",
  },
  cardActions: {
    alignItems: "flex-end",
    gap: 8,
    marginLeft: 12,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF3B3012",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FF3B3030",
  },
  markPaidBtn: {
    backgroundColor: "#111111",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  markPaidText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  paidBadge: {
    backgroundColor: "#34C75912",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#34C75930",
  },
  paidBadgeText: {
    color: "#34C759",
    fontSize: 11,
    fontWeight: "bold",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#8E9AA6",
    textAlign: "center",
  },
});
