import axios from "axios";

const BASE_URL = "http://172.20.10.3:8082";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const authAPI = {
  register: (name: string, email: string, password: string) =>
    api.post("/api/auth/register", { name, email, password }),

  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),

  updateAvatar: (userId: string, avatarType: string, avatarData: string) =>
    api.put(`/api/auth/user/${userId}/avatar`, { avatarType, avatarData }),

  getUserProfile: (userId: string) =>
    api.get(`/api/auth/user/${userId}`),

  updatePhone: (userId: string, phoneNumber: string) =>
    api.put(`/api/auth/user/${userId}/phone`, { phoneNumber }),
};

export const expenseAPI = {
  createExpense: (
    userId: string,
    amount: string,
    category: string,
    description: string,
    date: string,
    paymentMethod: string = "CASH",
  ) =>
    api.post("/api/expenses", { userId, amount, category, description, date, paymentMethod }),

  getUserExpenses: (userId: string) => api.get(`/api/expenses/user/${userId}`),

  deleteExpense: (expenseId: string) =>
    api.delete(`/api/expenses/${expenseId}`),

  getMonthlyReport: (userId: string, month?: number, year?: number) => {
    const params: Record<string, number> = {};
    if (month !== undefined) params.month = month;
    if (year !== undefined) params.year = year;
    return api.get(`/api/expenses/user/${userId}/report`, { params });
  },

  getCombinedHistory: (userId: string) =>
    api.get(`/api/expenses/user/${userId}/history`),
};

export const budgetAPI = {
  setBudget: (userId: string, category: string, monthlyLimit: string) =>
    api.post("/api/budgets", { userId, category, monthlyLimit }),

  getUserBudgets: (userId: string) => api.get(`/api/budgets/user/${userId}`),

  getBudgetSummary: (userId: string) =>
    api.get(`/api/budgets/user/${userId}/summary`),

  deleteBudget: (userId: string, category: string) =>
    api.delete(`/api/budgets/user/${userId}/${category}`),
};

export const reportAPI = {
  getMonthlyReport: (userId: string) =>
    api.get(`/api/expenses/user/${userId}/report`),

  getCombinedHistory: (userId: string) =>
    api.get(`/api/expenses/user/${userId}/history`),
};

export const groupAPI = {
  createGroup: (name: string, createdBy: string) =>
    api.post("/api/groups", { name, createdBy }),

  getUserGroups: (userId: string) => api.get(`/api/groups/user/${userId}`),

  getGroupDetails: (groupId: string) => api.get(`/api/groups/${groupId}`),

  addMember: (groupId: string, userId: string) =>
    api.post(`/api/groups/${groupId}/members`, { userId }),

  addSharedExpense: (
    groupId: string,
    paidBy: string,
    amount: string,
    description: string,
  ) =>
    api.post(`/api/groups/${groupId}/expenses`, {
      paidBy,
      amount,
      description,
    }),

  getBalances: (groupId: string) => api.get(`/api/groups/${groupId}/balances`),

  settleUp: (groupId: string, userId: string) =>
    api.post(`/api/groups/${groupId}/settle`, { userId }),

  deleteGroup: (groupId: string) => api.delete(`/api/groups/${groupId}`),
};

export const momoAPI = {
  requestPayment: (
    groupId: string,
    userId: string,
    phoneNumber: string,
    amount: string,
    description: string,
  ) =>
    api.post("/api/momo/pay", { groupId, userId, phoneNumber, amount, description }),

  checkStatus: (referenceId: string) =>
    api.get(`/api/momo/status/${referenceId}`),

  getBalance: () =>
    api.get("/api/momo/balance"),
};

export const paystackAPI = {
  initialize: (email: string, amount: string, description: string, userId: string) =>
    api.post("/api/paystack/initialize", { email, amount, description, userId }),

  verify: (reference: string, userId: string, amount: string, description: string, category: string) =>
    api.post("/api/paystack/verify", { reference, userId, amount, description, category }),
};

export const remindersAPI = {
  createReminder: (
    userId: string,
    title: string,
    amount: string,
    dueDate: string,
    isRecurring: boolean,
    recurrenceType: string,
  ) =>
    api.post("/api/reminders", {
      userId,
      title,
      amount,
      dueDate,
      isRecurring: String(isRecurring),
      recurrenceType,
    }),

  getUserReminders: (userId: string) =>
    api.get(`/api/reminders/user/${userId}`),

  getUpcomingReminders: (userId: string) =>
    api.get(`/api/reminders/user/${userId}/upcoming`),

  markAsPaid: (reminderId: string) =>
    api.put(`/api/reminders/${reminderId}/paid`, {}),

  deleteReminder: (reminderId: string) =>
    api.delete(`/api/reminders/${reminderId}`),
};

// ─── Response interceptor ────────────────────────────────────────────────────
// Handles 401 (session expired) and 5xx (server errors) globally.
// Uses lazy require() inside the callback to avoid circular dependencies with
// login.tsx (which imports authAPI from this file).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | undefined = error.response?.status;

    if (status === 401) {
      try {
        // Lazy require avoids circular dep at module load time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { currentUser } = require("../app/(auth)/login");
        currentUser.token = "";
        currentUser.userId = "1";
        currentUser.userName = "";
        currentUser.email = "";
        currentUser.avatarType = "";
        currentUser.avatarData = "";
        currentUser.phoneNumber = "";
      } catch {
        // currentUser module not loaded yet — nothing to clear
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { router } = require("expo-router");
        router.replace("/(auth)/login");
      } catch {
        // navigation not ready — the guarded (tabs) layout will redirect
      }
    }

    return Promise.reject(error);
  },
);

export default api;
