import AsyncStorage from '@react-native-async-storage/async-storage';

// Global store for user session (moved from login.tsx to avoid circular dependencies)
export let currentUser = {
  token: '',
  userId: '1',
  userName: 'User',
  email: '',
  avatarType: '',
  avatarData: '',
  phoneNumber: '',
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
