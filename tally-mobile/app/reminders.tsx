import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { remindersAPI } from '../services/api';
import { getUserId } from '../services/storage';
import { addHistoryItem } from '../services/notificationHistory';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Card, Button, Input, EmptyState, Skeleton } from '../components/ui';

const getUrgentStatus = (dueDateStr: string, isPaid: boolean, colors: ReturnType<typeof getExtendedColors>): { urgent: boolean; label: string; color: string } | null => {
  if (isPaid) return null;
  if (!dueDateStr) return null;
  try {
    const parts = dueDateStr.split('-');
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
      return { urgent: true, label: 'Overdue', color: colors.negative };
    } else if (diffDays === 0) {
      return { urgent: true, label: 'Due Today', color: colors.warning };
    } else if (diffDays <= 2) {
      return { urgent: true, label: `Due in ${diffDays}d`, color: colors.warning };
    }
  } catch (e) {
    // silent catch
  }
  return null;
};

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [isRecurring, setIsRecurring] = useState(false);

  const MONTHS = [
    { label: 'January', value: '01', days: 31 },
    { label: 'February', value: '02', days: 28 },
    { label: 'March', value: '03', days: 31 },
    { label: 'April', value: '04', days: 30 },
    { label: 'May', value: '05', days: 31 },
    { label: 'June', value: '06', days: 30 },
    { label: 'July', value: '07', days: 31 },
    { label: 'August', value: '08', days: 31 },
    { label: 'September', value: '09', days: 30 },
    { label: 'October', value: '10', days: 31 },
    { label: 'November', value: '11', days: 30 },
    { label: 'December', value: '12', days: 31 },
  ];

  const currentYear = new Date().getFullYear();
  const YEARS = [String(currentYear), String(currentYear + 1), String(currentYear + 2)];

  const daysInMonth = selectedMonth
    ? MONTHS.find((m) => m.value === selectedMonth)?.days || 31
    : 31;
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));

  const [saving, setSaving] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

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
      setError('Failed to load reminders. Pull down to refresh.');
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
      showToast('Title is required', 'error');
      return;
    }
    if (!selectedDay || !selectedMonth || !selectedYear) {
      showToast('Please select a due date', 'error');
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
        isRecurring ? 'MONTHLY' : '',
      );

      setTitle('');
      setAmount('');
      setSelectedDay('');
      setSelectedMonth('');
      setSelectedYear(String(new Date().getFullYear()));
      setIsRecurring(false);
      setShowAddForm(false);

      await fetchReminders(false);

      await addHistoryItem({
        type: 'reminder_due',
        title: 'Reminder set',
        body: `"${title.trim()}" due ${friendlyDate}${amount.trim() ? ` — GHS ${amount.trim()}` : ''}.`,
        data: { screen: 'reminders' },
      });
      showToast('Reminder added!', 'success');
    } catch (error) {
      showToast('Failed to save reminder', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(reminderId: string) {
    try {
      await remindersAPI.markAsPaid(reminderId);
      await fetchReminders(false);
      showToast('Marked as paid', 'success');
    } catch (error) {
      showToast('Failed to mark as paid', 'error');
    }
  }

  function handleDelete(reminderId: string) {
    showConfirm({
      icon: 'trash-2',
      title: 'Delete Reminder',
      message: 'Are you sure you want to delete this reminder?',
      confirmText: 'Delete',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        try {
          await remindersAPI.deleteReminder(reminderId);
          await fetchReminders(false);
          showToast('Reminder deleted', 'info');
        } catch {
          showToast('Failed to delete reminder', 'error');
        }
      },
    });
  }

  if (error && reminders.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl }]}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.flex, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: spacing.sm, padding: spacing.xs }}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[typography.display, { color: colors.text, flex: 1 }]} accessibilityRole="header">Bill Reminders</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddForm(!showAddForm)}
            activeOpacity={0.8}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={showAddForm ? 'Close new reminder form' : 'Add reminder'}
          >
            <Feather name={showAddForm ? 'x' : 'plus'} size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {showAddForm && (
          <ScrollView
            style={{ maxHeight: 400, marginHorizontal: spacing.md, marginBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <Card>
              <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>New Reminder</Text>

              <Input
                label="Bill Title"
                placeholder="e.g. Rent, Electricity"
                value={title}
                onChangeText={setTitle}
                containerStyle={{ marginBottom: spacing.sm + 2 }}
              />

              <Input
                label="Amount GHS (optional)"
                placeholder="0.00"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                containerStyle={{ marginBottom: spacing.sm + 2 }}
              />

              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Due Date</Text>
              <View style={styles.datePickerRow}>
                <View style={[styles.datePickerSection, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.label, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: colors.border }]}>Day</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {DAYS.map((day) => (
                      <TouchableOpacity key={day} style={[styles.datePickerItem, selectedDay === day && { backgroundColor: colors.primary }]} onPress={() => setSelectedDay(day)}>
                        <Text style={[typography.caption, { color: selectedDay === day ? colors.onPrimary : colors.textSecondary, textAlign: 'center', fontFamily: selectedDay === day ? typography.bodyStrong.fontFamily : typography.caption.fontFamily }]}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={[styles.datePickerSection, { flex: 2, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.label, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: colors.border }]}>Month</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {MONTHS.map((month) => (
                      <TouchableOpacity
                        key={month.value}
                        style={[styles.datePickerItem, selectedMonth === month.value && { backgroundColor: colors.primary }]}
                        onPress={() => {
                          setSelectedMonth(month.value);
                          if (parseInt(selectedDay) > month.days) setSelectedDay('01');
                        }}
                      >
                        <Text style={[typography.caption, { color: selectedMonth === month.value ? colors.onPrimary : colors.textSecondary, textAlign: 'center', fontFamily: selectedMonth === month.value ? typography.bodyStrong.fontFamily : typography.caption.fontFamily }]}>{month.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={[styles.datePickerSection, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.label, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: colors.border }]}>Year</Text>
                  <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {YEARS.map((year) => (
                      <TouchableOpacity key={year} style={[styles.datePickerItem, selectedYear === year && { backgroundColor: colors.primary }]} onPress={() => setSelectedYear(year)}>
                        <Text style={[typography.caption, { color: selectedYear === year ? colors.onPrimary : colors.textSecondary, textAlign: 'center', fontFamily: selectedYear === year ? typography.bodyStrong.fontFamily : typography.caption.fontFamily }]}>{year}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              {selectedDay && selectedMonth && selectedYear && (
                <Text style={[typography.caption, { color: colors.primary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.sm + 2, fontFamily: typography.bodyStrong.fontFamily }]}>
                  📅 Selected: {selectedDay} {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
                </Text>
              )}

              <View style={styles.toggleRow}>
                <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily, flex: 1, marginRight: spacing.sm }]}>Is this a monthly recurring bill?</Text>
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: colors.neutralBg }, isRecurring && { backgroundColor: colors.primary }]}
                  onPress={() => setIsRecurring(!isRecurring)}
                  activeOpacity={0.8}
                >
                  <Text style={[typography.label, { color: isRecurring ? colors.onPrimary : colors.textSecondary }]}>
                    {isRecurring ? 'Monthly ✓' : 'Once'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Button title="Save Reminder" onPress={handleAddReminder} loading={saving} style={{ marginBottom: spacing.sm }} />
              <Button
                title="Cancel"
                onPress={() => {
                  setShowAddForm(false);
                  setTitle('');
                  setAmount('');
                  setSelectedDay('');
                  setSelectedMonth('');
                  setSelectedYear(String(new Date().getFullYear()));
                  setIsRecurring(false);
                }}
                variant="secondary"
              />
            </Card>
          </ScrollView>
        )}

        {/* Three genuinely distinct states. The loading arm has to come first:
            without it, an in-flight fetch falls through to `length === 0` and
            claims there are no reminders before that is actually known. */}
        {loading && !refreshing ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={86} borderRadius={radius.lg} style={{ marginBottom: spacing.md }} />
            ))}
          </View>
        ) : reminders.length === 0 ? (
          <EmptyState icon="bell" title="No reminders yet" body="Add bills to get notified when they're due" />
        ) : (
          <FlatList
            data={reminders}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            renderItem={({ item }) => {
              const isPaid = item.isPaid || item.paid || false;
              const urgentStatus = getUrgentStatus(item.dueDate, isPaid, colors);

              return (
                <Card
                  style={[
                    styles.cardStyle,
                    isPaid && { borderColor: `${colors.positive}40`, opacity: 0.8 },
                  ]}
                >
                  <View style={styles.cardBody}>
                    <View style={[styles.iconBox, { backgroundColor: colors.neutralBg }, isPaid && { backgroundColor: `${colors.positive}15` }]}>
                      <Feather name={isPaid ? 'check-circle' : 'file-text'} size={20} color={isPaid ? colors.positive : colors.text} />
                    </View>

                    <View style={styles.cardInfo}>
                      <View style={styles.titleRow}>
                        <Text style={[typography.bodyStrong, { color: colors.text, maxWidth: '60%' }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {urgentStatus?.urgent && (
                          <View style={[styles.urgentBadge, { backgroundColor: `${urgentStatus.color}12`, borderColor: `${urgentStatus.color}30` }]}>
                            <Text style={[typography.label, { color: urgentStatus.color }]}>⚠️ {urgentStatus.label}</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.metaRow}>
                        {item.dueDate && <Text style={[typography.caption, { color: colors.textSecondary }]}>Due: {item.dueDate}</Text>}
                        {item.isRecurring && <Text style={[typography.label, { color: colors.textSecondary }]}>• {item.recurrenceType || 'Recurring'}</Text>}
                      </View>

                      {item.amount != null && item.amount !== '' && (
                        <Text style={[typography.bodyStrong, { color: colors.text }]}>GHS {parseFloat(item.amount).toFixed(2)}</Text>
                      )}
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: `${colors.negative}12`, borderColor: `${colors.negative}30` }]}
                        onPress={() => handleDelete(String(item.id))}
                        activeOpacity={0.7}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete reminder: ${item.title}`}
                      >
                        <Feather name="trash-2" size={16} color={colors.negative} />
                      </TouchableOpacity>

                      {isPaid ? (
                        <View style={[styles.paidBadge, { backgroundColor: `${colors.positive}12`, borderColor: `${colors.positive}30` }]}>
                          <Text style={[typography.label, { color: colors.positive }]}>✓ Paid</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={[styles.markPaidBtn, { backgroundColor: colors.primary }]} onPress={() => handleMarkPaid(String(item.id))} activeOpacity={0.8}>
                          <Text style={[typography.label, { color: colors.onPrimary }]}>Mark Paid</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </Card>
              );
            }}
          />
        )}
      </View>
      {ConfirmModalComponent}
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm + 2,
  },
  datePickerSection: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  datePickerScroll: {
    maxHeight: 140,
  },
  datePickerItem: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
  },
  cardStyle: {
    marginBottom: spacing.sm + 2,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  urgentBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginLeft: spacing.md,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  markPaidBtn: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 3,
  },
  paidBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 3,
    borderWidth: 1,
  },
});
