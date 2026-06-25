import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { LineChart } from "react-native-chart-kit";
import { reportAPI, expenseAPI } from "../services/api";
import { getUserId } from "../services/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;

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

function buildDailyData(expenses: any[], year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().getDate();
  const dayCount = Math.min(daysInMonth, today);

  // Sum per day (1-indexed)
  const dailyTotals: number[] = Array(dayCount).fill(0);
  for (const e of expenses) {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      const day = d.getDate();
      if (day >= 1 && day <= dayCount) {
        dailyTotals[day - 1] += parseFloat(e.amount) || 0;
      }
    }
  }

  // Build labels: show day number only every ~5 days to avoid crowding
  const labels: string[] = dailyTotals.map((_, i) => {
    const day = i + 1;
    if (day === 1 || day % 5 === 0 || day === dayCount) return String(day);
    return "";
  });

  return { dailyTotals, labels, dayCount };
}

export default function ReportScreen() {
  const [report, setReport] = useState<any>(null);
  const [dailyTotals, setDailyTotals] = useState<number[]>([]);
  const [chartLabels, setChartLabels] = useState<string[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<{ day: number; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const prevMonthName = MONTH_NAMES[(now.getMonth() + 11) % 12];

  useEffect(() => {
    async function fetchAll() {
      try {
        const userId = getUserId();
        const [reportRes, expensesRes] = await Promise.all([
          reportAPI.getMonthlyReport(userId),
          expenseAPI.getUserExpenses(userId),
        ]);
        setReport(reportRes.data);

        const { dailyTotals: dt, labels } = buildDailyData(
          expensesRes.data,
          currentYear,
          currentMonth,
        );
        // Chart needs at least 2 data points
        setDailyTotals(dt.length >= 2 ? dt : [0, 0]);
        setChartLabels(labels.length >= 2 ? labels : ["1", String(now.getDate())]);
      } catch (e: any) {
        setError("Failed to load report.");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (error || !report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || "No data available."}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentTotal = parseFloat(report.currentMonth) || 0;
  const previousTotal = parseFloat(report.previousMonth) || 0;
  const pctChange = report.percentageChange || 0;
  const isUp = pctChange > 0;

  const categoryBreakdown: { [key: string]: number } = {};
  for (const [cat, val] of Object.entries(report.categoryBreakdown || {})) {
    categoryBreakdown[cat] = parseFloat(val as string) || 0;
  }
  const maxCategoryAmount = Math.max(...Object.values(categoryBreakdown), 1);
  const budgetPerformance: any[] = report.budgetPerformance || [];

  function statusColor(status: string) {
    if (status === "over") return "#E05C5C";
    if (status === "warning") return "#F7A84F";
    return "#00C896";
  }

  const hasSpending = dailyTotals.some((v) => v > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backLabel}>Budget Overview</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Monthly Report</Text>
      <Text style={styles.subtitle}>{currentMonthName} {currentYear}</Text>

      {/* ── Spending chart ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Spending</Text>
        <Text style={styles.bigAmount}>GHS {currentTotal.toFixed(2)}</Text>
        <Text style={styles.spentLabel}>spent this month</Text>

        {selectedPoint && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipAmount}>GHS {selectedPoint.amount.toFixed(2)}</Text>
            <Text style={styles.tooltipDate}>
              {currentMonthName.slice(0, 3)} {selectedPoint.day}, {currentYear}
            </Text>
          </View>
        )}

        {hasSpending ? (
          <LineChart
            data={{ labels: chartLabels, datasets: [{ data: dailyTotals }] }}
            width={SCREEN_WIDTH - 56}
            height={180}
            onDataPointClick={({ index, value }) =>
              setSelectedPoint({ day: index + 1, amount: value })
            }
            chartConfig={{
              backgroundColor: "#1A1F2E",
              backgroundGradientFrom: "#1A1F2E",
              backgroundGradientTo: "#1A1F2E",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 200, 150, ${opacity})`,
              labelColor: () => "#8890A0",
              propsForDots: {
                r: "4",
                strokeWidth: "2",
                stroke: "#00C896",
              },
              propsForBackgroundLines: {
                stroke: "#ffffff10",
              },
            }}
            bezier
            style={styles.chart}
            withInnerLines
            withOuterLines={false}
            withShadow={false}
          />
        ) : (
          <View style={styles.noChartData}>
            <Text style={styles.noChartText}>No spending recorded yet this month</Text>
          </View>
        )}

        {/* Month comparison row */}
        <View style={styles.comparisonRow}>
          <View style={styles.comparisonCol}>
            <Text style={styles.compLabel}>{currentMonthName}</Text>
            <Text style={styles.compValue}>GHS {currentTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.comparisonCol}>
            <Text style={styles.compLabel}>{prevMonthName}</Text>
            <Text style={styles.compValue}>GHS {previousTotal.toFixed(2)}</Text>
          </View>
        </View>

        {previousTotal > 0 ? (
          <View style={[styles.changeBadge, { backgroundColor: isUp ? "#E05C5C20" : "#00C89620" }]}>
            <Text style={[styles.changeText, { color: isUp ? "#E05C5C" : "#00C896" }]}>
              {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs last month
            </Text>
          </View>
        ) : (
          <View style={[styles.changeBadge, { backgroundColor: "#ffffff10" }]}>
            <Text style={[styles.changeText, { color: "#8890A0" }]}>No data for {prevMonthName}</Text>
          </View>
        )}
      </View>

      {/* ── Highest category ── */}
      {report.highestCategory?.category && (
        <View style={[styles.card, styles.highlightCard]}>
          <Text style={styles.cardTitle}>Top Spending Category</Text>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightEmoji}>
              {CATEGORY_ICONS[report.highestCategory.category] || "📦"}
            </Text>
            <View>
              <Text style={styles.highlightCategory}>{report.highestCategory.category}</Text>
              <Text style={styles.highlightAmount}>
                GHS {parseFloat(report.highestCategory.amount).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Category breakdown ── */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Category Breakdown</Text>
          {Object.entries(categoryBreakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, amount]) => {
              const barWidth = (amount / maxCategoryAmount) * 100;
              return (
                <View key={cat} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownEmoji}>{CATEGORY_ICONS[cat] || "📦"}</Text>
                    <Text style={styles.breakdownCat}>{cat}</Text>
                  </View>
                  <View style={styles.breakdownRight}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${barWidth}%` as any }]} />
                    </View>
                    <Text style={styles.breakdownAmount}>GHS {amount.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })}
        </View>
      )}

      {/* ── Budget performance ── */}
      {budgetPerformance.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Budget Performance</Text>
          {budgetPerformance.map((item: any) => {
            const pct = Math.min(item.percentage, 100);
            const color = statusColor(item.status);
            return (
              <View key={item.category} style={styles.perfRow}>
                <View style={styles.perfHeader}>
                  <View style={styles.perfLeft}>
                    <Text style={styles.perfEmoji}>{CATEGORY_ICONS[item.category] || "📦"}</Text>
                    <Text style={styles.perfCat}>{item.category}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: color + "20", borderColor: color }]}>
                    <Text style={[styles.statusText, { color }]}>
                      {item.status === "over" ? "Over!" : item.status === "warning" ? "Near limit" : "Good"}
                    </Text>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                </View>
                <View style={styles.perfAmounts}>
                  <Text style={styles.perfSpent}>GHS {parseFloat(item.spent).toFixed(2)} spent</Text>
                  <Text style={styles.perfLimit}>of GHS {parseFloat(item.limit).toFixed(2)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },
  content: { padding: 20 },
  centered: {
    flex: 1,
    backgroundColor: "#0F1117",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { color: "#E05C5C", fontSize: 15, marginBottom: 16 },
  backBtn: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backBtnText: { color: "#000", fontWeight: "bold", fontSize: 15 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  backArrow: { color: "#00C896", fontSize: 20 },
  backLabel: { color: "#00C896", fontSize: 15 },
  title: { fontSize: 26, fontWeight: "bold", color: "#ffffff", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#8890A0", marginBottom: 20 },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  highlightCard: { borderColor: "#00C89630" },
  cardTitle: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bigAmount: { fontSize: 34, fontWeight: "bold", color: "#ffffff", marginBottom: 2 },
  spentLabel: { fontSize: 13, color: "#8890A0", marginBottom: 12 },
  tooltip: {
    backgroundColor: "#0F1117",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#00C89640",
  },
  tooltipAmount: { fontSize: 15, fontWeight: "bold", color: "#00C896" },
  tooltipDate: { fontSize: 12, color: "#8890A0", marginTop: 2 },
  chart: { marginLeft: -10, borderRadius: 12, marginBottom: 16 },
  noChartData: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  noChartText: { color: "#8890A0", fontSize: 14 },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#ffffff10",
    paddingTop: 14,
  },
  comparisonCol: { flex: 1, alignItems: "center" },
  divider: { width: 1, height: 36, backgroundColor: "#ffffff15" },
  compLabel: { fontSize: 12, color: "#8890A0", marginBottom: 4 },
  compValue: { fontSize: 16, fontWeight: "600", color: "#ffffff" },
  changeBadge: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center" },
  changeText: { fontSize: 14, fontWeight: "600" },
  highlightRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  highlightEmoji: { fontSize: 40 },
  highlightCategory: { fontSize: 20, fontWeight: "bold", color: "#ffffff", marginBottom: 4 },
  highlightAmount: { fontSize: 16, color: "#00C896", fontWeight: "600" },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  breakdownLeft: { flexDirection: "row", alignItems: "center", gap: 8, width: 110 },
  breakdownEmoji: { fontSize: 18 },
  breakdownCat: { fontSize: 14, color: "#ffffff", fontWeight: "500" },
  breakdownRight: { flex: 1, marginLeft: 10, gap: 4 },
  barTrack: {
    height: 8,
    backgroundColor: "#ffffff15",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill: { height: "100%", backgroundColor: "#00C896", borderRadius: 4 },
  breakdownAmount: { fontSize: 12, color: "#8890A0", textAlign: "right" },
  perfRow: { marginBottom: 16 },
  perfHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  perfLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  perfEmoji: { fontSize: 20 },
  perfCat: { fontSize: 15, fontWeight: "600", color: "#ffffff" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: "bold" },
  perfAmounts: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  perfSpent: { fontSize: 13, color: "#ffffff", fontWeight: "500" },
  perfLimit: { fontSize: 13, color: "#8890A0" },
});
