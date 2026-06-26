import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { expenseAPI } from "../../services/api";
import { getUserId } from "../../services/storage";

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
const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Data aggregation ────────────────────────────────────────────────────────

function processChartData(
  expenses: any[],
  view: "day" | "week" | "month" | "year",
): { labels: string[]; values: number[] } {
  const now = new Date();

  if (view === "day") {
    // Last 7 days
    const buckets: number[] = Array(7).fill(0);
    const labels: string[]  = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(DAY_NAMES[d.getDay()]);
      const key = d.toISOString().split("T")[0];
      for (const e of expenses) {
        if (e.date === key) buckets[6 - i] += parseFloat(e.amount) || 0;
      }
    }
    return { labels, values: buckets };
  }

  if (view === "week") {
    // Last 8 ISO weeks
    const buckets: number[] = Array(8).fill(0);
    const labels: string[]  = Array.from({ length: 8 }, (_, i) => `W${i + 1}`);
    const weekStart = (d: Date) => {
      const t = new Date(d);
      t.setHours(0, 0, 0, 0);
      t.setDate(t.getDate() - t.getDay()); // Sunday
      return t.getTime();
    };
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7 * 8);
    const cutoffTs = cutoff.getTime();

    // Build map: weekStart ts → bucket index
    const weekTs: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weekTs.push(weekStart(d));
    }

    for (const e of expenses) {
      if (!e.date) continue;
      const ts = weekStart(new Date(e.date));
      if (ts < cutoffTs) continue;
      const idx = weekTs.findLastIndex((w) => w <= ts);
      if (idx >= 0 && idx < 8) buckets[idx] += parseFloat(e.amount) || 0;
    }
    return { labels, values: buckets };
  }

  if (view === "month") {
    // Last 6 months
    const buckets: number[] = Array(6).fill(0);
    const labels: string[]  = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(SHORT_MONTH[d.getMonth()]);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1;
      for (const e of expenses) {
        if (!e.date) continue;
        const ed = new Date(e.date);
        if (ed.getFullYear() === yr && ed.getMonth() + 1 === mo) {
          buckets[5 - i] += parseFloat(e.amount) || 0;
        }
      }
    }
    return { labels, values: buckets };
  }

  // year — last 3 years
  const buckets: number[] = Array(3).fill(0);
  const labels: string[]  = [];
  for (let i = 2; i >= 0; i--) {
    const yr = now.getFullYear() - i;
    labels.push(String(yr));
    for (const e of expenses) {
      if (!e.date) continue;
      if (new Date(e.date).getFullYear() === yr) {
        buckets[2 - i] += parseFloat(e.amount) || 0;
      }
    }
  }
  return { labels, values: buckets };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const now        = new Date();
  const todayMonth = now.getMonth();
  const todayYear  = now.getFullYear();

  // Monthly report (for summary / category / budget sections)
  const [selectedMonth, setSelectedMonth] = useState(todayMonth);
  const [selectedYear,  setSelectedYear]  = useState(todayYear);
  const [report,        setReport]        = useState<any>(null);
  const [loading,       setLoading]       = useState(true);

  // Interactive chart
  const [allExpenses,  setAllExpenses]  = useState<any[]>([]);
  const [timeView,     setTimeView]     = useState<"day" | "week" | "month" | "year">("month");
  const [chartLabels,  setChartLabels]  = useState<string[]>([]);
  const [chartValues,  setChartValues]  = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [selectedDot,  setSelectedDot]  = useState<{ label: string; value: number } | null>(null);

  const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;

  // Fetch monthly report whenever selected month/year changes
  useEffect(() => {
    fetchReport(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  // Fetch all-time expenses once on mount
  useEffect(() => {
    fetchAllExpenses();
  }, []);

  // Re-process chart whenever expenses or view changes
  useEffect(() => {
    setSelectedDot(null);
    if (allExpenses.length > 0) {
      const { labels, values } = processChartData(allExpenses, timeView);
      setChartLabels(labels);
      setChartValues(values);
    }
  }, [allExpenses, timeView]);

  async function fetchReport(month: number, year: number) {
    setLoading(true);
    try {
      const reportRes = await expenseAPI.getMonthlyReport(getUserId(), month + 1, year);
      setReport(reportRes.data);
    } catch (e) {
      console.log("Error fetching report:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllExpenses() {
    try {
      const res = await expenseAPI.getCombinedHistory(getUserId());
      setAllExpenses(res.data || []);
    } catch (e) {
      console.log("Error fetching expenses:", e);
    } finally {
      setChartLoading(false);
    }
  }

  function goToPreviousMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (isCurrentMonth) return;
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }

  const selectedMonthName = MONTH_NAMES[selectedMonth];
  const prevMonthName     = MONTH_NAMES[(selectedMonth + 11) % 12];

  const MonthNav = (
    <View style={styles.monthNav}>
      <TouchableOpacity onPress={goToPreviousMonth} style={styles.navArrow}>
        <Text style={styles.navArrowText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{selectedMonthName} {selectedYear}</Text>
      <TouchableOpacity onPress={goToNextMonth} style={styles.navArrow} disabled={isCurrentMonth}>
        <Text style={[styles.navArrowText, isCurrentMonth && styles.navArrowDisabled]}>→</Text>
      </TouchableOpacity>
    </View>
  );

  // Safe chart data — react-native-chart-kit crashes on all-zeros or single point
  const safeValues  = chartValues.length >= 2 ? chartValues : [0, 0];
  const safeLabels  = chartLabels.length >= 2 ? chartLabels : ["", ""];
  const hasChartData = chartValues.some((v) => v > 0);

  function statusColor(status: string) {
    if (status === "over")    return "#E05C5C";
    if (status === "warning") return "#F7A84F";
    return "#00C896";
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Interactive spending chart ── */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Spending Over Time</Text>
        <Text style={styles.chartSubtitle}>
          Viewing by: {timeView.charAt(0).toUpperCase() + timeView.slice(1)}
        </Text>

        {/* Toggle buttons */}
        <View style={styles.viewModeRow}>
          {(["day", "week", "month", "year"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.viewModeBtn, timeView === mode && styles.viewModeBtnActive]}
              onPress={() => setTimeView(mode)}
            >
              <Text style={[styles.viewModeBtnText, timeView === mode && styles.viewModeBtnTextActive]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tap tooltip */}
        {selectedDot ? (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipLabel}>Total for {selectedDot.label}</Text>
            <Text style={styles.tooltipAmount}>GHS {selectedDot.value.toFixed(2)}</Text>
          </View>
        ) : (
          <Text style={styles.tapHint}>Tap a dot to see the total</Text>
        )}

        {chartLoading ? (
          <View style={styles.chartPlaceholder}>
            <ActivityIndicator color="#00C896" />
          </View>
        ) : hasChartData ? (
          <LineChart
            data={{ labels: safeLabels, datasets: [{ data: safeValues }] }}
            width={SCREEN_WIDTH - 64}
            height={180}
            onDataPointClick={({ index, value }) =>
              setSelectedDot({ label: chartLabels[index] ?? "", value })
            }
            chartConfig={{
              backgroundColor: "#1A1F2E",
              backgroundGradientFrom: "#1A1F2E",
              backgroundGradientTo: "#1A1F2E",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 200, 150, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(136, 144, 160, ${opacity})`,
              strokeWidth: 2,
              propsForDots: { r: "5", strokeWidth: "2", stroke: "#00C896" },
              propsForBackgroundLines: { stroke: "#ffffff10" },
            }}
            bezier
            style={{ borderRadius: 12 }}
            withInnerLines={false}
            withOuterLines={false}
            withShadow={false}
          />
        ) : (
          <View style={styles.chartPlaceholder}>
            <Text style={styles.noChartText}>No spending data yet</Text>
          </View>
        )}
      </View>

      {/* ── Month navigation + summary ── */}
      {MonthNav}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#00C896" />
        </View>
      ) : !report ? (
        <View style={styles.loadingBox}>
          <Text style={styles.emptyText}>No data for {selectedMonthName}</Text>
        </View>
      ) : (() => {
        const currentTotal  = parseFloat(report.currentMonth)  || 0;
        const previousTotal = parseFloat(report.previousMonth) || 0;
        const pctChange     = report.percentageChange || 0;
        const isUp          = pctChange > 0;

        const categoryBreakdown: { [key: string]: number } = {};
        for (const [cat, val] of Object.entries(report.categoryBreakdown || {})) {
          categoryBreakdown[cat] = parseFloat(val as string) || 0;
        }
        const maxCategoryAmount = Math.max(...Object.values(categoryBreakdown), 1);
        const budgetPerformance: any[] = report.budgetPerformance || [];

        return (
          <>
            {/* Monthly summary card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Monthly Summary</Text>
              <Text style={styles.bigAmount}>GHS {currentTotal.toFixed(2)}</Text>
              <Text style={styles.spentLabel}>spent in {selectedMonthName} {selectedYear}</Text>

              <View style={styles.comparisonRow}>
                <View style={styles.comparisonCol}>
                  <Text style={styles.compLabel}>{selectedMonthName}</Text>
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
                    {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs {prevMonthName}
                  </Text>
                </View>
              ) : (
                <View style={[styles.changeBadge, { backgroundColor: "#ffffff10" }]}>
                  <Text style={[styles.changeText, { color: "#8890A0" }]}>No data for {prevMonthName}</Text>
                </View>
              )}
            </View>

            {/* Top category */}
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

            {/* Category breakdown */}
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

            {/* Budget performance */}
            {budgetPerformance.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Budget Performance</Text>
                {budgetPerformance.map((item: any) => {
                  const pct   = Math.min(parseFloat(item.percentage) || 0, 100);
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
                      <View style={styles.perfBarRow}>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.perfPct, { color }]}>{pct.toFixed(0)}%</Text>
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
          </>
        );
      })()}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1117" },
  content:   { padding: 20 },
  emptyText: { color: "#8890A0", fontSize: 15 },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 32,
  },
  // Interactive chart card
  chartCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 12,
  },
  viewModeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#0F1117",
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  viewModeBtnActive: {
    backgroundColor: "#00C896",
    borderColor: "#00C896",
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8890A0",
  },
  viewModeBtnTextActive: {
    color: "#000000",
  },
  chartPlaceholder: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  noChartText: { color: "#8890A0", fontSize: 14 },
  tooltip: {
    backgroundColor: "#0F1117",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#00C89640",
  },
  tooltipAmount: { fontSize: 17, fontWeight: "bold", color: "#00C896" },
  tooltipLabel:  { fontSize: 12, color: "#8890A0", marginBottom: 2 },
  tapHint: { fontSize: 12, color: "#8890A0", marginBottom: 10, textAlign: "center" },
  // Month navigation
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 8,
  },
  navArrow:         { padding: 8 },
  navArrowText:     { fontSize: 24, color: "#00C896" },
  navArrowDisabled: { color: "#ffffff25" },
  monthLabel:       { fontSize: 18, fontWeight: "bold", color: "#ffffff" },
  // Cards
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
  bigAmount:  { fontSize: 34, fontWeight: "bold", color: "#ffffff", marginBottom: 2 },
  spentLabel: { fontSize: 13, color: "#8890A0", marginBottom: 16 },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#ffffff10",
    paddingTop: 14,
  },
  comparisonCol: { flex: 1, alignItems: "center" },
  divider:       { width: 1, height: 36, backgroundColor: "#ffffff15" },
  compLabel:     { fontSize: 12, color: "#8890A0", marginBottom: 4 },
  compValue:     { fontSize: 16, fontWeight: "600", color: "#ffffff" },
  changeBadge:   { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center" },
  changeText:    { fontSize: 14, fontWeight: "600" },
  highlightRow:     { flexDirection: "row", alignItems: "center", gap: 14 },
  highlightEmoji:   { fontSize: 40 },
  highlightCategory:{ fontSize: 20, fontWeight: "bold", color: "#ffffff", marginBottom: 4 },
  highlightAmount:  { fontSize: 16, color: "#00C896", fontWeight: "600" },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  breakdownLeft:  { flexDirection: "row", alignItems: "center", gap: 8, width: 110 },
  breakdownEmoji: { fontSize: 18 },
  breakdownCat:   { fontSize: 14, color: "#ffffff", fontWeight: "500" },
  breakdownRight: { flex: 1, marginLeft: 10, gap: 4 },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: "#ffffff15",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill:         { height: 10, backgroundColor: "#00C896", borderRadius: 5 },
  breakdownAmount: { fontSize: 12, color: "#8890A0", textAlign: "right" },
  perfRow: { marginBottom: 16 },
  perfHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  perfLeft:    { flexDirection: "row", alignItems: "center", gap: 8 },
  perfEmoji:   { fontSize: 20 },
  perfCat:     { fontSize: 15, fontWeight: "600", color: "#ffffff" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  statusText:  { fontSize: 12, fontWeight: "bold" },
  perfBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  perfPct:     { fontSize: 13, fontWeight: "bold", width: 38, textAlign: "right" },
  perfAmounts: { flexDirection: "row", justifyContent: "space-between" },
  perfSpent:   { fontSize: 13, color: "#ffffff", fontWeight: "500" },
  perfLimit:   { fontSize: 13, color: "#8890A0" },
});
