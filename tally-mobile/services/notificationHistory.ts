/**
 * In-app notification history.
 * Uses expo-file-system (already in the project) instead of AsyncStorage,
 * which has a new native-module API in v3 that breaks in Expo Go.
 */
import * as FileSystem from "expo-file-system/legacy";
import { getToken, getUserId } from "./storage";

// Notifications are per-account, not per-device. These paths used to be fixed
// filenames, so every account signing in on the same device read and wrote one
// shared history — each user saw everyone else's alerts. Scoping by userId
// keeps them separate; logging out simply stops resolving to that file.
//
// Gated on the token rather than the id alone: resetCurrentUser() leaves
// userId at its '1' placeholder on logout, which would otherwise resolve a
// logged-out session to the real user #1's file.
const scope       = () => (getToken() ? getUserId() || "anon" : "anon");
const historyFile = () => `${FileSystem.documentDirectory}tally_notif_history_${scope()}.json`;
const seenFile    = () => `${FileSystem.documentDirectory}tally_seen_alerts_${scope()}.json`;
const MAX_ITEMS   = 100;

export type NotifType =
  | "budget_over"
  | "budget_near"
  | "expense_added"
  | "income_added"
  | "reminder_due"
  | "shared_expense"
  | "settle_up"
  | "monthly_report";

export interface HistoryNotif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  /** Navigation data — same shape as push notification content.data */
  data?: Record<string, string>;
  timestamp: number;
  read: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(path: string, data: unknown): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
  } catch {
    // fail silently — history is best-effort
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<HistoryNotif[]> {
  return readJSON<HistoryNotif[]>(historyFile(), []);
}

async function _save(list: HistoryNotif[]): Promise<void> {
  await writeJSON(historyFile(), list.slice(0, MAX_ITEMS));
}

export async function addHistoryItem(
  item: Pick<HistoryNotif, "type" | "title" | "body"> & { data?: Record<string, string> },
): Promise<void> {
  const list = await getHistory();
  const entry: HistoryNotif = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    read: false,
  };
  await _save([entry, ...list]);
}

export async function markAllRead(): Promise<void> {
  const list = await getHistory();
  await _save(list.map((n) => ({ ...n, read: true })));
}

export async function deleteItem(id: string): Promise<void> {
  const list = await getHistory();
  await _save(list.filter((n) => n.id !== id));
}

export async function clearHistory(): Promise<void> {
  await _save([]);
}

export async function getUnreadCount(): Promise<number> {
  const list = await getHistory();
  return list.filter((n) => !n.read).length;
}

// ─── Budget-alert deduplication ──────────────────────────────────────────────
// Each category+type combo fires at most once per calendar day.
export async function shouldFireBudgetAlert(
  category: string,
  type: "over" | "near",
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data  = await readJSON<Record<string, string[]>>(seenFile(), {});
    const seen  = data[today] ?? [];
    const id    = `${category}_${type}`;
    if (seen.includes(id)) return false;
    await writeJSON(seenFile(), { [today]: [...seen, id] });
    return true;
  } catch {
    return true;
  }
}
