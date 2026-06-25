import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function ReportScreen() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    try {
      const userId = getUserId();
      const response = await expenseAPI.getMonthlyReport(userId);
      setReport(response.data);
    } catch (error) {
      console.log("Error fetching report:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No report data available</Text>
      </View>
    );
  }

  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];
  const year = now.getFullYear();

  const currentTotal = parseFloat(report.currentMonth) || 0;
  const pctChange = parseFloat(report.percentageChange) || 0;
  const isUp = pctChange > 0;
  const hasLastMonth = parseFloat(report.previousMonth) > 0;

  const highestCategory = report.highestCategory;
  const categoryBreakdown: { [key: string]: number } = report.categoryBreakdown || {};
  const budgetPerformance: any[] = report.budgetPerformance || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>Financial Report</Text>
      <Text style={styles.subtitle}>{monthName} {year}</Text>

      {/* Summary card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>This Month</Text>
        <Text style={styles.bigAmount}>GHS {currentTotal.toFixed(2)}</Text>

        {hasLastMonth ? (
          <View style={styles.changeRow}>
            <Text style={[styles.changeArrow, { color: isUp ? "#E05C5C" : "#00C896" }]}>
              {isUp ? "▲" : "▼"}
            </Text>
            <Text style={[styles.changeText, { color: isUp ? "#E05C5C" : "#00C896" }]}>
              {Math.abs(pctChange).toFixed(1)}% vs last month
            </Text>
          </View>
        ) : (
          <Text style={styles.noLastMonth}>No data from last month</Text>
        )}
      </View>

      {/* Top category */}
      {highestCategory && highestCategory.category && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top Category</Text>
          <View style={styles.topCatRow}>
            <Text style={styles.catEmoji}>
              {CATEGORY_ICONS[highestCategory.category] || "📦"}
            </Text>
            <View>
              <Text style={styles.catName}>{highestCategory.category}</Text>
              <Text style={styles.catAmount}>
                GHS {parseFloat(highestCategory.amount).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Budget performance */}
      {budgetPerformance.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Budget Performance</Text>
          {budgetPerformance.map((item: any) => {
            const pct = Math.min(parseFloat(item.percentage) || 0, 100);
            const barColor =
              item.status === "over" ? "#E05C5C"
              : item.status === "warning" ? "#F7A84F"
              : "#00C896";

            return (
              <View key={item.category} style={styles.perfRow}>
                <View style={styles.perfTop}>
                  <Text style={styles.perfCategory}>{item.category}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: barColor + "20", borderColor: barColor }]}>
                    <Text style={[styles.statusText, { color: barColor }]}>
                      {item.status === "over" ? "Over Budget"
                        : item.status === "warning" ? "Near Limit"
                        : "Good"}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                </View>

                <Text style={styles.perfAmounts}>
                  GHS {parseFloat(item.spent).toFixed(2)} of GHS {parseFloat(item.limit).toFixed(2)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Category breakdown */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Spending Breakdown</Text>
          {Object.entries(categoryBreakdown).map(([cat, amt]: [string, any]) => (
            <View key={cat} style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={styles.breakdownEmoji}>{CATEGORY_ICONS[cat] || "📦"}</Text>
                <Text style={styles.breakdownCat}>{cat}</Text>
              </View>
              <Text style={styles.breakdownAmt}>
                GHS {parseFloat(amt).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#8890A0",
    fontSize: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  cardLabel: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bigAmount: {
    fontSize: 34,
    fontWeight: "bold",
    color: "#00C896",
    marginBottom: 8,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changeArrow: {
    fontSize: 14,
    fontWeight: "bold",
  },
  changeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  noLastMonth: {
    fontSize: 13,
    color: "#8890A0",
  },
  sectionTitle: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  topCatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  catEmoji: {
    fontSize: 32,
  },
  catName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  catAmount: {
    fontSize: 15,
    color: "#00C896",
    fontWeight: "600",
  },
  perfRow: {
    marginBottom: 14,
  },
  perfTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  perfCategory: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressBg: {
    height: 8,
    backgroundColor: "#ffffff15",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  perfAmounts: {
    fontSize: 12,
    color: "#8890A0",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff08",
  },
  breakdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  breakdownEmoji: {
    fontSize: 20,
  },
  breakdownCat: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
  },
  breakdownAmt: {
    fontSize: 14,
    color: "#00C896",
    fontWeight: "600",
  },
});
