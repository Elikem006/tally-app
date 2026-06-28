/**
 * In-app notification history.
 * Uses expo-file-system (already in the project) instead of AsyncStorage,
 * which has a new native-module API in v3 that breaks in Expo Go.
 */
import * as FileSystem from "expo-file-system/legacy";

const HISTORY_FILE   = FileSystem.documentDirectory + "tally_notif_history.json";
const SEEN_FILE      = FileSystem.documentDirectory + "tally_seen_alerts.json";
const MAX_ITEMS      = 100;

export type NotifType =
  | "budget_over"
  | "budget_near"
  | "expense_added"
  | "reminder_due";

export interface HistoryNotif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
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
  return readJSON<HistoryNotif[]>(HISTORY_FILE, []);
}

async function _save(list: HistoryNotif[]): Promise<void> {
  await writeJSON(HISTORY_FILE, list.slice(0, MAX_ITEMS));
}

export async function addHistoryItem(
  item: Pick<HistoryNotif, "type" | "title" | "body">,
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
    const data  = await readJSON<Record<string, string[]>>(SEEN_FILE, {});
    const seen  = data[today] ?? [];
    const id    = `${category}_${type}`;
    if (seen.includes(id)) return false;
    await writeJSON(SEEN_FILE, { [today]: [...seen, id] });
    return true;
  } catch {
    return true;
  }
}
