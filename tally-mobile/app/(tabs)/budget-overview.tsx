import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { budgetAPI, expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { notifyBudgetWarning } from "../../services/notifications";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

export default function BudgetOverviewScreen() {
  const [summary, setSummary] = useState<{ [key: string]: any }>({});
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchBudgetData() {
    try {
      const userId = getUserId();
      const [budgetResponse, reportResponse] = await Promise.all([
        budgetAPI.getBudgetSummary(userId),
        expenseAPI.getMonthlyReport(userId),
      ]);
      setSummary(budgetResponse.data);
      setReport(reportResponse.data);
      setError(null);
      return budgetResponse.data;
    } catch (err) {
      setError("Something went wrong. Pull down to refresh.");
      return null;
    }
  }

  useFocusEffect(
    useCallback(() => {
      let notificationsSent = false;

      async function load() {
        setLoading(true);
        const data = await fetchBudgetData();
        setLoading(false);

        if (!notificationsSent && data) {
          notificationsSent = true;
          for (const category in data) {
            if (data[category].isNearLimit || data[category].isOverBudget) {
              await notifyBudgetWarning(category, data[category].percentage);
            }
          }
        }
      }

      load();
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchBudgetData();
    } finally {
      setRefreshing(false);
    }
  }

  function getBarColor(percentage: number, isOverBudget: boolean) {
    if (isOverBudget) return "#E05C5C";
    if (percentage >= 80) return "#F7A84F";
    return "#00C896";
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (error && Object.keys(summary).length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  if (Object.keys(summary).length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#0F1117" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>No budgets set yet</Text>
        <Text style={styles.emptySubtext}>Set your monthly limits first</Text>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => router.push("/(tabs)/budget")}
        >
          <Text style={styles.setupButtonText}>Set Up Budgets</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fixed nav bar — always within reach */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Budget Overview</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
      >
      <Text style={styles.subtitle}>
        Your spending this month vs your limits
      </Text>

      {/* ── Budget Analysis ── */}
      {report && (() => {
        const currentTotal = parseFloat(report.currentMonth) || 0;
        const pctChange = parseFloat(report.percentageChange) || 0;
        const hasLastMonth = parseFloat(report.previousMonth) > 0;
        const isUp = pctChange > 0;
        const highCat = report.highestCategory;
        const perf: any[] = report.budgetPerformance || [];
        const goodCount = perf.filter((p: any) => p.status === "good").length;
        const hasOver = perf.some((p: any) => p.status === "over");
        const hasWarning = perf.some((p: any) => p.status === "warning");
        const healthColor = hasOver ? "#E05C5C" : hasWarning ? "#F7A84F" : "#00C896";

        return (
          <>
            {/* Monthly Summary */}
            <View style={styles.insightCard}>
              <Text style={styles.insightLabel}>Monthly Summary</Text>
              <Text style={styles.insightAmount}>GHS {currentTotal.toFixed(2)}</Text>
              {hasLastMonth ? (
                <View style={styles.changeRow}>
                  <Text style={[styles.changeArrow, { color: isUp ? "#E05C5C" : "#00C896" }]}>
                    {isUp ? "↑" : "↓"}
                  </Text>
                  <Text style={[styles.changeText, { color: isUp ? "#E05C5C" : "#00C896" }]}>
                    {Math.abs(pctChange).toFixed(1)}% {isUp ? "more" : "less"} than last month
                  </Text>
                </View>
              ) : (
                <Text style={styles.firstMonth}>First month of tracking</Text>
              )}
            </View>

            {/* Top Spending Category */}
            {highCat && highCat.category && (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>Top Spending Category</Text>
                <View style={styles.topCatRow}>
                  <Text style={styles.topCatEmoji}>
                    {CATEGORY_ICONS[highCat.category] || "📦"}
                  </Text>
                  <View>
                    <Text style={styles.topCatName}>{highCat.category}</Text>
                    <Text style={styles.topCatAmount}>
                      GHS {parseFloat(highCat.amount).toFixed(2)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.insightHint}>
                  You spent the most on {highCat.category} this month
                </Text>
              </View>
            )}

            {/* Budget Health */}
            {perf.length > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>Budget Health</Text>
                <Text style={[styles.healthScore, { color: healthColor }]}>
                  {goodCount}/{perf.length} categories on track
                </Text>
                <Text style={styles.insightHint}>
                  {hasOver
                    ? "You've exceeded your budget in some categories"
                    : hasWarning
                    ? "Some categories are getting close to their limit"
                    : "Great job — all budgets are under control!"}
                </Text>
              </View>
            )}

            <Text style={styles.sectionDivider}>Your Budgets</Text>
          </>
        );
      })()}

      {Object.entries(summary)
        // Guard: skip any non-object entry (e.g. a stray "success" boolean field)
        .filter(([, data]) => data !== null && typeof data === "object")
        .map(([category, data]: [string, any]) => {
        const percentage = Math.min(data.percentage, 100);
        const barColor = getBarColor(data.percentage, data.isOverBudget);

        return (
          <View key={category} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardLeft}>
                <Text style={styles.icon}>
                  {CATEGORY_ICONS[category] || "📦"}
                </Text>
                <Text style={styles.categoryName}>{category}</Text>
              </View>
              {data.isOverBudget && (
                <View style={styles.warningBadge}>
                  <Text style={styles.warningText}>Over!</Text>
                </View>
              )}
              {data.isNearLimit && !data.isOverBudget && (
                <View style={styles.nearBadge}>
                  <Text style={styles.nearText}>Near limit</Text>
                </View>
              )}
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${percentage}%` as any,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.percentage, { color: barColor }]}>
                {data.percentage.toFixed(0)}%
              </Text>
            </View>

            <View style={styles.amountRow}>
              <Text style={styles.spentText}>
                GHS {parseFloat(data.spent).toFixed(2)} spent
              </Text>
              <Text style={styles.limitText}>
                of GHS {parseFloat(data.limit).toFixed(2)}
              </Text>
            </View>

            <Text style={styles.remaining}>
              {data.isOverBudget
                ? `GHS ${(parseFloat(data.spent) - parseFloat(data.limit)).toFixed(2)} over budget`
                : `GHS ${(parseFloat(data.limit) - parseFloat(data.spent)).toFixed(2)} remaining`}
            </Text>
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.reportButton}
        onPress={() => router.push("/report")}
      >
        <Text style={styles.reportButtonText}>📈  View Monthly Report</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.push("/(tabs)/budget")}
      >
        <Text style={styles.editButtonText}>Edit Budgets</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backArrow: {
    color: "#00C896",
    fontSize: 22,
  },
  backLabel: {
    color: "#00C896",
    fontSize: 15,
    fontWeight: "600",
  },
  navTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  navSpacer: {
    width: 60, // mirrors back button width to keep title centred
  },
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
    marginBottom: 24,
    textAlign: "center",
  },
  setupButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    paddingHorizontal: 28,
  },
  setupButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 15,
  },
  content: {
    padding: 24,
    paddingTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    fontSize: 22,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  warningBadge: {
    backgroundColor: "#E05C5C20",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#E05C5C",
  },
  warningText: {
    color: "#E05C5C",
    fontSize: 12,
    fontWeight: "bold",
  },
  nearBadge: {
    backgroundColor: "#F7A84F20",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#F7A84F",
  },
  nearText: {
    color: "#F7A84F",
    fontSize: 12,
    fontWeight: "bold",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  progressBackground: {
    flex: 1,
    height: 10,
    backgroundColor: "#ffffff15",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 5,
  },
  percentage: {
    fontSize: 13,
    fontWeight: "bold",
    width: 40,
    textAlign: "right",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  spentText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "500",
  },
  limitText: {
    fontSize: 13,
    color: "#8890A0",
  },
  remaining: {
    fontSize: 12,
    color: "#8890A0",
    marginTop: 2,
  },
  reportButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  reportButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
  editButton: {
    borderWidth: 1,
    borderColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  editButtonText: {
    color: "#00C896",
    fontSize: 15,
    fontWeight: "600",
  },
  insightCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  insightLabel: {
    fontSize: 12,
    color: "#8890A0",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  insightAmount: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#00C896",
    marginBottom: 6,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  changeArrow: {
    fontSize: 15,
    fontWeight: "bold",
  },
  changeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  firstMonth: {
    fontSize: 13,
    color: "#8890A0",
  },
  topCatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  topCatEmoji: {
    fontSize: 30,
  },
  topCatName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  topCatAmount: {
    fontSize: 14,
    color: "#00C896",
    fontWeight: "600",
  },
  insightHint: {
    fontSize: 12,
    color: "#8890A0",
    marginTop: 4,
  },
  healthScore: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 6,
  },
  sectionDivider: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
});
