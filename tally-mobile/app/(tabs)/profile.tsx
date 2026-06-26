import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";
import { currentUser } from "../(auth)/login";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

export default function ProfileScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const userId = getUserId();
      const [reportRes, expensesRes] = await Promise.all([
        expenseAPI.getMonthlyReport(userId),
        expenseAPI.getUserExpenses(userId),
      ]);

      const expenses: any[] = expensesRes.data || [];
      const report = reportRes.data;

      const totalExpenses = expenses.length;
      const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

      // Most used category
      const categoryCounts: { [key: string]: number } = {};
      for (const e of expenses) {
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      }
      const mostUsedCategory = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

      setStats({
        totalExpenses,
        totalSpent,
        mostUsedCategory,
        thisMonthSpent: parseFloat(report.currentMonth) || 0,
        topCategory: report.highestCategory,
      });
    } catch (error) {
      console.log("Error fetching stats:", error);
    } finally {
      setLoadingStats(false);
    }
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          currentUser.token = "";
          currentUser.userId = "";
          currentUser.userName = "";
          currentUser.email = "";
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {currentUser.userName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.name}>{currentUser.userName}</Text>
      <Text style={styles.subtitle}>Tally Member</Text>

      {/* Info cards */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Name</Text>
        <Text style={styles.cardValue}>{currentUser.userName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>User ID</Text>
        <Text style={styles.cardValue}>#{currentUser.userId}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Email</Text>
        <Text style={styles.cardValue}>{currentUser.email}</Text>
      </View>

      {/* Stats section */}
      <Text style={styles.sectionTitle}>Your Stats</Text>

      {loadingStats ? (
        <ActivityIndicator size="small" color="#00C896" style={{ marginVertical: 16 }} />
      ) : stats ? (
        <>
          {/* 3-card stat row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalExpenses}</Text>
              <Text style={styles.statLabel}>Total Expenses</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit>
                GHS {stats.totalSpent.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit>
                GHS {stats.thisMonthSpent.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>This Month</Text>
            </View>
          </View>

          {/* Top category card */}
          {stats.topCategory?.category && (
            <View style={styles.topCategoryCard}>
              <Text style={{ fontSize: 32 }}>
                {CATEGORY_ICONS[stats.topCategory.category] || "📦"}
              </Text>
              <View>
                <Text style={styles.topCatName}>{stats.topCategory.category}</Text>
                <Text style={styles.topCatSub}>Your most spent category</Text>
              </View>
            </View>
          )}
        </>
      ) : null}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  container: {
    padding: 24,
    alignItems: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#00C896",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000000",
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 32,
  },
  card: {
    width: "100%",
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  cardLabel: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    alignSelf: "flex-start",
    marginTop: 24,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00C896",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "#8890A0",
    textAlign: "center",
  },
  topCategoryCard: {
    width: "100%",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#ffffff10",
    marginBottom: 10,
  },
  topCatName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  topCatSub: {
    fontSize: 12,
    color: "#8890A0",
  },
  logoutButton: {
    width: "100%",
    backgroundColor: "#E05C5C20",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#E05C5C",
  },
  logoutText: {
    color: "#E05C5C",
    fontSize: 16,
    fontWeight: "bold",
  },
});
