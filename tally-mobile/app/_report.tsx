import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reportAPI, expenseAPI } from "../services/api";
import { getUserId } from "../services/storage";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Helper to draw connection lines for spline curve
const getLineStyle = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  
  return {
    position: 'absolute' as const,
    left: x1,
    top: y1,
    width: distance + 0.6,
    height: 3,
    backgroundColor: '#8B5CF6',
    transform: [{ rotate: `${angle}rad` }] as any,
    transformOrigin: ['0%', '50%', 0] as any,
  };
};

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Chart data states
  const [expenses, setExpenses] = useState<any[]>([]);
  const [chartTimeline, setChartTimeline] = useState<'day' | 'week' | 'month' | 'year'>('week');

  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();
  const prevMonthName = MONTH_NAMES[(now.getMonth() + 11) % 12];

  useEffect(() => {
    async function fetchReportData() {
      try {
        const userId = getUserId();
        const reportRes = await reportAPI.getMonthlyReport(userId);
        setReport(reportRes.data);
      } catch (e: any) {
        setError("Failed to load report.");
      } finally {
        setLoading(false);
      }
    }
    fetchReportData();
  }, []);

  useEffect(() => {
    async function fetchExpensesData() {
      try {
        const res = await expenseAPI.getCombinedHistory(getUserId());
        setExpenses(res.data || []);
      } catch {
        // Non-critical — chart renders empty
      }
    }
    fetchExpensesData();
  }, []);

  function statusColor(status: string) {
    if (status === "over") return "#FF3B30";
    if (status === "warning") return "#FF9500";
    return "#34C759";
  }

  // Dynamic chart data calculation based on selected timeline
  const getChartData = () => {
    const parseLocalDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('-');
      if (parts.length < 3) return new Date(dateStr);
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    if (chartTimeline === 'day') {
      // Last 7 days
      const chartBars = [];
      let sum = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayLabel = SHORT_DAYS[d.getDay()];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        const daySpend = expenses
          .filter(e => e.date === dateKey)
          .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        
        sum += daySpend;
        chartBars.push({ day: dayLabel, spend: daySpend });
      }
      return { chartBars, chartSum: sum };
    }

    if (chartTimeline === 'week') {
      // Last 4 weeks relative to today
      const chartBars = [];
      let sum = 0;
      for (let i = 3; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(now.getDate() - (i + 1) * 7 + 1);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(now);
        end.setDate(now.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);

        const weekSpend = expenses.filter(e => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed >= start && ed <= end;
        }).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

        sum += weekSpend;
        chartBars.push({ day: `W${4 - i}`, spend: weekSpend });
      }
      return { chartBars, chartSum: sum };
    }

    if (chartTimeline === 'month') {
      // Last 6 months
      const chartBars = [];
      let sum = 0;
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = SHORT_MONTHS[d.getMonth()];
        const yr = d.getFullYear();
        const mo = d.getMonth() + 1;

        const monthSpend = expenses.filter(e => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed.getFullYear() === yr && (ed.getMonth() + 1) === mo;
        }).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

        sum += monthSpend;
        chartBars.push({ day: label, spend: monthSpend });
      }
      return { chartBars, chartSum: sum };
    }

    // Yearly: Last 3 years
    const chartBars = [];
    let sum = 0;
    for (let i = 2; i >= 0; i--) {
      const yr = now.getFullYear() - i;
      const yearSpend = expenses.filter(e => {
        if (!e.date) return false;
        const ed = parseLocalDate(e.date);
        return ed.getFullYear() === yr;
      }).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

      sum += yearSpend;
      chartBars.push({ day: String(yr), spend: yearSpend });
    }
    return { chartBars, chartSum: sum };
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (error || !report) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={48} color="#FF3B30" style={{ marginBottom: 16 }} />
        <Text style={styles.errorText}>{error || "No data available."}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { chartBars, chartSum } = getChartData();

  const { width: screenWidth } = Dimensions.get('window');
  const chartWidth = screenWidth - 80; // Padding horizontal 20*2 screen + 20*2 card
  const chartHeight = 140;
  const paddingVertical = 25;
  const chartInset = 16;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpendVal = Math.max(...chartBars.map(b => b.spend), 0);

  const points = chartBars.map((bar, idx) => {
    const x = chartBars.length > 1
      ? chartInset + (plotWidth / (chartBars.length - 1)) * idx
      : chartInset + plotWidth / 2;
    const y = maxSpendVal > 0 
      ? chartHeight - (paddingVertical + (bar.spend / maxSpendVal) * plotHeight)
      : chartHeight / 2;
    return { x, y, ...bar };
  });

  const curveSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const steps = 12;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    for (let j = 0; j < steps; j++) {
      const t1 = j / steps;
      const t2 = (j + 1) / steps;
      
      const mu1 = (1 - Math.cos(t1 * Math.PI)) / 2;
      const mu2 = (1 - Math.cos(t2 * Math.PI)) / 2;
      
      const x1 = p1.x + t1 * (p2.x - p1.x);
      const x2 = p1.x + t2 * (p2.x - p1.x);
      const y1 = p1.y + mu1 * (p2.y - p1.y);
      const y2 = p1.y + mu2 * (p2.y - p1.y);
      
      curveSegments.push({ x1, y1, x2, y2 });
    }
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header NavBar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="chevron-left" size={24} color="#111111" />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Monthly Report</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{currentMonthName} {currentYear}</Text>

        {/* Spending Activity Chart Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Spending Activity</Text>
              <Text style={styles.chartTotal}>
                GHS {chartSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Timeline Filter Segmented Control */}
            <View style={styles.timelineFilterMini}>
              {(['day', 'week', 'month', 'year'] as const).map((filter) => {
                const labelMap = { day: 'D', week: 'W', month: 'M', year: 'Y' };
                const isActive = chartTimeline === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.timelineMiniBtn, isActive && styles.timelineMiniBtnActive]}
                    onPress={() => setChartTimeline(filter)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timelineMiniText, isActive && styles.timelineMiniTextActive]}>
                      {labelMap[filter]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.chartContainer}>
            {/* Horizontal Grid Lines */}
            <View style={[styles.gridLineHorizontal, { top: paddingVertical }]} />
            <View style={[styles.gridLineHorizontal, { top: chartHeight / 2 }]} />
            <View style={[styles.gridLineHorizontal, { top: chartHeight - paddingVertical }]} />

            {/* Connection Line Segments (Smooth Cosine Wave Curve) */}
            {curveSegments.map((seg, idx) => {
              const lineStyle = getLineStyle(seg.x1, seg.y1, seg.x2, seg.y2);
              return (
                <View
                  key={`line-${idx}`}
                  style={lineStyle}
                />
              );
            })}

            {/* Data Points (Dots) */}
            {points.map((point, idx) => (
              <View
                key={`dot-${idx}`}
                style={[
                  styles.chartDot,
                  {
                    left: point.x - 6,
                    top: point.y - 6,
                  }
                ]}
              />
            ))}
          </View>

          {/* Separated Timeline Labels */}
          <View style={styles.chartDaysContainer}>
            {points.map((point, idx) => (
              <View
                key={`timeline-label-${idx}`}
                style={[
                  styles.chartDayCol,
                  {
                    left: point.x - 20,
                  }
                ]}
              >
                <Text style={styles.chartDayText}>{point.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 1. Monthly Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly Summary</Text>
          <Text style={styles.bigAmount}>GHS {currentTotal.toFixed(2)}</Text>
          <Text style={styles.spentLabel}>spent this month</Text>

          <View style={styles.comparisonRow}>
            <View style={styles.comparisonCol}>
              <Text style={styles.compLabel}>{currentMonthName.slice(0, 3)}</Text>
              <Text style={styles.compValue}>GHS {currentTotal.toFixed(0)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.comparisonCol}>
              <Text style={styles.compLabel}>{prevMonthName.slice(0, 3)}</Text>
              <Text style={styles.compValue}>GHS {previousTotal.toFixed(0)}</Text>
            </View>
          </View>

          {previousTotal > 0 ? (
            <View style={[
              styles.changeBadge, 
              { backgroundColor: isUp ? "#FF3B3012" : "#34C75912" }
            ]}>
              <Text style={[
                styles.changeText, 
                { color: isUp ? "#FF3B30" : "#34C759" }
              ]}>
                {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% {isUp ? "more" : "less"} than last month
              </Text>
            </View>
          ) : (
            <View style={[styles.changeBadge, { backgroundColor: "#F2F4F7" }]}>
              <Text style={[styles.changeText, { color: "#8E9AA6" }]}>
                No baseline data for {prevMonthName}
              </Text>
            </View>
          )}
        </View>

        {/* 2. Top Category Card */}
        {report.highestCategory?.category && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Spending Category</Text>
            <View style={styles.highlightRow}>
              <View style={styles.iconBox}>
                <Text style={styles.highlightEmoji}>
                  {CATEGORY_ICONS[report.highestCategory.category] || "📦"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightCategory}>{report.highestCategory.category}</Text>
                <Text style={styles.highlightAmount}>
                  GHS {parseFloat(report.highestCategory.amount).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 3. Category Breakdown */}
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
                      <View style={styles.iconBoxSmall}>
                        <Text style={styles.breakdownEmoji}>{CATEGORY_ICONS[cat] || "📦"}</Text>
                      </View>
                      <Text style={styles.breakdownCat} numberOfLines={1}>{cat}</Text>
                    </View>
                    <View style={styles.breakdownRight}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${barWidth}%` }]} />
                      </View>
                      <Text style={styles.breakdownAmount}>GHS {amount.toFixed(2)}</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* 4. Budget Performance */}
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
                      <View style={styles.iconBoxSmall}>
                        <Text style={styles.perfEmoji}>{CATEGORY_ICONS[item.category] || "📦"}</Text>
                      </View>
                      <Text style={styles.perfCat}>{item.category}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge, 
                      { backgroundColor: color + "12", borderColor: color + "30" }
                    ]}>
                      <Text style={[styles.statusText, { color }]}>
                        {item.status === "over" ? "Over" : item.status === "warning" ? "Near limit" : "On track"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.perfBarRow}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={[styles.perfPct, { color }]}>{pct.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.perfAmounts}>
                    <Text style={styles.perfSpent}>GHS {parseFloat(item.spent).toFixed(0)} spent</Text>
                    <Text style={styles.perfLimit}>limit: GHS {parseFloat(item.limit).toFixed(0)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: "#F2F4F7" 
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEBEF",
  },
  backRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 4 
  },
  backLabel: { 
    color: "#111111", 
    fontSize: 15,
    fontWeight: "600",
  },
  navTitle: { 
    color: "#111111", 
    fontSize: 16, 
    fontWeight: "bold" 
  },
  navSpacer: { 
    width: 60 
  },
  container: { 
    flex: 1, 
    backgroundColor: "#F2F4F7" 
  },
  content: { 
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: "#F2F4F7",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { 
    color: "#FF3B30", 
    fontSize: 15, 
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  backBtn: {
    backgroundColor: "#111111",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backBtnText: { 
    color: "#ffffff", 
    fontWeight: "bold", 
    fontSize: 15 
  },
  title: { 
    fontSize: 24, 
    fontWeight: "bold", 
    color: "#111111", 
    marginBottom: 20,
    paddingLeft: 4,
  },
  // Premium cards
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 11,
    color: "#8E9AA6",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  bigAmount: { 
    fontSize: 32, 
    fontWeight: "bold", 
    color: "#111111", 
    marginBottom: 2 
  },
  spentLabel: { 
    fontSize: 13, 
    color: "#8E9AA6", 
    fontWeight: "500",
    marginBottom: 16 
  },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#EAEBEF",
    paddingTop: 16,
  },
  comparisonCol: { 
    flex: 1, 
    alignItems: "center" 
  },
  divider: { 
    width: 1, 
    height: 32, 
    backgroundColor: "#EAEBEF" 
  },
  compLabel: { 
    fontSize: 11, 
    color: "#8E9AA6", 
    fontWeight: "600",
    marginBottom: 4 
  },
  compValue: { 
    fontSize: 15, 
    fontWeight: "bold", 
    color: "#111111" 
  },
  changeBadge: { 
    borderRadius: 16, 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    alignItems: "center" 
  },
  changeText: { 
    fontSize: 13, 
    fontWeight: "700" 
  },
  highlightRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 16 
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F8F9FA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  iconBoxSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  highlightEmoji: { 
    fontSize: 24 
  },
  highlightCategory: { 
    fontSize: 16, 
    fontWeight: "bold", 
    color: "#111111", 
    marginBottom: 4 
  },
  highlightAmount: { 
    fontSize: 15, 
    color: "#8E9AA6", 
    fontWeight: "600" 
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  breakdownLeft: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 10, 
    width: 110 
  },
  breakdownEmoji: { 
    fontSize: 16 
  },
  breakdownCat: { 
    fontSize: 14, 
    color: "#111111", 
    fontWeight: "600" 
  },
  breakdownRight: { 
    flex: 1, 
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#F2F4F7",
    borderRadius: 4,
    overflow: "hidden",
    marginRight: 10,
  },
  barFill: { 
    height: "100%", 
    backgroundColor: "#8B5CF6", 
    borderRadius: 4 
  },
  breakdownAmount: { 
    fontSize: 13, 
    color: "#111111", 
    fontWeight: "bold",
    textAlign: "right",
    minWidth: 70,
  },
  perfRow: { 
    marginBottom: 18 
  },
  perfHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  perfLeft: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 10 
  },
  perfEmoji: { 
    fontSize: 16 
  },
  perfCat: { 
    fontSize: 14, 
    fontWeight: "600", 
    color: "#111111" 
  },
  statusBadge: { 
    borderRadius: 12, 
    paddingHorizontal: 10, 
    paddingVertical: 3, 
    borderWidth: 1 
  },
  statusText: { 
    fontSize: 11, 
    fontWeight: "bold" 
  },
  perfBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  perfPct: { 
    fontSize: 13, 
    fontWeight: "bold", 
    width: 36, 
    textAlign: "right" 
  },
  perfAmounts: { 
    flexDirection: "row", 
    justifyContent: "space-between" 
  },
  perfSpent: { 
    fontSize: 12, 
    color: "#111111", 
    fontWeight: "600" 
  },
  perfLimit: { 
    fontSize: 12, 
    color: "#8E9AA6",
    fontWeight: "500"
  },

  // Spending Curve Chart Styles
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
  },
  chartTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8E9AA6',
    marginTop: 2,
  },
  chartContainer: {
    position: 'relative',
    height: 140,
  },
  chartDaysContainer: {
    position: 'relative',
    height: 20,
    marginTop: 12,
  },
  chartDayCol: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#F2F4F7',
  },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  chartDayText: {
    fontSize: 10,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  timelineFilterMini: {
    flexDirection: 'row',
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 3,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    alignSelf: 'center',
  },
  timelineMiniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineMiniBtnActive: {
    backgroundColor: '#111111',
  },
  timelineMiniText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8E9AA6',
  },
  timelineMiniTextActive: {
    color: '#ffffff',
  },
});
