import axios from "axios";

const BASE_URL = "http://172.20.10.2:8082";

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

export default api;
