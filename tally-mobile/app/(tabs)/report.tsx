import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Animated,
  Easing,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { expenseAPI, categoriesAPI, remindersAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { useTheme } from "../../hooks/useTheme";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
  Shared: "👥",
  Settlement: "💚",
};

// Consistent category colors across the app
const CATEGORY_COLORS: { [key: string]: string } = {
  Food: "#FF6B6B",
  Transport: "#4ECDC4",
  Entertainment: "#A855F7",
  Utilities: "#F59E0B",
  Other: "#6B7280",
};

// Palette used to derive stable colors for custom categories
const HASH_PALETTE = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#14B8A6",
  "#0EA5E9", "#6366F1", "#8B5CF6", "#EC4899", "#F43F5E",
];

function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return HASH_PALETTE[hash % HASH_PALETTE.length];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatGhs(n: number): string {
  if (Math.abs(n) >= 1000) return `GHS ${(n / 1000).toFixed(1)}k`;
  return `GHS ${n.toFixed(0)}`;
}

// Spend value of a history entry (income & settlements don't count as spending)
function spendOf(e: any): number {
  if (e.type === "income" || e.paymentMethod === "SETTLEMENT") return 0;
  return Math.abs(parseFloat(e.amount) || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Small animated building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Number that counts up from 0 to `value` on mount / value change */
function CountUpText({ value, style }: { value: number; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState("0.00");

  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => {
      const safeVal = (Number(value) || 0) * v;
      setDisplay(safeVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    });
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value]);

  return <Text style={style}>GHS {display}</Text>;
}

/** Progress bar that animates its fill, with an optional stagger delay */
function AnimatedBar({ pct, color, delay, trackColor }: { pct: number; color: string; delay: number; trackColor: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 600,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, delay]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.min(Math.max(pct, 0), 100)}%`] });

  return (
    <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.barFill, { width, backgroundColor: color }]} />
    </View>
  );
}

/** Category breakdown row — fades in with stagger, bar animates after */
function CategoryRow({
  cat, amount, pct, index, icon, t,
}: { cat: string; amount: number; pct: number; index: number; icon: string; t: any }) {
  const fade = useRef(new Animated.Value(0)).current;
  const color = categoryColor(cat);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 350,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [cat, index]);

  return (
    <Animated.View style={[styles.catRow, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      <View style={styles.catHeader}>
        <View style={styles.catLeft}>
          <View style={[styles.catEmojiCircle, { backgroundColor: color + "22", borderColor: color + "44" }]}>
            <Text style={styles.catEmoji}>{icon}</Text>
          </View>
          <Text style={[styles.catName, { color: t.text }]} numberOfLines={1}>{cat}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.catAmount, { color: t.text }]}>GHS {amount.toFixed(2)}</Text>
          <Text style={[styles.catPct, { color: t.textSecondary }]}>{pct.toFixed(0)}% of total</Text>
        </View>
      </View>
      <AnimatedBar pct={pct} color={color} delay={index * 100 + 150} trackColor={t.segmentBg} />
    </Animated.View>
  );
}

/** SVG donut progress ring */
function Donut({ pct, color, size, trackColor, t }: { pct: number; color: string; size: number; trackColor: string; t: any }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 100);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.donutPct, { color: t.text, position: "absolute" }]}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Comprehensive theme object applied to every element
  const t = useMemo(() => (isDark ? {
    bg: "#0F1117",
    card: "#1A1F2E",
    cardBorder: "#ffffff10",
    text: "#ffffff",
    textSecondary: "#8890A0",
    accent: "#A78BFA",
    chartBg: "#1A1F2E",
    segmentBg: "#0F1117",
    segmentActive: "#A78BFA",
    segmentActiveText: "#000000",
    segmentText: "#8890A0",
    heroBase: "#203A43",
    heroCircleA: "#0F2027",
    heroCircleB: "#2C5364",
    heroText: "#ffffff",
    gridLine: "#ffffff12",
    up: "#F87171",
    down: "#34D399",
  } : {
    bg: "#F5F7FA",
    card: "#FFFFFF",
    cardBorder: "#E5E7EB",
    text: "#1A1A2E",
    textSecondary: "#6B7280",
    accent: "#8B5CF6",
    chartBg: "#FFFFFF",
    segmentBg: "#E5E7EB",
    segmentActive: "#8B5CF6",
    segmentActiveText: "#FFFFFF",
    segmentText: "#6B7280",
    heroBase: "#E8F8F3",
    heroCircleA: "#F0FFF8",
    heroCircleB: "#D2F5E8",
    heroText: "#1A1A2E",
    gridLine: "#E5E7EB",
    up: "#EF4444",
    down: "#059669",
  }), [isDark]);

  const now = new Date();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(todayMonth);
  const [selectedYear, setSelectedYear] = useState(todayYear);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<any[]>([]);
  const [chartTimeline, setChartTimeline] = useState<"day" | "week" | "month" | "year">("day");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);

  // Content slide/fade on month change
  const slideAnim = useRef(new Animated.Value(1)).current;
  // Chart draw-in reveal
  const chartAnim = useRef(new Animated.Value(0)).current;

  const getCategoryIcon = useCallback((categoryName: string): string => {
    if (CATEGORY_ICONS[categoryName]) return CATEGORY_ICONS[categoryName];
    const custom = customCategories.find((c: any) => c.name === categoryName);
    if (custom?.emoji) return custom.emoji;
    return "📦";
  }, [customCategories]);

  const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;
  const refDate = useMemo(
    () => (isCurrentMonth ? new Date() : new Date(selectedYear, selectedMonth + 1, 0)),
    [isCurrentMonth, selectedMonth, selectedYear],
  );

  useFocusEffect(
    useCallback(() => {
      fetchReportAndExpenses(selectedMonth, selectedYear, true);
    }, [selectedMonth, selectedYear])
  );

  // Animate content in whenever the month changes or loading completes
  useEffect(() => {
    if (!loading) {
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [selectedMonth, selectedYear, loading]);

  // Chart draw-in on load and whenever data/timeline changes
  useEffect(() => {
    chartAnim.setValue(0);
    setSelectedPoint(null);
    Animated.timing(chartAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [chartTimeline, expenses, selectedMonth, selectedYear]);

  async function fetchReportAndExpenses(month: number, year: number, showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const [reportRes, expensesRes, categoriesRes] = await Promise.all([
        expenseAPI.getMonthlyReport(userId, month + 1, year),
        expenseAPI.getCombinedHistory(userId),
        categoriesAPI.getUserCategories(userId).catch(() => ({ data: [] })),
      ]);
      setReport(reportRes.data);
      setExpenses(expensesRes.data || []);
      setCustomCategories(categoriesRes.data || []);
      // Non-blocking: upcoming bills feed the insights row
      remindersAPI.getUpcomingReminders(userId)
        .then((r: any) => setUpcomingBills(r.data || []))
        .catch(() => setUpcomingBills([]));
    } catch (e) {
      setError("Failed to load reports. Pull down to refresh.");
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchReportAndExpenses(selectedMonth, selectedYear, false);
    setRefreshing(false);
  }, [selectedMonth, selectedYear]);

  const goToPreviousMonth = useCallback(() => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const goToNextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [isCurrentMonth, selectedMonth]);

  // Last 6 months for the quick-jump dot row
  const monthDots = useMemo(() => {
    const dots: { month: number; year: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(todayYear, todayMonth - i, 1);
      dots.push({ month: d.getMonth(), year: d.getFullYear(), label: SHORT_MONTHS[d.getMonth()] });
    }
    return dots;
  }, [todayMonth, todayYear]);

  const selectedMonthName = MONTH_NAMES[selectedMonth];
  const prevMonthName = MONTH_NAMES[(selectedMonth + 11) % 12];

  // ── Chart data (memoized) ─────────────────────────────────────────────────
  const { chartBars } = useMemo(() => {
    const parseLocalDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split("-");
      if (parts.length < 3) return new Date(dateStr);
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    if (chartTimeline === "day") {
      const bars = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(refDate);
        d.setDate(d.getDate() - i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const spend = expenses.filter((e) => e.date === dateKey).reduce((s, e) => s + spendOf(e), 0);
        bars.push({ day: SHORT_DAYS[d.getDay()], spend, dateLabel: `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}` });
      }
      return { chartBars: bars };
    }

    if (chartTimeline === "week") {
      const bars = [];
      for (let i = 3; i >= 0; i--) {
        const start = new Date(refDate);
        start.setDate(refDate.getDate() - (i + 1) * 7 + 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(refDate);
        end.setDate(refDate.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);
        const spend = expenses.filter((e) => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed >= start && ed <= end;
        }).reduce((s, e) => s + spendOf(e), 0);
        bars.push({ day: `W${4 - i}`, spend, dateLabel: `Week ${4 - i}` });
      }
      return { chartBars: bars };
    }

    if (chartTimeline === "month") {
      const bars = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
        const spend = expenses.filter((e) => {
          if (!e.date) return false;
          const ed = parseLocalDate(e.date);
          return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
        }).reduce((s, e) => s + spendOf(e), 0);
        bars.push({ day: SHORT_MONTHS[d.getMonth()], spend, dateLabel: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` });
      }
      return { chartBars: bars };
    }

    const bars = [];
    for (let i = 2; i >= 0; i--) {
      const yr = refDate.getFullYear() - i;
      const spend = expenses.filter((e) => {
        if (!e.date) return false;
        return parseLocalDate(e.date).getFullYear() === yr;
      }).reduce((s, e) => s + spendOf(e), 0);
      bars.push({ day: String(yr), spend, dateLabel: String(yr) });
    }
    return { chartBars: bars };
  }, [expenses, chartTimeline, refDate]);

  // ── Chart geometry (memoized) ─────────────────────────────────────────────
  const { width: screenWidth } = Dimensions.get("window");
  const chartWidth = screenWidth - 80;
  const chartHeight = 150;
  const padV = 25;
  const chartInset = 20;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * padV;
  const maxSpendVal = Math.max(...chartBars.map((b) => b.spend), 0);

  const { points, curveSegments } = useMemo(() => {
    const pts = chartBars.map((bar, idx) => {
      const x = chartBars.length > 1
        ? chartInset + (plotWidth / (chartBars.length - 1)) * idx
        : chartInset + plotWidth / 2;
      const y = maxSpendVal > 0
        ? chartHeight - (padV + (bar.spend / maxSpendVal) * plotHeight)
        : chartHeight / 2;
      return { x, y, ...bar };
    });

    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const steps = 12;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      for (let j = 0; j < steps; j++) {
        const t1 = j / steps;
        const t2 = (j + 1) / steps;
        const mu1 = (1 - Math.cos(t1 * Math.PI)) / 2;
        const mu2 = (1 - Math.cos(t2 * Math.PI)) / 2;
        segs.push({
          x1: p1.x + t1 * (p2.x - p1.x),
          x2: p1.x + t2 * (p2.x - p1.x),
          y1: p1.y + mu1 * (p2.y - p1.y),
          y2: p1.y + mu2 * (p2.y - p1.y),
        });
      }
    }
    return { points: pts, curveSegments: segs };
  }, [chartBars, plotWidth, plotHeight, maxSpendVal]);

  // min / max / average chips
  const chartStats = useMemo(() => {
    const vals = chartBars.map((b) => b.spend);
    if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }, [chartBars]);

  // Reveal mask width: covers the chart from the right, shrinking to 0
  const maskWidth = chartAnim.interpolate({ inputRange: [0, 1], outputRange: [chartWidth, 0] });

  // ── Hero card stats (memoized) ────────────────────────────────────────────
  const heroStats = useMemo(() => {
    const currentTotal = parseFloat(report?.currentMonth) || 0;
    const previousTotal = parseFloat(report?.previousMonth) || 0;
    const pctChange = report?.percentageChange || 0;

    const monthTxCount = expenses.filter((e) => {
      if (!e.date) return false;
      const parts = e.date.split("-");
      return parseInt(parts[0]) === selectedYear && parseInt(parts[1]) === selectedMonth + 1
        && e.type !== "income" && e.paymentMethod !== "SETTLEMENT";
    }).length;

    const catCount = Object.keys(report?.categoryBreakdown || {}).length;
    const topCat = report?.highestCategory?.category || null;

    return { currentTotal, previousTotal, pctChange, monthTxCount, catCount, topCat };
  }, [report, expenses, selectedMonth, selectedYear]);

  // ── Category breakdown (memoized, sorted) ─────────────────────────────────
  const breakdown = useMemo(() => {
    const entries: { cat: string; amount: number }[] = [];
    for (const [cat, val] of Object.entries(report?.categoryBreakdown || {})) {
      entries.push({ cat, amount: parseFloat(val as string) || 0 });
    }
    entries.sort((a, b) => b.amount - a.amount);
    const total = entries.reduce((s, e) => s + e.amount, 0);
    return { entries, total };
  }, [report]);

  const visibleCats = showAllCats ? breakdown.entries : breakdown.entries.slice(0, 5);
  const budgetPerformance: any[] = report?.budgetPerformance || [];

  // ── Spending insights (pure calculations, no AI API) ──────────────────────
  const insights = useMemo(() => {
    const list: { icon: string; text: string }[] = [];
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
    const prevDate = new Date(selectedYear, selectedMonth - 1, 1);
    const prevPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const isSpend = (e: any) => e.type !== "income" && e.paymentMethod !== "SETTLEMENT";
    const monthExp = expenses.filter((e) => e.date?.startsWith(monthPrefix) && isSpend(e));
    const prevExp = expenses.filter((e) => e.date?.startsWith(prevPrefix) && isSpend(e));

    // 1. Top category vs last month
    if (report?.highestCategory?.category) {
      const cat = report.highestCategory.category;
      const cur = monthExp.filter((e) => e.category === cat)
        .reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
      const prev = prevExp.filter((e) => e.category === cat)
        .reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
      if (prev > 0 && cur > 0) {
        const change = ((cur - prev) / prev) * 100;
        list.push({
          icon: change >= 0 ? "📈" : "📉",
          text: `You spent ${Math.abs(change).toFixed(0)}% ${change >= 0 ? "more" : "less"} on ${cat} this month vs last month`,
        });
      }
    }

    // 2. Biggest single expense
    if (monthExp.length > 0) {
      const biggest = monthExp.reduce((a, b) =>
        Math.abs(parseFloat(b.amount) || 0) > Math.abs(parseFloat(a.amount) || 0) ? b : a);
      list.push({
        icon: "💸",
        text: `Your biggest single expense was GHS ${Math.abs(parseFloat(biggest.amount) || 0).toFixed(0)} on ${biggest.description || biggest.category}`,
      });
    }

    // 3. Budgets on track
    if (budgetPerformance.length > 0) {
      const onTrack = budgetPerformance.filter((b: any) => (parseFloat(b.percentage) || 0) < 100).length;
      list.push({
        icon: onTrack === budgetPerformance.length ? "✅" : "🎯",
        text: `You are on track with ${onTrack} out of ${budgetPerformance.length} budget${budgetPerformance.length === 1 ? "" : "s"}`,
      });
    }

    // 4. MoMo spending this month
    const momoExp = monthExp.filter((e) => e.paymentMethod === "MOMO");
    if (momoExp.length > 0) {
      const momoTotal = momoExp.reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
      list.push({
        icon: "📱",
        text: `Your MoMo spending this month: GHS ${momoTotal.toFixed(0)} (${momoExp.length} transaction${momoExp.length === 1 ? "" : "s"})`,
      });
    }

    // 5. Bills due in the next 7 days
    if (upcomingBills.length > 0) {
      const billTotal = upcomingBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
      list.push({
        icon: "🔔",
        text: `You have ${upcomingBills.length} bill${upcomingBills.length === 1 ? "" : "s"} due in the next 7 days${billTotal > 0 ? ` totalling GHS ${billTotal.toFixed(0)}` : ""}`,
      });
    }

    return list;
  }, [expenses, report, budgetPerformance, upcomingBills, selectedMonth, selectedYear]);

  function budgetColor(pct: number) {
    if (pct >= 100) return "#EF4444";
    if (pct >= 80) return "#F59E0B";
    return "#34D399";
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !report) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: t.bg }]}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} />}
      >
        <Text style={[styles.errorText, { color: t.textSecondary }]}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: t.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} />}
    >
      {/* ── Section 1: Header with month navigation ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={goToPreviousMonth}
          style={[styles.navArrow, { backgroundColor: t.card, borderColor: t.cardBorder }]}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={22} color={t.text} />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={[styles.monthTitle, { color: t.text }]}>{selectedMonthName}</Text>
          <Text style={[styles.yearSubtitle, { color: t.textSecondary }]}>{selectedYear}</Text>
        </View>

        <TouchableOpacity
          onPress={goToNextMonth}
          style={[styles.navArrow, { backgroundColor: t.card, borderColor: t.cardBorder, opacity: isCurrentMonth ? 0.35 : 1 }]}
          disabled={isCurrentMonth}
          activeOpacity={0.7}
        >
          <Feather name="chevron-right" size={22} color={t.text} />
        </TouchableOpacity>
      </View>

      {/* Month quick-jump dots (last 6 months) */}
      <View style={styles.dotsRow}>
        {monthDots.map((d) => {
          const active = d.month === selectedMonth && d.year === selectedYear;
          return (
            <TouchableOpacity
              key={`${d.year}-${d.month}`}
              style={styles.dotTap}
              onPress={() => { setSelectedMonth(d.month); setSelectedYear(d.year); }}
              activeOpacity={0.7}
            >
              <View style={[styles.monthDot, { backgroundColor: active ? t.accent : t.segmentBg, borderColor: t.cardBorder }]} />
              <Text style={[styles.dotLabel, { color: active ? t.accent : t.textSecondary, fontWeight: active ? "700" : "500" }]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      ) : (
        <Animated.View
          style={{
            opacity: slideAnim,
            transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }}
        >
          {/* ── Section 2: Hero spending card ── */}
          <View style={[styles.heroCard, { backgroundColor: t.heroBase }]}>
            {/* Layered circles simulate a gradient (expo-linear-gradient not installed) */}
            <View style={[styles.heroCircleTop, { backgroundColor: t.heroCircleA }]} />
            <View style={[styles.heroCircleBottom, { backgroundColor: t.heroCircleB }]} />

            <Text style={[styles.heroLabel, { color: isDark ? "#A7C4C9" : "#4B7A6C" }]}>TOTAL SPENT</Text>
            <CountUpText value={heroStats.currentTotal} style={[styles.heroAmount, { color: t.heroText }]} />

            {heroStats.previousTotal > 0 ? (
              <Text style={[styles.heroCompare, { color: heroStats.pctChange > 0 ? t.up : t.down }]}>
                {heroStats.pctChange > 0 ? "↑" : "↓"} {Math.abs(heroStats.pctChange).toFixed(0)}% vs last month
              </Text>
            ) : (
              <Text style={[styles.heroCompare, { color: isDark ? "#8890A0" : "#6B7280" }]}>
                First month of tracking
              </Text>
            )}

            <View style={styles.heroChipsRow}>
              <View style={[styles.heroChip, { backgroundColor: isDark ? "#ffffff14" : "#ffffffAA" }]}>
                <Text style={[styles.heroChipText, { color: t.heroText }]}>📊 {heroStats.catCount} categor{heroStats.catCount === 1 ? "y" : "ies"}</Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: isDark ? "#ffffff14" : "#ffffffAA" }]}>
                <Text style={[styles.heroChipText, { color: t.heroText }]}>🧾 {heroStats.monthTxCount} expense{heroStats.monthTxCount === 1 ? "" : "s"}</Text>
              </View>
              {heroStats.topCat && (
                <View style={[styles.heroChip, { backgroundColor: isDark ? "#ffffff14" : "#ffffffAA" }]}>
                  <Text style={[styles.heroChipText, { color: t.heroText }]} numberOfLines={1}>💰 Top: {heroStats.topCat}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Spending insights (horizontal scroll) ── */}
          {insights.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.insightsScroll}
              contentContainerStyle={styles.insightsRow}
            >
              {insights.map((insight, idx) => (
                <View key={idx} style={[styles.insightCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                  <Text style={styles.insightIcon}>{insight.icon}</Text>
                  <Text style={[styles.insightText, { color: t.text }]}>{insight.text}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Section 3: Interactive spending chart ── */}
          <View style={[styles.card, { backgroundColor: t.chartBg, borderColor: t.cardBorder }]}>
            <View style={styles.chartHeaderRow}>
              <Text style={[styles.cardTitle, { color: t.textSecondary }]}>SPENDING TREND</Text>

              {/* Segmented pill control */}
              <View style={[styles.segment, { backgroundColor: t.segmentBg }]}>
                {(["day", "week", "month", "year"] as const).map((f) => {
                  const labelMap = { day: "D", week: "W", month: "M", year: "Y" };
                  const active = chartTimeline === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.segmentBtn, active && { backgroundColor: t.segmentActive }]}
                      onPress={() => setChartTimeline(f)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, { color: active ? t.segmentActiveText : t.segmentText }]}>
                        {labelMap[f]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.chartContainer, { height: chartHeight }]}>
              {/* Grid lines + Y labels */}
              {[{ top: padV, val: maxSpendVal }, { top: chartHeight / 2, val: maxSpendVal / 2 }, { top: chartHeight - padV, val: 0 }].map((g, i) => (
                <View key={`grid-${i}`} style={[styles.gridLine, { top: g.top, backgroundColor: t.gridLine }]}>
                  <Text style={[styles.yLabel, { color: t.textSecondary }]}>{formatGhs(g.val)}</Text>
                </View>
              ))}

              {/* Smooth curve */}
              {curveSegments.map((seg, idx) => {
                const dx = seg.x2 - seg.x1;
                const dy = seg.y2 - seg.y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                return (
                  <View
                    key={`seg-${idx}`}
                    style={{
                      position: "absolute",
                      left: seg.x1,
                      top: seg.y1,
                      width: dist + 0.6,
                      height: 2.5,
                      backgroundColor: t.accent,
                      transform: [{ rotate: `${angle}rad` }],
                      transformOrigin: ["0%", "50%", 0] as any,
                    }}
                  />
                );
              })}

              {/* Tappable data points */}
              {points.map((point, idx) => (
                <TouchableOpacity
                  key={`dot-${idx}`}
                  style={[styles.dotTouch, { left: point.x - 14, top: point.y - 14 }]}
                  onPress={() => setSelectedPoint(selectedPoint === idx ? null : idx)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.chartDot,
                    { backgroundColor: t.chartBg, borderColor: t.accent },
                    selectedPoint === idx && { backgroundColor: t.accent },
                  ]} />
                </TouchableOpacity>
              ))}

              {/* Tooltip */}
              {selectedPoint !== null && points[selectedPoint] && (
                <View
                  style={[
                    styles.tooltip,
                    {
                      backgroundColor: isDark ? "#000000E6" : "#1A1A2EE6",
                      left: Math.min(Math.max(points[selectedPoint].x - 55, 0), chartWidth - 110),
                      top: Math.max(points[selectedPoint].y - 52, 0),
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.tooltipTitle}>{points[selectedPoint].dateLabel}</Text>
                  <Text style={[styles.tooltipValue, { color: t.accent }]}>
                    GHS {points[selectedPoint].spend.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Draw-in reveal mask (shrinks from the right) */}
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: maskWidth,
                  backgroundColor: t.chartBg,
                }}
                pointerEvents="none"
              />
            </View>

            {/* X labels */}
            <View style={styles.xLabelsRow}>
              {points.map((point, idx) => (
                <View key={`x-${idx}`} style={[styles.xLabelCol, { left: point.x - 20 }]}>
                  <Text style={[styles.xLabel, { color: t.textSecondary }]}>{point.day}</Text>
                </View>
              ))}
            </View>

            {/* Min / Max / Avg chips */}
            <View style={styles.statChipsRow}>
              <View style={[styles.statChip, { backgroundColor: t.segmentBg }]}>
                <Text style={[styles.statChipLabel, { color: t.textSecondary }]}>MIN</Text>
                <Text style={[styles.statChipValue, { color: t.text }]}>{formatGhs(chartStats.min)}</Text>
              </View>
              <View style={[styles.statChip, { backgroundColor: t.segmentBg }]}>
                <Text style={[styles.statChipLabel, { color: t.textSecondary }]}>MAX</Text>
                <Text style={[styles.statChipValue, { color: t.text }]}>{formatGhs(chartStats.max)}</Text>
              </View>
              <View style={[styles.statChip, { backgroundColor: t.segmentBg }]}>
                <Text style={[styles.statChipLabel, { color: t.textSecondary }]}>AVG</Text>
                <Text style={[styles.statChipValue, { color: t.text }]}>{formatGhs(chartStats.avg)}</Text>
              </View>
            </View>
          </View>

          {/* ── Section 4: Category breakdown ── */}
          {breakdown.entries.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: t.textSecondary }]}>CATEGORY BREAKDOWN</Text>
              {visibleCats.map((entry, index) => (
                <CategoryRow
                  key={`${entry.cat}-${selectedMonth}-${selectedYear}`}
                  cat={entry.cat}
                  amount={entry.amount}
                  pct={breakdown.total > 0 ? (entry.amount / breakdown.total) * 100 : 0}
                  index={index}
                  icon={getCategoryIcon(entry.cat)}
                  t={t}
                />
              ))}
              {breakdown.entries.length > 5 && (
                <TouchableOpacity onPress={() => setShowAllCats(!showAllCats)} activeOpacity={0.7} style={styles.showAllBtn}>
                  <Text style={[styles.showAllText, { color: t.accent }]}>
                    {showAllCats ? "Show less ▲" : `Show all (${breakdown.entries.length}) ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Section 5: Budget performance grid ── */}
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: t.textSecondary }]}>BUDGET PERFORMANCE</Text>
            {budgetPerformance.length === 0 ? (
              <View style={styles.emptyBudget}>
                <Text style={styles.emptyBudgetEmoji}>🎯</Text>
                <Text style={[styles.emptyBudgetTitle, { color: t.text }]}>No budgets set yet</Text>
                <Text style={[styles.emptyBudgetSub, { color: t.textSecondary }]}>
                  Set monthly limits per category to track your spending against them here.
                </Text>
                <TouchableOpacity
                  style={[styles.setBudgetBtn, { backgroundColor: t.accent }]}
                  onPress={() => router.push("/(tabs)/budget")}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.setBudgetBtnText, { color: t.segmentActiveText }]}>Set Budgets</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.budgetGrid}>
                {budgetPerformance.map((item: any) => {
                  const pct = parseFloat(item.percentage) || 0;
                  const color = budgetColor(pct);
                  const status = pct >= 100
                    ? { label: "Over Budget 🚨", color: "#EF4444" }
                    : pct >= 80
                    ? { label: "Near Limit ⚠️", color: "#F59E0B" }
                    : { label: "On Track ✓", color: t.accent };
                  return (
                    <View key={item.category} style={[styles.budgetCard, { backgroundColor: t.segmentBg, borderColor: t.cardBorder }]}>
                      <Text style={[styles.budgetCardTitle, { color: t.text }]} numberOfLines={1}>
                        {getCategoryIcon(item.category)} {item.category}
                      </Text>
                      <Donut pct={pct} color={color} size={78} trackColor={isDark ? "#ffffff14" : "#00000010"} t={t} />
                      <Text style={[styles.budgetAmounts, { color: t.textSecondary }]}>
                        GHS {(parseFloat(item.spent) || 0).toFixed(0)} of GHS {(parseFloat(item.limit) || 0).toFixed(0)}
                      </Text>
                      <View style={[styles.budgetStatusBadge, { backgroundColor: status.color + "1A", borderColor: status.color + "40" }]}>
                        <Text style={[styles.budgetStatusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (colors come from the theme object at render time)
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  // Section 1 — header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { fontSize: 22, fontWeight: "bold", letterSpacing: -0.3 },
  yearSubtitle: { fontSize: 13, fontWeight: "600", marginTop: 1 },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  dotTap: { alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  monthDot: { width: 8, height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  dotLabel: { fontSize: 10 },

  // Section 2 — hero card
  heroCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -130,
    left: -60,
    opacity: 0.55,
  },
  heroCircleBottom: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: -110,
    right: -50,
    opacity: 0.6,
  },
  heroLabel: { fontSize: 11, fontWeight: "bold", letterSpacing: 1.5, marginBottom: 8 },
  heroAmount: { fontSize: 42, fontWeight: "bold", letterSpacing: -1, marginBottom: 6 },
  heroCompare: { fontSize: 13, fontWeight: "700", marginBottom: 18 },
  heroChipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  heroChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160 },
  heroChipText: { fontSize: 11, fontWeight: "600" },

  // Generic card
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },

  // Insights row
  insightsScroll: { marginBottom: 16, marginHorizontal: -20 },
  insightsRow: { paddingHorizontal: 20, gap: 10 },
  insightCard: {
    width: 230,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  insightIcon: { fontSize: 20 },
  insightText: { fontSize: 12, fontWeight: "600", lineHeight: 17 },
  cardTitle: { fontSize: 11, fontWeight: "bold", letterSpacing: 1, marginBottom: 16 },

  // Section 3 — chart
  chartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  segment: { flexDirection: "row", borderRadius: 18, padding: 3 },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 11, fontWeight: "bold" },
  chartContainer: { position: "relative" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1 },
  yLabel: { position: "absolute", right: 0, top: -14, fontSize: 9, fontWeight: "600" },
  dotTouch: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  chartDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  tooltip: {
    position: "absolute",
    width: 110,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    zIndex: 10,
  },
  tooltipTitle: { color: "#ffffffB3", fontSize: 10, fontWeight: "600" },
  tooltipValue: { fontSize: 12, fontWeight: "bold", marginTop: 1 },
  xLabelsRow: { position: "relative", height: 18, marginTop: 8 },
  xLabelCol: { position: "absolute", width: 40, alignItems: "center" },
  xLabel: { fontSize: 10, fontWeight: "500" },
  statChipsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  statChip: { flex: 1, borderRadius: 14, paddingVertical: 8, alignItems: "center" },
  statChipLabel: { fontSize: 9, fontWeight: "bold", letterSpacing: 0.5, marginBottom: 2 },
  statChipValue: { fontSize: 13, fontWeight: "bold" },

  // Section 4 — categories
  catRow: { marginBottom: 16 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  catLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 10 },
  catEmojiCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  catEmoji: { fontSize: 16 },
  catName: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  catAmount: { fontSize: 14, fontWeight: "bold" },
  catPct: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  barTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  showAllBtn: { alignItems: "center", paddingTop: 4 },
  showAllText: { fontSize: 13, fontWeight: "bold" },

  // Section 5 — budget grid
  budgetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  budgetCard: {
    width: "48.5%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 10,
  },
  budgetCardTitle: { fontSize: 13, fontWeight: "700" },
  donutPct: { fontSize: 13, fontWeight: "bold" },
  budgetAmounts: { fontSize: 11, fontWeight: "600" },
  budgetStatusBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  budgetStatusText: { fontSize: 10, fontWeight: "bold" },
  emptyBudget: { alignItems: "center", paddingVertical: 16, gap: 6 },
  emptyBudgetEmoji: { fontSize: 34 },
  emptyBudgetTitle: { fontSize: 15, fontWeight: "bold" },
  emptyBudgetSub: { fontSize: 12, textAlign: "center", lineHeight: 17, paddingHorizontal: 12 },
  setBudgetBtn: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  setBudgetBtnText: { fontSize: 13, fontWeight: "bold" },

  loadingBox: { paddingVertical: 60, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 14, textAlign: "center" },
});
