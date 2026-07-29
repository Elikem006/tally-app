import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import {
  getHistory,
  markAllRead,
  deleteItem,
  clearHistory,
  HistoryNotif,
} from '../services/notificationHistory';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Skeleton } from '../components/ui';
import { useConfirmModal } from '../hooks/useConfirmModal';

// ── Config per notification type (deliberately theme-independent — these are
// stable category colors, not affected by light/dark) ─────────────────────
const TYPE_CONFIG: Record<HistoryNotif['type'], { icon: string; color: string; bg: string }> = {
  budget_over: { icon: '🚨', color: '#E05C5C', bg: '#E05C5C18' },
  budget_near: { icon: '⚠️', color: '#F7A84F', bg: '#F7A84F18' },
  expense_added: { icon: '💰', color: '#EC4899', bg: '#EC489918' },
  income_added: { icon: '📈', color: '#10B981', bg: '#10B98118' },
  reminder_due: { icon: '⏰', color: '#60A5FA', bg: '#60A5FA18' },
  shared_expense: { icon: '💸', color: '#A78BFA', bg: '#A78BFA18' },
  settle_up: { icon: '✅', color: '#06B6D4', bg: '#06B6D418' },
  monthly_report: { icon: '📊', color: '#FFC107', bg: '#FFC10718' },
};

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Today';
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

type ListItem = { _isHeader: true; label: string } | (HistoryNotif & { _isHeader: false });

function buildSections(items: HistoryNotif[]): ListItem[] {
  const result: ListItem[] = [];
  let lastKey = '';
  for (const n of items) {
    const k = dayKey(n.timestamp);
    if (k !== lastKey) {
      result.push({ _isHeader: true, label: k });
      lastKey = k;
    }
    result.push({ ...n, _isHeader: false });
  }
  return result;
}

const SCREEN_BY_TYPE: Record<HistoryNotif['type'], string> = {
  budget_over: 'budget',
  budget_near: 'budget',
  expense_added: 'history',
  income_added: 'history',
  reminder_due: 'reminders',
  shared_expense: 'groups',
  settle_up: 'groups',
  monthly_report: 'report',
};

export default function NotificationHistoryScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  const [items, setItems] = useState<HistoryNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const list = await getHistory();
      setItems(list);
      await markAllRead();
    } finally {
      setRefreshing(false);
    }
  }

  // First load only. Reads from local storage, so a refocus resolves almost
  // instantly — the spinner it used to show was a flicker, not information.
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!hasLoadedOnce.current) setLoading(true);
        try {
          const list = await getHistory();
          if (active) setItems(list);
        } finally {
          // Guarded by `active` so a screen left mid-flight doesn't set state
          // after unmount.
          if (active) {
            hasLoadedOnce.current = true;
            setLoading(false);
          }
        }
        await markAllRead();
      })();
      return () => { active = false; };
    }, []),
  );

  async function handleDelete(id: string) {
    await deleteItem(id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  function handleNotificationPress(notification: HistoryNotif) {
    const screen = notification.data?.screen ?? SCREEN_BY_TYPE[notification.type];
    if (!screen) return;

    if (screen === 'group-detail' && notification.data?.groupId) {
      router.push({ pathname: '/group-detail', params: { groupId: notification.data.groupId } });
    } else if (screen === 'budget-overview' || screen === 'budget') {
      router.push('/(tabs)/budget');
    } else if (screen === 'reminders') {
      router.push('/reminders');
    } else if (screen === 'report') {
      router.push('/report');
    } else if (screen === 'groups') {
      router.push('/(tabs)/groups');
    } else if (screen === 'history') {
      router.push('/(tabs)/history');
    }
  }

  function handleClearAll() {
    showConfirm({
      icon: '🗑️',
      title: 'Clear All',
      message: 'Remove all notification history? This cannot be undone.',
      confirmText: 'Clear',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        await clearHistory();
        setItems([]);
      },
    });
  }

  const listData = buildSections(items);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[typography.bodyStrong, { color: colors.text }]} accessibilityRole="header">Notifications</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Text style={[typography.caption, { color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {/* Loading is checked before empty: otherwise an in-flight read renders
          "All caught up" and then replaces it, telling the user there is
          nothing here before that is actually known. */}
      {loading ? (
        <View style={{ padding: spacing.lg }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={38} height={38} borderRadius={19} />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <Skeleton width="70%" height={13} />
                <Skeleton width="45%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <Text style={{ fontSize: 52 }}>🔔</Text>
          <Text style={[typography.headline, { color: colors.text }]}>All caught up</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Budget alerts, expense saves, and reminders will appear here.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => (item._isHeader ? `hdr-${i}` : item.id)}
          contentContainerStyle={{ paddingBottom: 32, paddingTop: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          renderItem={({ item }) => {
            if (item._isHeader) {
              return <Text style={[typography.label, { color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm }]}>{item.label}</Text>;
            }
            const cfg = TYPE_CONFIG[item.type];
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleNotificationPress(item)}
                style={[
                  styles.card,
                  { backgroundColor: cfg.bg, borderColor: item.read ? 'transparent' : colors.borderSubtle },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${cfg.color}25` }]}>
                  <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTop}>
                    <Text style={[typography.bodyStrong, { color: item.read ? colors.textSecondary : colors.text, flex: 1 }]}>
                      {item.title}
                    </Text>
                    {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.xs }]}>{item.body}</Text>
                  <Text style={[typography.label, { color: colors.textTertiary }]}>{relativeTime(item.timestamp)}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textSecondary} style={{ alignSelf: 'center', marginHorizontal: spacing.xs }} />
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                  hitSlop={12}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                >
                  <Feather name="x" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {ConfirmModalComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { paddingHorizontal: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
    flexShrink: 0,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  deleteBtn: { paddingLeft: spacing.xs, paddingTop: 2 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: spacing.md,
  },
});
