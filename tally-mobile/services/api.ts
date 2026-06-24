import axios from "axios";

const BASE_URL = "http://172.20.10.2:8082";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Set to true to use the local client-side mock backend, false to use the live Spring Boot server
const USE_MOCK = true;

// Mock database states
let mockUsers = [
  { id: 1, name: "Elikem", email: "elikem@test.com", password: "password123" }
];

let mockExpenses = [
  { id: 1, userId: "1", amount: "55.00", category: "Food", description: "Lunch at cafeteria", date: new Date().toISOString().split("T")[0] },
  { id: 2, userId: "1", amount: "120.00", category: "Transport", description: "Weekly fuel", date: new Date().toISOString().split("T")[0] },
  { id: 3, userId: "1", amount: "80.00", category: "Entertainment", description: "Movie ticket & popcorn", date: new Date().toISOString().split("T")[0] }
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
  members: { id: number; groupId: number; userId: string }[];
  expenses: { id: number; description: string; amount: string; paidBy: string }[];
}

let mockGroups: MockGroup[] = [
  {
    id: 1,
    name: "KNUST Roommates",
    createdBy: "1",
    members: [
      { id: 1, groupId: 1, userId: "1" },
      { id: 2, groupId: 1, userId: "2" },
      { id: 3, groupId: 1, userId: "3" }
    ],
    expenses: [
      { id: 1, description: "Electricity bill", amount: "150.00", paidBy: "1" },
      { id: 2, description: "Groceries", amount: "90.00", paidBy: "2" }
    ]
  }
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
    const newUser = { id: ++nextId, name, email, password };
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
      name: user.name
    });
  },
};

export const expenseAPI = {
  createExpense: async (
    userId: string,
    amount: string,
    category: string,
    description: string,
    date: string,
  ) => {
    if (!USE_MOCK) return api.post("/api/expenses", { userId, amount, category, description, date });
    
    const newExpense = {
      id: ++nextId,
      userId,
      amount,
      category,
      description,
      date
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
};

export const groupAPI = {
  createGroup: async (name: string, createdBy: string) => {
    if (!USE_MOCK) return api.post("/api/groups", { name, createdBy });
    
    const newGroup: MockGroup = {
      id: ++nextId,
      name,
      createdBy,
      members: [{ id: ++nextId, groupId: nextId, userId: createdBy }],
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
    
    group.members.push({ id: ++nextId, groupId: group.id, userId });
    return mockResponse({ success: true });
  },

  addSharedExpense: async (
    groupId: string,
    paidBy: string,
    amount: string,
    description: string,
  ) => {
    if (!USE_MOCK) {
      return api.post(`/api/groups/${groupId}/expenses`, {
        paidBy,
        amount,
        description,
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
};

export default api;
