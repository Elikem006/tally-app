import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import {
  getHistory,
  markAllRead,
  deleteItem,
  clearHistory,
  HistoryNotif,
} from "../services/notificationHistory";

// ── Config per notification type ──────────────────────────────────────────────
const TYPE_CONFIG: Record<
  HistoryNotif["type"],
  { icon: string; color: string; bg: string }
> = {
  budget_over:    { icon: "🚨", color: "#E05C5C", bg: "#E05C5C18" },
  budget_near:    { icon: "⚠️", color: "#F7A84F", bg: "#F7A84F18" },
  expense_added:  { icon: "💰", color: "#00C896", bg: "#00C89618" },
  reminder_due:   { icon: "⏰", color: "#60A5FA", bg: "#60A5FA18" },
  shared_expense: { icon: "💸", color: "#A78BFA", bg: "#A78BFA18" },
  settle_up:      { icon: "✅", color: "#00C896", bg: "#00C89618" },
  monthly_report: { icon: "📊", color: "#FFC107", bg: "#FFC10718" },
};

// ── Relative time label ───────────────────────────────────────────────────────
function relativeTime(ts: number): string {
  const diffMs  = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)   return "just now";
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr  < 24)  return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay <  7)  return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Day label for section headers ─────────────────────────────────────────────
function dayKey(ts: number): string {
  const d = new Date(ts);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

// ── Grouped list item type ────────────────────────────────────────────────────
type ListItem = { _isHeader: true; label: string } | (HistoryNotif & { _isHeader: false });

function buildSections(items: HistoryNotif[]): ListItem[] {
  const result: ListItem[] = [];
  let lastKey = "";
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

// ─────────────────────────────────────────────────────────────────────────────

// ── Navigation helper ─────────────────────────────────────────────────────────
const SCREEN_BY_TYPE: Record<HistoryNotif["type"], string> = {
  budget_over:    "budget-overview",
  budget_near:    "budget-overview",
  expense_added:  "history",
  reminder_due:   "reminders",
  shared_expense: "groups",
  settle_up:      "groups",
  monthly_report: "report",
};

export default function NotificationHistoryScreen() {
  const [items,   setItems]   = useState<HistoryNotif[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const list = await getHistory();
        if (active) setItems(list);
        setLoading(false);
        // Mark everything read now that user is viewing
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
    // Prefer stored data field (new items); fall back to type-based routing (legacy)
    const screen = notification.data?.screen ?? SCREEN_BY_TYPE[notification.type];
    if (!screen) return;

    if (screen === "group-detail" && notification.data?.groupId) {
      router.push({ pathname: "/group-detail", params: { groupId: notification.data.groupId } });
    } else if (screen === "budget-overview") {
      router.push("/(tabs)/budget-overview");
    } else if (screen === "reminders") {
      router.push("/(tabs)/reminders");
    } else if (screen === "report") {
      router.push("/(tabs)/report");
    } else if (screen === "groups") {
      router.push("/(tabs)/groups");
    } else if (screen === "history") {
      router.push("/(tabs)/history");
    }
  }

  async function handleClearAll() {
    Alert.alert("Clear all", "Remove all notification history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearHistory();
          setItems([]);
        },
      },
    ]);
  }

  const listData = buildSections(items);

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>
            Budget alerts, expense saves, and reminders will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) =>
            item._isHeader ? `hdr-${i}` : item.id
          }
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
          renderItem={({ item }) => {
            if (item._isHeader) {
              return (
                <Text style={styles.sectionLabel}>{item.label}</Text>
              );
            }
            const cfg = TYPE_CONFIG[item.type];
            return (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleNotificationPress(item)}
                style={[
                  styles.card,
                  { backgroundColor: cfg.bg },
                  !item.read && styles.cardUnread,
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: cfg.color + "25" }]}>
                  <Text style={styles.iconText}>{cfg.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}>
                      {item.title}
                    </Text>
                    {!item.read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.cardDesc}>{item.body}</Text>
                  <Text style={styles.cardTime}>{relativeTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.deleteX}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },
  centered:  { flex: 1, backgroundColor: "#0F1117", alignItems: "center", justifyContent: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
  },
  backBtn:   { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 32, color: "#ffffff", lineHeight: 36, marginTop: -4 },
  title:     { fontSize: 18, fontWeight: "700", color: "#ffffff" },
  clearBtn:  { paddingHorizontal: 4 },
  clearText: { fontSize: 13, color: "#E05C5C", fontWeight: "600" },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8890A0",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },

  // Notification card
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ffffff08",
  },
  cardUnread: {
    borderColor: "#ffffff20",
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  cardBody:  { flex: 1 },
  cardTop:   { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#8890A0", flex: 1 },
  cardTitleUnread: { color: "#ffffff" },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00C896" },
  cardDesc:  { fontSize: 13, color: "#8890A0", lineHeight: 18, marginBottom: 4 },
  cardTime:  { fontSize: 11, color: "#6B7280" },
  chevron:   { fontSize: 20, color: "#8890A0", paddingHorizontal: 4, alignSelf: "center" },
  deleteBtn: { paddingLeft: 4, paddingTop: 2 },
  deleteX:   { fontSize: 14, color: "#6B7280" },

  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon:  { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#ffffff" },
  emptyBody:  { fontSize: 14, color: "#8890A0", textAlign: "center", lineHeight: 20 },
});
