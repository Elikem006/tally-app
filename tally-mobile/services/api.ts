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

  getUserExpensesByCategory: (userId: string, category: string) =>
    api.get(`/api/expenses/user/${userId}?category=${category}`),

  deleteExpense: (expenseId: string) =>
    api.delete(`/api/expenses/${expenseId}`),
};

export default api;
