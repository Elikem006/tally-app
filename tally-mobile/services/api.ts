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
};

export const expenseAPI = {
  createExpense: (
    userId: string,
    amount: string,
    category: string,
    description: string,
    date: string,
  ) =>
    api.post("/api/expenses", { userId, amount, category, description, date }),

  getUserExpenses: (userId: string) => api.get(`/api/expenses/user/${userId}`),

  deleteExpense: (expenseId: string) =>
    api.delete(`/api/expenses/${expenseId}`),
};

export const budgetAPI = {
  setBudget: (userId: string, category: string, monthlyLimit: string) =>
    api.post("/api/budgets", { userId, category, monthlyLimit }),

  getUserBudgets: (userId: string) => api.get(`/api/budgets/user/${userId}`),

  getBudgetSummary: (userId: string) =>
    api.get(`/api/budgets/user/${userId}/summary`),
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

export default api;
