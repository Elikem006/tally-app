import AsyncStorage from '@react-native-async-storage/async-storage';

// Global store for user session (lives here, not in login.tsx, to avoid circular dependencies)
export let currentUser = {
  token: '',
  userId: '1',
  userName: 'User',
  email: '',
  avatarType: '',
  avatarData: '',
  phoneNumber: '',
  lastCategory: 'Food',
  lastPaymentMethod: 'CASH',
};

export function getUserId(): string {
  return currentUser.userId || "";
}

export function getUserName(): string {
  return currentUser.userName || "User";
}

export function getToken(): string {
  return currentUser.token || "";
}

/** Reset the in-memory session to logged-out defaults. */
export function resetCurrentUser(): void {
  currentUser.token = '';
  currentUser.userId = '1';
  currentUser.userName = '';
  currentUser.email = '';
  currentUser.avatarType = '';
  currentUser.avatarData = '';
  currentUser.phoneNumber = '';
  currentUser.lastCategory = 'Food';
  currentUser.lastPaymentMethod = 'CASH';
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const val = await AsyncStorage.getItem(key);
      return val;
    } catch (e) {
      // Fallback to localStorage on Web / simulator native module mismatch
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    }
  }
};

// ─── Remember Me ──────────────────────────────────────────────────────────────

export const REMEMBERED_USER_KEY = 'tallyRememberedUser';

export interface RememberedUser {
  email: string;
  userId: string;
  userName: string;
  token: string;
  avatarType: string;
  avatarData: string;
  phoneNumber: string;
}

/** Persist the current session so the user is logged in automatically next launch. */
export async function saveRememberedUser(): Promise<void> {
  const payload: RememberedUser = {
    email: currentUser.email,
    userId: currentUser.userId,
    userName: currentUser.userName,
    token: currentUser.token,
    avatarType: currentUser.avatarType,
    avatarData: currentUser.avatarData,
    phoneNumber: currentUser.phoneNumber,
  };
  await safeStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(payload));
}

/**
 * Restore a remembered session into currentUser.
 * Returns true when a valid session was restored.
 */
export async function loadRememberedUser(): Promise<boolean> {
  try {
    const raw = await safeStorage.getItem(REMEMBERED_USER_KEY);
    if (!raw) return false;
    const saved: RememberedUser = JSON.parse(raw);
    if (!saved || !saved.token || !saved.userId) return false;

    currentUser.token = saved.token;
    currentUser.userId = String(saved.userId);
    currentUser.userName = saved.userName || 'User';
    currentUser.email = saved.email || '';
    currentUser.avatarType = saved.avatarType || '';
    currentUser.avatarData = saved.avatarData || '';
    currentUser.phoneNumber = saved.phoneNumber || '';
    return true;
  } catch {
    return false;
  }
}

export async function clearRememberedUser(): Promise<void> {
  await safeStorage.removeItem(REMEMBERED_USER_KEY);
}
