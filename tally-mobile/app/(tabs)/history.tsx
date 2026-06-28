import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  RefreshControl,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

function getMonthFilters() {
  const filters: { label: string; value: string }[] = [{ label: "All", value: "all" }];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short", year: "numeric" });
    filters.push({ label, value });
  }
  return filters;
}

const CATEGORY_COLORS: { [key: string]: string } = {
  Food: "#00C896",
  Transport: "#4F8EF7",
  Entertainment: "#F7A84F",
  Utilities: "#E05C5C",
  Other: "#8890A0",
  Shared: "#A78BFA",
};

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
  Shared: "👥",
};

const MONTH_FILTERS = getMonthFilters();

function parseTagsFromDescription(description: string | null | undefined): {
  cleanDescription: string;
  tags: string[];
} {
  if (!description) return { cleanDescription: "", tags: [] };
  const words = description.split(" ");
  const tags = words.filter((w) => w.startsWith("#"));
  const cleanDescription = words.filter((w) => !w.startsWith("#")).join(" ").trim();
  return { cleanDescription, tags };
}

export default function HistoryScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
    }, []),
  );

  async function fetchExpenses() {
    try {
      const userId = getUserId();
      const response = await expenseAPI.getCombinedHistory(userId);
      const sorted = [...response.data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setExpenses(sorted);
      setError(null);
    } catch (err) {
      setError("Something went wrong. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchExpenses();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLongPress(item: any) {
    if (item.type === "shared") {
      Alert.alert("Shared Expense", "Shared expenses can only be deleted from the group screen.");
      return;
    }
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await expenseAPI.deleteExpense(String(item.id));
              setExpenses(expenses.filter((e) => e.id !== item.id));
            } catch (error) {
              Alert.alert("Error", "Failed to delete expense");
            }
          },
        },
      ],
    );
  }

  const monthFilteredExpenses = useMemo(() => {
    if (activeFilter === "all") return expenses;
    return expenses.filter((e) => e.date && e.date.startsWith(activeFilter));
  }, [expenses, activeFilter]);

  const filteredExpenses = useMemo(() => {
    if (searchQuery === "") return monthFilteredExpenses;
    const q = searchQuery.toLowerCase();
    return monthFilteredExpenses.filter(
      (e) =>
        (e.description && e.description.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q),
    );
  }, [monthFilteredExpenses, searchQuery]);

  const totalSpent = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (error && expenses.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  if (expenses.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>No expenses yet</Text>
        <Text style={styles.emptySubtext}>
          Start recording your spending to see your history here
        </Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push("/(tabs)/add")}
        >
          <Text style={styles.emptyButtonText}>Add Your First Expense</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {MONTH_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterBtn, activeFilter === f.value && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.value)}
          >
            <Text style={[styles.filterText, activeFilter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search expenses..."
          placeholderTextColor="#8890A0"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== "" && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>GHS {totalSpent.toFixed(2)}</Text>
      </View>

      {filteredExpenses.length === 0 && searchQuery !== "" && (
        <View style={styles.filteredEmpty}>
          <Text style={[styles.emptySubtext, { textAlign: "center" }]}>
            No expenses match your search
          </Text>
        </View>
      )}

      {filteredExpenses.length === 0 && searchQuery === "" && monthFilteredExpenses.length === 0 && (
        <View style={styles.filteredEmpty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>No expenses this month</Text>
          <Text style={styles.emptySubtext}>
            Try selecting a different month or add a new expense
          </Text>
        </View>
      )}

      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
        renderItem={({ item }) => {
          const isShared = item.type === "shared";
          const color = CATEGORY_COLORS[item.category] || "#8890A0";
          const { cleanDescription, tags } = parseTagsFromDescription(item.description);
          const isMomo = item.paymentMethod === "MOMO";
          return (
            <TouchableOpacity
              style={[styles.expenseCard, isShared && styles.sharedCard]}
              onLongPress={() => handleLongPress(item)}
            >
              <View style={styles.expenseLeft}>
                <View style={[styles.iconBox, { backgroundColor: color + "20" }]}>
                  <Text style={styles.icon}>
                    {CATEGORY_ICONS[item.category] || "📦"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDescription}>
                    {cleanDescription || item.category}
                  </Text>
                  <Text style={styles.expenseCategory}>
                    {item.category} • {item.date}
                  </Text>
                  <View style={styles.badgeRow}>
                    {isShared && (
                      <View style={[styles.badge, { backgroundColor: "#00C89620", borderColor: "#00C896" }]}>
                        <Text style={[styles.badgeText, { color: "#00C896" }]}>👥 Shared</Text>
                      </View>
                    )}
                    <View style={[styles.badge, {
                      backgroundColor: isMomo ? "#FFC10720" : "#ffffff10",
                      borderColor: isMomo ? "#FFC107" : "#ffffff30",
                    }]}>
                      <Text style={[styles.badgeText, { color: isMomo ? "#FFC107" : "#8890A0" }]}>
                        {isMomo ? "📱 MoMo" : "💵 Cash"}
                      </Text>
                    </View>
                  </View>
                  {tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {tags.map((tag) => (
                        <View key={tag} style={styles.tagPill}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <Text style={[styles.expenseAmount, { color }]}>
                GHS {parseFloat(item.amount).toFixed(2)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <Text style={styles.hint}>Long press an expense to delete it</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  emptyButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
  filteredEmpty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  totalCard: {
    margin: 16,
    padding: 20,
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00C89630",
  },
  totalLabel: {
    fontSize: 13,
    color: "#8890A0",
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00C896",
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
    flexDirection: "row",
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1A1F2E",
    borderWidth: 1,
    borderColor: "#ffffff15",
    minWidth: 64,
    alignItems: "center",
  },
  filterBtnActive: {
    backgroundColor: "#00C89620",
    borderColor: "#00C896",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8890A0",
  },
  filterTextActive: {
    color: "#00C896",
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  expenseCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  expenseLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 20,
  },
  sharedCard: {
    borderColor: "#A78BFA30",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  expenseCategory: {
    fontSize: 12,
    color: "#8890A0",
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: "bold",
  },
  hint: {
    textAlign: "center",
    fontSize: 11,
    color: "#ffffff20",
    paddingBottom: 16,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00C89620",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#00C896",
  },
  tagText: {
    fontSize: 11,
    color: "#00C896",
    fontWeight: "500",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingVertical: 12,
  },
  clearBtn: {
    fontSize: 16,
    color: "#8890A0",
    padding: 4,
  },
});
