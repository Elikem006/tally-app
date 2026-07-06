import axios from "axios";

const BASE_URL = "http://172.20.10.3:8082"; // Using the latest BASE_URL from origin/main

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Set to true to use the local client-side mock backend, false to use the live Spring Boot server
const USE_MOCK = false;

// Mock database states
let mockUsers = [
  { id: 1, name: "Elikem", email: "elikem@test.com", password: "password123", avatarType: "", avatarData: "", phoneNumber: "" }
];

// Helper to get local date string offset by days ago (avoiding timezone shift)
const getRelativeDateStr = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

let mockExpenses = [
  { id: 1, userId: "1", amount: "-55.00", category: "Food", description: "Lunch at cafeteria", date: getRelativeDateStr(0), paymentMethod: "CASH" },
  { id: 2, userId: "1", amount: "-120.00", category: "Transport", description: "Weekly fuel", date: getRelativeDateStr(2), paymentMethod: "CASH" },
  { id: 3, userId: "1", amount: "-80.00", category: "Entertainment", description: "Movie ticket & popcorn", date: getRelativeDateStr(10), paymentMethod: "CASH" },
  { id: 4, userId: "1", amount: "-210.00", category: "Utilities", description: "Water and electricity", date: getRelativeDateStr(45), paymentMethod: "CASH" }
];

let mockBudgets = [
  { id: 1, userId: "1", category: "Food", monthlyLimit: "300.00" },
  { id: 2, userId: "1", category: "Transport", monthlyLimit: "200.00" },
  { id: 3, userId: "1", category: "Entertainment", monthlyLimit: "150.00" },
  { id: 4, userId: "1", category: "Utilities", monthlyLimit: "100.00" },
  { id: 5, userId: "1", category: "Other", monthlyLimit: "50.00" }
];

interface MockGroup {
  id: number;
  name: string;
  createdBy: string;
  members: { id: number; groupId: number; userId: string; name?: string; avatarType?: string; avatarData?: string }[];
  expenses: { id: number; description: string; amount: string; paidBy: string }[];
}

let mockGroups: MockGroup[] = [
  {
    id: 1,
    name: "KNUST Roommates",
    createdBy: "1",
    members: [
      { id: 1, groupId: 1, userId: "1", name: "Elikem", avatarType: "", avatarData: "" },
      { id: 2, groupId: 1, userId: "2", name: "Joseph", avatarType: "", avatarData: "" },
      { id: 3, groupId: 1, userId: "3", name: "Ishmael", avatarType: "", avatarData: "" }
    ],
    expenses: [
      { id: 1, description: "Electricity bill", amount: "150.00", paidBy: "1" },
      { id: 2, description: "Groceries", amount: "90.00", paidBy: "2" }
    ]
  }
];

let mockReminders = [
  { id: 1, userId: "1", title: "Rent payment", amount: "1200.00", dueDate: getRelativeDateStr(-5), isRecurring: "true", recurrenceType: "MONTHLY", paid: false },
  { id: 2, userId: "1", title: "Electricity Bill", amount: "150.00", dueDate: getRelativeDateStr(3), isRecurring: "false", recurrenceType: "", paid: false },
  { id: 3, userId: "1", title: "Water Bill", amount: "45.00", dueDate: getRelativeDateStr(10), isRecurring: "false", recurrenceType: "", paid: true }
];

let nextId = 100;

// Helper to simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const mockResponse = async <T>(data: T, status = 200): Promise<{ data: T; status: number }> => {
  await delay(500); // 500ms network latency
  return { data, status };
};

const mockError = async (message: string, status = 400) => {
  await delay(500);
  const error: any = new Error(message);
  error.response = {
    status,
    data: { error: message, message }
  };
  throw error;
};

export const authAPI = {
  register: async (name: string, email: string, password: string) => {
    if (!USE_MOCK) return api.post("/api/auth/register", { name, email, password });
    
    const existing = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return mockError("Email is already registered");
    }
    const newUser = { id: ++nextId, name, email, password, avatarType: "", avatarData: "", phoneNumber: "" };
    mockUsers.push(newUser);
    return mockResponse({ message: "Registration successful" });
  },

  login: async (email: string, password: string) => {
    if (!USE_MOCK) return api.post("/api/auth/login", { email, password });
    
    const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) {
      return mockError("Invalid email or password");
    }
    return mockResponse({
      token: "mock-jwt-token-12345",
      userId: String(user.id),
      name: user.name,
      email: user.email,
      avatarType: user.avatarType || "",
      avatarData: user.avatarData || "",
      phoneNumber: user.phoneNumber || ""
    });
  },

  updateAvatar: async (userId: string, avatarType: string, avatarData: string) => {
    if (!USE_MOCK) return api.put(`/api/auth/user/${userId}/avatar`, { avatarType, avatarData });
    const user = mockUsers.find(u => String(u.id) === String(userId));
    if (!user) return mockError("User not found", 404);
    user.avatarType = avatarType;
    user.avatarData = avatarData;
    return mockResponse(user);
  },

  getUserProfile: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/auth/user/${userId}`);
    const user = mockUsers.find(u => String(u.id) === String(userId));
    if (!user) return mockError("User not found", 404);
    return mockResponse(user);
  },

  updatePhone: async (userId: string, phoneNumber: string) => {
    if (!USE_MOCK) return api.put(`/api/auth/user/${userId}/phone`, { phoneNumber });
    const user = mockUsers.find(u => String(u.id) === String(userId));
    if (!user) return mockError("User not found", 404);
    user.phoneNumber = phoneNumber;
    return mockResponse(user);
  },
};

export const expenseAPI = {
  createExpense: async (
    userId: string,
    amount: string,
    category: string,
    description: string,
    date: string,
    paymentMethod: string = "CASH",
  ) => {
    if (!USE_MOCK) return api.post("/api/expenses", { userId, amount, category, description, date, paymentMethod });
    
    const newExpense = {
      id: ++nextId,
      userId,
      amount,
      category,
      description,
      date,
      paymentMethod
    };
    mockExpenses.unshift(newExpense);
    return mockResponse(newExpense);
  },

  getUserExpenses: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/expenses/user/${userId}`);
    
    const filtered = mockExpenses.filter(e => String(e.userId) === String(userId));
    return mockResponse(filtered);
  },

  deleteExpense: async (expenseId: string) => {
    if (!USE_MOCK) return api.delete(`/api/expenses/${expenseId}`);
    
    mockExpenses = mockExpenses.filter(e => String(e.id) !== String(expenseId));
    return mockResponse({ success: true });
  },

  getMonthlyReport: async (userId: string, month?: number, year?: number) => {
    if (!USE_MOCK) {
      const params: Record<string, number> = {};
      if (month !== undefined) params.month = month;
      if (year !== undefined) params.year = year;
      return api.get(`/api/expenses/user/${userId}/report`, { params });
    }
    
    const targetMonth = month !== undefined ? month : new Date().getMonth() + 1;
    const targetYear = year !== undefined ? year : new Date().getFullYear();
    
    const userExpenses = mockExpenses.filter(e => {
      if (String(e.userId) !== String(userId)) return false;
      const d = new Date(e.date);
      return d.getMonth() + 1 === targetMonth && d.getFullYear() === targetYear;
    });
    
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevExpenses = mockExpenses.filter(e => {
      if (String(e.userId) !== String(userId)) return false;
      const d = new Date(e.date);
      return d.getMonth() + 1 === prevMonth && d.getFullYear() === prevYear;
    });
    
    const currentTotal = userExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const previousTotal = prevExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const percentageChange = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
    
    const categoryBreakdown: { [key: string]: number } = {};
    userExpenses.forEach(e => {
      categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + parseFloat(e.amount);
    });
    
    let highestCategory = { category: "", amount: "0.00" };
    Object.entries(categoryBreakdown).forEach(([cat, amt]) => {
      if (amt > parseFloat(highestCategory.amount)) {
        highestCategory = { category: cat, amount: amt.toFixed(2) };
      }
    });
    
    const userBudgets = mockBudgets.filter(b => String(b.userId) === String(userId));
    const budgetPerformance = userBudgets.map(b => {
      const spent = categoryBreakdown[b.category] || 0;
      const limit = parseFloat(b.monthlyLimit);
      const percentage = limit > 0 ? (spent / limit) * 100 : 0;
      const isOverBudget = limit > 0 && spent > limit;
      const isNearLimit = limit > 0 && !isOverBudget && percentage >= 80;
      return {
        category: b.category,
        spent: spent.toFixed(2),
        limit: limit.toFixed(2),
        percentage,
        status: isOverBudget ? "over" : (isNearLimit ? "warning" : "good")
      };
    });
    
    return mockResponse({
      currentMonth: currentTotal.toFixed(2),
      previousMonth: previousTotal.toFixed(2),
      percentageChange,
      categoryBreakdown,
      highestCategory: highestCategory.category ? highestCategory : null,
      budgetPerformance
    });
  },

  exportExpenses: (userId: string, format: string) =>
    api.get(`/api/expenses/user/${userId}/export?format=${format}`, { responseType: "text" }),

  getRecurringExpenses: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/expenses/user/${userId}/recurring`);
    return mockResponse(mockExpenses.filter((e: any) => e.isRecurring));
  },

  updateRecurring: (expenseId: string, isRecurring: boolean, recurrenceType: string) =>
    api.put(`/api/expenses/${expenseId}/recurring`, {
      isRecurring: String(isRecurring),
      recurrenceType,
    }),

  getCombinedHistory: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/expenses/user/${userId}/history`);
    
    const personal = mockExpenses.filter(e => String(e.userId) === String(userId));
    const shared: any[] = [];
    mockGroups.forEach(g => {
      if (g.members.some(m => String(m.userId) === String(userId))) {
        g.expenses.forEach(e => {
          shared.push({
            id: `g-${e.id}`,
            userId,
            amount: e.amount,
            category: "Other",
            description: `[${g.name}] ${e.description}`,
            date: getRelativeDateStr(1),
            isShared: true,
            groupName: g.name
          });
        });
      }
    });
    
    const combined = [...personal, ...shared].sort((a, b) => b.date.localeCompare(a.date));
    return mockResponse(combined);
  },
};

export const budgetAPI = {
  setBudget: async (userId: string, category: string, monthlyLimit: string) => {
    if (!USE_MOCK) return api.post("/api/budgets", { userId, category, monthlyLimit });
    
    let budget = mockBudgets.find(b => String(b.userId) === String(userId) && b.category === category);
    if (budget) {
      budget.monthlyLimit = monthlyLimit;
    } else {
      budget = { id: ++nextId, userId, category, monthlyLimit };
      mockBudgets.push(budget);
    }
    return mockResponse(budget);
  },

  getUserBudgets: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/budgets/user/${userId}`);
    
    const filtered = mockBudgets.filter(b => String(b.userId) === String(userId));
    return mockResponse(filtered);
  },

  getBudgetSummary: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/budgets/user/${userId}/summary`);
    
    const userExpenses = mockExpenses.filter(e => String(e.userId) === String(userId));
    const userBudgets = mockBudgets.filter(b => String(b.userId) === String(userId));
    
    const summaryMap: { [key: string]: any } = {};
    const categories = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];
    
    categories.forEach(category => {
      const budget = userBudgets.find(b => b.category === category);
      const limit = budget ? parseFloat(budget.monthlyLimit) : 0;
      
      const spent = userExpenses
        .filter(e => e.category === category)
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
      const percentage = limit > 0 ? (spent / limit) * 100 : 0;
      const isOverBudget = limit > 0 && spent > limit;
      const isNearLimit = limit > 0 && !isOverBudget && percentage >= 80;
      
      if (limit > 0 || spent > 0) {
        summaryMap[category] = {
          spent: String(spent),
          limit: String(limit),
          percentage,
          isOverBudget,
          isNearLimit
        };
      }
    });
    
    return mockResponse(summaryMap);
  },

  deleteBudget: async (userId: string, category: string) => {
    if (!USE_MOCK) return api.delete(`/api/budgets/user/${userId}/${category}`);
    
    mockBudgets = mockBudgets.filter(b => !(String(b.userId) === String(userId) && b.category === category));
    return mockResponse({ success: true });
  },
};

export const reportAPI = {
  getMonthlyReport: async (userId: string, month?: number, year?: number) => {
    return expenseAPI.getMonthlyReport(userId, month, year);
  },
  getCombinedHistory: async (userId: string) => {
    return expenseAPI.getCombinedHistory(userId);
  }
};

export const groupAPI = {
  createGroup: async (name: string, createdBy: string) => {
    if (!USE_MOCK) return api.post("/api/groups", { name, createdBy });
    
    const newGroup: MockGroup = {
      id: ++nextId,
      name,
      createdBy,
      members: [{ id: ++nextId, groupId: nextId, userId: createdBy, name: "Me", avatarType: "", avatarData: "" }],
      expenses: []
    };
    mockGroups.push(newGroup);
    return mockResponse(newGroup);
  },

  getUserGroups: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/groups/user/${userId}`);
    
    const filtered = mockGroups.filter(g => g.members.some(m => String(m.userId) === String(userId)));
    return mockResponse(filtered);
  },

  getGroupDetails: async (groupId: string) => {
    if (!USE_MOCK) return api.get(`/api/groups/${groupId}`);
    
    const group = mockGroups.find(g => String(g.id) === String(groupId));
    if (!group) return mockError("Group not found", 404);
    return mockResponse(group);
  },

  addMember: async (groupId: string, userId: string) => {
    if (!USE_MOCK) return api.post(`/api/groups/${groupId}/members`, { userId });
    
    const group = mockGroups.find(g => String(g.id) === String(groupId));
    if (!group) return mockError("Group not found", 404);
    
    const alreadyMember = group.members.some(m => String(m.userId) === String(userId));
    if (alreadyMember) return mockError("User is already a member", 400);
    
    group.members.push({ id: ++nextId, groupId: group.id, userId, name: `User ${userId}`, avatarType: "", avatarData: "" });
    return mockResponse({ success: true });
  },

  addSharedExpense: async (
    groupId: string,
    paidBy: string,
    amount: string,
    description: string,
    splitType?: string,
    splitRatios?: string,
  ) => {
    if (!USE_MOCK) {
      return api.post(`/api/groups/${groupId}/expenses`, {
        paidBy,
        amount,
        description,
        splitType: splitType || "EQUAL",
        splitRatios,
      });
    }
    
    const group = mockGroups.find(g => String(g.id) === String(groupId));
    if (!group) return mockError("Group not found", 404);
    
    const newExpense = {
      id: ++nextId,
      description,
      amount,
      paidBy
    };
    group.expenses.push(newExpense);
    return mockResponse(newExpense);
  },

  getBalances: async (groupId: string) => {
    if (!USE_MOCK) return api.get(`/api/groups/${groupId}/balances`);
    
    const group = mockGroups.find(g => String(g.id) === String(groupId));
    if (!group) return mockError("Group not found", 404);
    
    const n = group.members.length;
    const balancesMap: { [userId: string]: number } = {};
    
    group.members.forEach(m => {
      balancesMap[m.userId] = 0;
    });
    
    group.expenses.forEach(e => {
      const amount = parseFloat(e.amount);
      const share = amount / n;
      const payer = String(e.paidBy);
      
      if (balancesMap[payer] === undefined) {
        balancesMap[payer] = 0;
      }
      
      balancesMap[payer] += amount;
      
      group.members.forEach(m => {
        balancesMap[m.userId] -= share;
      });
    });
    
    const balances = Object.entries(balancesMap).map(([userId, balance]) => {
      const owes = balance < 0;
      return {
        userId,
        balance: String(balance),
        owes
      };
    });
    
    return mockResponse(balances);
  },

  settleUp: async (groupId: string, userId: string) => {
    if (!USE_MOCK) return api.post(`/api/groups/${groupId}/settle`, { userId });
    
    const group = mockGroups.find(g => String(g.id) === String(groupId));
    if (!group) return mockError("Group not found", 404);
    
    group.expenses = [];
    return mockResponse({ success: true });
  },

  deleteGroup: async (groupId: string) => {
    if (!USE_MOCK) return api.delete(`/api/groups/${groupId}`);
    
    mockGroups = mockGroups.filter(g => String(g.id) !== String(groupId));
    return mockResponse({ success: true });
  },
};

export const momoAPI = {
  requestPayment: async (
    groupId: string,
    userId: string,
    phoneNumber: string,
    amount: string,
    description: string,
  ) => {
    if (!USE_MOCK) return api.post("/api/momo/pay", { groupId, userId, phoneNumber, amount, description });
    
    // Simulate successful sandbox payment request
    return mockResponse({
      status: "PENDING",
      referenceId: `momo-ref-${++nextId}`,
      message: "Payment request submitted successfully"
    });
  },

  checkStatus: async (referenceId: string) => {
    if (!USE_MOCK) return api.get(`/api/momo/status/${referenceId}`);
    
    return mockResponse({
      status: "SUCCESSFUL",
      financialTransactionId: `tx-${++nextId}`,
      message: "Transaction completed successfully"
    });
  },

  getBalance: async () => {
    if (!USE_MOCK) return api.get("/api/momo/balance");

    return mockResponse({
      availableBalance: "1500.00",
      currency: "GHS"
    });
  },

  transfer: (
    recipientPhone: string,
    amount: string,
    description: string,
    userId: string,
    category: string,
  ) =>
    api.post("/api/momo/transfer", {
      recipientPhone,
      amount,
      description,
      userId,
      category,
    }),

  checkTransferStatus: (referenceId: string) =>
    api.get(`/api/momo/transfer/status/${referenceId}`),
};

export const remindersAPI = {
  createReminder: async (
    userId: string,
    title: string,
    amount: string,
    dueDate: string,
    isRecurring: boolean,
    recurrenceType: string,
  ) => {
    if (!USE_MOCK) {
      return api.post("/api/reminders", {
        userId,
        title,
        amount,
        dueDate,
        isRecurring: String(isRecurring),
        recurrenceType,
      });
    }
    const newReminder = {
      id: ++nextId,
      userId,
      title,
      amount,
      dueDate,
      isRecurring: String(isRecurring),
      recurrenceType,
      paid: false,
    };
    mockReminders.push(newReminder);
    return mockResponse(newReminder);
  },

  getUserReminders: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/reminders/user/${userId}`);
    const filtered = mockReminders.filter(r => String(r.userId) === String(userId));
    return mockResponse(filtered);
  },

  getUpcomingReminders: async (userId: string) => {
    if (!USE_MOCK) return api.get(`/api/reminders/user/${userId}/upcoming`);
    const filtered = mockReminders.filter(r => String(r.userId) === String(userId) && !r.paid);
    return mockResponse(filtered);
  },

  markAsPaid: async (reminderId: string) => {
    if (!USE_MOCK) return api.put(`/api/reminders/${reminderId}/paid`, {});
    const r = mockReminders.find(rem => String(rem.id) === String(reminderId));
    if (r) {
      r.paid = true;
    }
    return mockResponse({ success: true });
  },

  deleteReminder: async (reminderId: string) => {
    if (!USE_MOCK) return api.delete(`/api/reminders/${reminderId}`);
    mockReminders = mockReminders.filter(rem => String(rem.id) !== String(reminderId));
    return mockResponse({ success: true });
  },
};

export const categoriesAPI = {
  getUserCategories: (userId: string) =>
    api.get(`/api/categories/user/${userId}`),
  createCategory: (userId: string, name: string, emoji: string) =>
    api.post("/api/categories", { userId, name, emoji }),
  deleteCategory: (id: string, userId: string) =>
    api.delete(`/api/categories/${id}/user/${userId}`),
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
        const { resetCurrentUser, clearRememberedUser } = require("./storage");
        resetCurrentUser();
        // Expired session — forget the remembered login so we don't auto-restore it
        clearRememberedUser();
      } catch {
        // storage module not loaded yet — nothing to clear
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
