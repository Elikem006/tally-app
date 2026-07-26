import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  FadeInDown,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, router } from "expo-router";
import Svg, {
  Circle,
  Path,
  Line,
  Defs,
  Stop,
  LinearGradient as SvgGradient,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
import { expenseAPI, categoriesAPI, remindersAPI } from "../../services/api";
import { getUserId } from "../../services/storage";
import { useTheme } from "../../hooks/useTheme";
import {
  getExtendedColors,
  getCategoryColor,
  typography,
  spacing,
  radius,
  duration,
  easing,
  staggerDelay,
} from "../../theme";
import {
  Screen,
  Card,
  SectionHeader,
  EmptyState,
  AmountText,
  CategoryIcon,
  getCategoryIconName,
  ProgressBar,
  Skeleton,
  SkeletonCard,
} from "../../components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMELINES = ["day", "week", "month", "year"] as const;
type Timeline = (typeof TIMELINES)[number];
const TIMELINE_LABEL: Record<Timeline, string> = { day: "D", week: "W", month: "M", year: "Y" };

function formatGhs(n: number): string {
  if (Math.abs(n) >= 1000) return `GHS ${(n / 1000).toFixed(1)}k`;
  return `GHS ${n.toFixed(0)}`;
}

// Spend value of a history entry (income & settlements don't count as spending)
function spendOf(e: any): number {
  if (e.type === "income" || e.paymentMethod === "SETTLEMENT") return 0;
  return Math.abs(parseFloat(e.amount) || 0);
}

function parseLocalDate(dateStr: string) {
  if (!dateStr) return new Date();
  const parts = dateStr.split("-");
  if (parts.length < 3) return new Date(dateStr);
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

export interface ChartBar {
  day: string;
  spend: number;
  dateLabel: string;
}

/**
 * Buckets spend into the timeline's windows, ending at `refDate`. Lifted out
 * of the component so the current and previous periods are built by exactly
 * the same code — the comparison is only honest if both series agree on how
 * a bucket is defined.
 */
function buildBars(expenses: any[], timeline: Timeline, refDate: Date): ChartBar[] {
  if (timeline === "day") {
    const bars: ChartBar[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate);
      d.setDate(d.getDate() - i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const spend = expenses.filter((e) => e.date === dateKey).reduce((s, e) => s + spendOf(e), 0);
      bars.push({ day: SHORT_DAYS[d.getDay()], spend, dateLabel: `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}` });
    }
    return bars;
  }

  if (timeline === "week") {
    const bars: ChartBar[] = [];
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
    return bars;
  }

  if (timeline === "month") {
    const bars: ChartBar[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      const spend = expenses.filter((e) => {
        if (!e.date) return false;
        const ed = parseLocalDate(e.date);
        return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
      }).reduce((s, e) => s + spendOf(e), 0);
      bars.push({ day: SHORT_MONTHS[d.getMonth()], spend, dateLabel: `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` });
    }
    return bars;
  }

  const bars: ChartBar[] = [];
  for (let i = 2; i >= 0; i--) {
    const yr = refDate.getFullYear() - i;
    const spend = expenses.filter((e) => {
      if (!e.date) return false;
      return parseLocalDate(e.date).getFullYear() === yr;
    }).reduce((s, e) => s + spendOf(e), 0);
    bars.push({ day: String(yr), spend, dateLabel: String(yr) });
  }
  return bars;
}

/** The reference date one full window earlier — the series we compare against. */
function previousWindowRef(timeline: Timeline, refDate: Date): Date {
  const d = new Date(refDate);
  if (timeline === "day") d.setDate(d.getDate() - 7);
  else if (timeline === "week") d.setDate(d.getDate() - 28);
  else if (timeline === "month") d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 3);
  return d;
}

/**
 * Cosine-interpolated polyline through the points, plus its own arc length so
 * the line can draw itself in with strokeDashoffset.
 */
function buildCurve(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return { path: "", length: 0 };
  const steps = 12;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  let length = 0;
  let prevX = pts[0].x;
  let prevY = pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    for (let j = 1; j <= steps; j++) {
      const tt = j / steps;
      const mu = (1 - Math.cos(tt * Math.PI)) / 2;
      const x = p1.x + tt * (p2.x - p1.x);
      const y = p1.y + mu * (p2.y - p1.y);
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      length += Math.hypot(x - prevX, y - prevY);
      prevX = x;
      prevY = y;
    }
  }
  return { path: d, length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Category breakdown row — fades in on a capped stagger, bar animates after. */
function CategoryRow({
  cat, amount, pct, index, customEmoji,
}: { cat: string; amount: number; pct: number; index: number; customEmoji?: string }) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const fade = useSharedValue(0);

  useEffect(() => {
    fade.value = 0;
    fade.value = withDelay(staggerDelay(index), withTiming(1, { duration: duration.slow }));
  }, [cat, index]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 8 }],
  }));

  return (
    <Animated.View style={[{ marginBottom: spacing.lg }, rowStyle]}>
      <View style={styles.catHeader}>
        <View style={styles.catLeft}>
          <CategoryIcon category={cat} customEmoji={customEmoji} size={36} />
          <Text style={[typography.bodyStrong, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
            {cat}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AmountText value={amount} size="numeric" />
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 1 }]}>
            {pct.toFixed(0)}% of total
          </Text>
        </View>
      </View>
      <ProgressBar percentage={pct} />
    </Animated.View>
  );
}

/** SVG donut progress ring for one budget category. */
function Donut({ pct, color, size, trackColor }: { pct: number; color: string; size: number; trackColor: string }) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
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
      <Text style={[typography.label, { color: colors.text, position: "absolute" }]}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

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
  const [chartTimeline, setChartTimeline] = useState<Timeline>("day");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);

  // Content slide/fade on month change
  const slideProgress = useSharedValue(1);
  // Chart draw-in reveal
  const chartProgress = useSharedValue(0);

  const getCustomEmoji = useCallback((categoryName: string): string | undefined => {
    return customCategories.find((c: any) => c.name === categoryName)?.emoji;
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
      slideProgress.value = 0;
      slideProgress.value = withTiming(1, { duration: duration.base, easing: easing.decelerate });
    }
  }, [selectedMonth, selectedYear, loading]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: slideProgress.value,
    transform: [{ translateX: (1 - slideProgress.value) * 24 }],
  }));

  // Chart draw-in on load and whenever data/timeline changes
  useEffect(() => {
    chartProgress.value = 0;
    setSelectedPoint(null);
    chartProgress.value = withTiming(1, { duration: 800, easing: easing.decelerate });
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

  // ── Chart data (memoized) ─────────────────────────────────────────────────
  const chartBars = useMemo(
    () => buildBars(expenses, chartTimeline, refDate),
    [expenses, chartTimeline, refDate],
  );

  // The same window, one period earlier — drawn behind as a ghost line.
  const prevBars = useMemo(
    () => buildBars(expenses, chartTimeline, previousWindowRef(chartTimeline, refDate)),
    [expenses, chartTimeline, refDate],
  );

  // ── Chart geometry (memoized) ─────────────────────────────────────────────
  // Screen pads by spacing.lg each side, the Card another spacing.lg each side.
  const { width: screenWidth } = Dimensions.get("window");
  const chartWidth = screenWidth - spacing.lg * 4;
  const chartHeight = 150;
  const padV = 25;
  const chartInset = 20;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * padV;
  // Both series share one scale — the comparison is meaningless otherwise.
  const maxSpendVal = Math.max(...chartBars.map((b) => b.spend), ...prevBars.map((b) => b.spend), 0);

  const project = useCallback(
    (bars: ChartBar[]) =>
      bars.map((bar, idx) => {
        const x = bars.length > 1
          ? chartInset + (plotWidth / (bars.length - 1)) * idx
          : chartInset + plotWidth / 2;
        const y = maxSpendVal > 0
          ? chartHeight - (padV + (bar.spend / maxSpendVal) * plotHeight)
          : chartHeight / 2;
        return { x, y, ...bar };
      }),
    [plotWidth, plotHeight, maxSpendVal],
  );

  const { points, curvePath, curveLength, areaPath } = useMemo(() => {
    const pts = project(chartBars);
    const { path, length } = buildCurve(pts);
    const area = pts.length
      ? `${path} L ${pts[pts.length - 1].x} ${chartHeight - padV} L ${pts[0].x} ${chartHeight - padV} Z`
      : "";
    return { points: pts, curvePath: path, curveLength: length, areaPath: area };
  }, [chartBars, project]);

  const prevCurvePath = useMemo(() => {
    // Only worth drawing if the previous window actually had spending.
    if (!prevBars.some((b) => b.spend > 0)) return "";
    return buildCurve(project(prevBars)).path;
  }, [prevBars, project]);

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

  // The line draws itself in; the fill, ghost and dots fade up behind it.
  const drawProps = useAnimatedProps(() => ({
    strokeDashoffset: curveLength * (1 - chartProgress.value),
  }));
  const fadeUpStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, chartProgress.value * 1.6 - 0.6),
  }));

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
    const list: { icon: keyof typeof Feather.glyphMap; text: string }[] = [];
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
          icon: change >= 0 ? "trending-up" : "trending-down",
          text: `You spent ${Math.abs(change).toFixed(0)}% ${change >= 0 ? "more" : "less"} on ${cat} this month vs last month`,
        });
      }
    }

    // 2. Biggest single expense
    if (monthExp.length > 0) {
      const biggest = monthExp.reduce((a, b) =>
        Math.abs(parseFloat(b.amount) || 0) > Math.abs(parseFloat(a.amount) || 0) ? b : a);
      list.push({
        icon: "zap",
        text: `Your biggest single expense was GHS ${Math.abs(parseFloat(biggest.amount) || 0).toFixed(0)} on ${biggest.description || biggest.category}`,
      });
    }

    // 3. Budgets on track
    if (budgetPerformance.length > 0) {
      const onTrack = budgetPerformance.filter((b: any) => (parseFloat(b.percentage) || 0) < 100).length;
      list.push({
        icon: onTrack === budgetPerformance.length ? "check-circle" : "target",
        text: `You are on track with ${onTrack} out of ${budgetPerformance.length} budget${budgetPerformance.length === 1 ? "" : "s"}`,
      });
    }

    // 4. MoMo spending this month
    const momoExp = monthExp.filter((e) => e.paymentMethod === "MOMO");
    if (momoExp.length > 0) {
      const momoTotal = momoExp.reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
      list.push({
        icon: "smartphone",
        text: `Your MoMo spending this month: GHS ${momoTotal.toFixed(0)} (${momoExp.length} transaction${momoExp.length === 1 ? "" : "s"})`,
      });
    }

    // 5. Bills due in the next 7 days
    if (upcomingBills.length > 0) {
      const billTotal = upcomingBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
      list.push({
        icon: "bell",
        text: `You have ${upcomingBills.length} bill${upcomingBills.length === 1 ? "" : "s"} due in the next 7 days${billTotal > 0 ? ` totalling GHS ${billTotal.toFixed(0)}` : ""}`,
      });
    }

    return list;
  }, [expenses, report, budgetPerformance, upcomingBills, selectedMonth, selectedYear]);

  function budgetColor(pct: number) {
    if (pct >= 100) return colors.negative;
    if (pct >= 80) return colors.warning;
    return colors.positive;
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
  );

  // ── Month navigation header (shown in every state) ────────────────────────
  const header = (
    <>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={goToPreviousMonth}
          style={[styles.navArrow, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Feather name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }} accessibilityRole="header">
          <Text style={[typography.title, { color: colors.text }]}>{selectedMonthName}</Text>
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: 1 }]}>{selectedYear}</Text>
        </View>

        <TouchableOpacity
          onPress={goToNextMonth}
          style={[
            styles.navArrow,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, opacity: isCurrentMonth ? 0.35 : 1 },
          ]}
          disabled={isCurrentMonth}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: isCurrentMonth }}
        >
          <Feather name="chevron-right" size={22} color={colors.text} />
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
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${MONTH_NAMES[d.month]} ${d.year}`}
              accessibilityState={{ selected: active }}
            >
              <View
                style={[
                  styles.monthDot,
                  { backgroundColor: active ? colors.primary : colors.neutralBg, borderColor: colors.borderSubtle },
                ]}
              />
              <Text style={[typography.caption, { color: active ? colors.primary : colors.textSecondary }]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !report) {
    return (
      <Screen refreshControl={refreshControl}>
        {header}
        <EmptyState
          icon="alert-circle"
          title="Couldn't load your report"
          body={error}
          ctaLabel="Try again"
          onPressCta={() => fetchReportAndExpenses(selectedMonth, selectedYear, true)}
        />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={refreshControl}>
      {header}

      {loading && !refreshing ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={168} borderRadius={radius.xl} />
          <SkeletonCard height={180} />
          <SkeletonCard height={140} />
        </View>
      ) : (
        <Animated.View style={contentStyle}>
          {/* ── Section 2: Hero spending card ── */}
          <LinearGradient
            colors={[colors.heroGradientFrom, colors.heroGradientTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={[typography.label, styles.heroLabel, { color: colors.onHeroDim }]}>TOTAL SPENT</Text>
            <AmountText value={heroStats.currentTotal} size="displayLarge" color={colors.onHero} animate />

            {heroStats.previousTotal > 0 ? (
              <View style={styles.heroCompareRow}>
                <Feather
                  name={heroStats.pctChange > 0 ? "arrow-up-right" : "arrow-down-right"}
                  size={14}
                  color={colors.onHero}
                />
                <Text style={[typography.label, { color: colors.onHero }]}>
                  {Math.abs(heroStats.pctChange).toFixed(0)}% vs last month
                </Text>
              </View>
            ) : (
              <Text style={[typography.label, { color: colors.onHeroDim, marginTop: spacing.sm }]}>
                First month of tracking
              </Text>
            )}

            <View style={styles.heroChipsRow}>
              <View style={[styles.heroChip, { backgroundColor: colors.heroChipBg }]}>
                <Feather name="pie-chart" size={12} color={colors.onHero} />
                <Text style={[typography.caption, { color: colors.onHero }]}>
                  {heroStats.catCount} categor{heroStats.catCount === 1 ? "y" : "ies"}
                </Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: colors.heroChipBg }]}>
                <Feather name="file-text" size={12} color={colors.onHero} />
                <Text style={[typography.caption, { color: colors.onHero }]}>
                  {heroStats.monthTxCount} expense{heroStats.monthTxCount === 1 ? "" : "s"}
                </Text>
              </View>
              {heroStats.topCat && (
                <View style={[styles.heroChip, { backgroundColor: colors.heroChipBg, maxWidth: 160 }]}>
                  <Feather name="award" size={12} color={colors.onHero} />
                  <Text style={[typography.caption, { color: colors.onHero }]} numberOfLines={1}>
                    Top: {heroStats.topCat}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>

          {/* ── Spending insights (horizontal scroll) ── */}
          {insights.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.insightsScroll}
              contentContainerStyle={styles.insightsRow}
            >
              {insights.map((insight, idx) => (
                <Animated.View
                  key={insight.text}
                  entering={FadeInDown.duration(duration.base).delay(staggerDelay(idx)).easing(easing.decelerate)}
                >
                  <Card elevation="raised" padded={false} style={styles.insightCard}>
                    <Feather name={insight.icon} size={18} color={colors.primary} />
                    <Text style={[typography.caption, { color: colors.text, lineHeight: 17 }]}>{insight.text}</Text>
                  </Card>
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {/* ── Section 3: Interactive spending chart ── */}
          <Card elevation="raised" style={styles.section}>
            <View style={styles.chartHeaderRow}>
              <SectionHeader title="Spending trend" style={{ marginBottom: 0, flex: 1 }} />

              {/* Segmented pill control */}
              <View style={[styles.segment, { backgroundColor: colors.neutralBg }]}>
                {TIMELINES.map((f) => {
                  const active = chartTimeline === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.segmentBtn, active && { backgroundColor: colors.primary }]}
                      onPress={() => setChartTimeline(f)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Show by ${f}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[typography.caption, { color: active ? colors.onPrimary : colors.textSecondary }]}
                      >
                        {TIMELINE_LABEL[f]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ height: chartHeight, position: "relative", marginTop: spacing.sm }}>
              {/* Grid, area fill, ghost comparison and curve — one SVG */}
              <Svg width={chartWidth} height={chartHeight}>
                <Defs>
                  <SvgGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
                    <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
                  </SvgGradient>
                </Defs>

                {[padV, chartHeight / 2, chartHeight - padV].map((y, i) => (
                  <Line
                    key={`grid-${i}`}
                    x1={0}
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke={colors.borderSubtle}
                    strokeWidth={1}
                  />
                ))}

                {!!areaPath && <Path d={areaPath} fill="url(#spendFill)" />}

                {/* Previous period, behind and dimmed */}
                {!!prevCurvePath && (
                  <Path
                    d={prevCurvePath}
                    stroke={colors.textTertiary}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    strokeOpacity={0.65}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}

                {!!curvePath && (
                  <AnimatedPath
                    d={curvePath}
                    stroke={colors.primary}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={curveLength}
                    animatedProps={drawProps}
                  />
                )}
              </Svg>

              {/* Y-axis labels */}
              {[{ top: padV, val: maxSpendVal }, { top: chartHeight / 2, val: maxSpendVal / 2 }, { top: chartHeight - padV, val: 0 }].map((g, i) => (
                <Text
                  key={`y-${i}`}
                  style={[typography.caption, styles.yLabel, { top: g.top - 14, color: colors.textSecondary }]}
                >
                  {formatGhs(g.val)}
                </Text>
              ))}

              {/* Tappable data points — fade up once the line has drawn */}
              {points.map((point, idx) => (
                <Animated.View key={`dot-${idx}`} style={[styles.dotTouch, { left: point.x - 14, top: point.y - 14 }, fadeUpStyle]}>
                  <TouchableOpacity
                    onPress={() => setSelectedPoint(selectedPoint === idx ? null : idx)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${point.dateLabel}: GHS ${point.spend.toFixed(2)}`}
                    hitSlop={6}
                  >
                    <View
                      style={[
                        styles.chartDot,
                        { backgroundColor: colors.surfaceElevated, borderColor: colors.primary },
                        selectedPoint === idx && { backgroundColor: colors.primary },
                      ]}
                    />
                  </TouchableOpacity>
                </Animated.View>
              ))}

              {/* Tooltip — inverse surface so it reads in both themes */}
              {selectedPoint !== null && points[selectedPoint] && (
                <View
                  style={[
                    styles.tooltip,
                    {
                      backgroundColor: colors.text,
                      left: Math.min(Math.max(points[selectedPoint].x - 55, 0), chartWidth - 110),
                      top: Math.max(points[selectedPoint].y - 52, 0),
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={[typography.caption, { color: colors.background }]}>
                    {points[selectedPoint].dateLabel}
                  </Text>
                  <Text style={[typography.label, { color: colors.background }]}>
                    GHS {points[selectedPoint].spend.toFixed(2)}
                  </Text>
                </View>
              )}

            </View>

            {/* Legend — only shown when there's a comparison to explain */}
            {!!prevCurvePath && (
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>This period</Text>
                </View>
                <View style={styles.chartLegendItem}>
                  <View style={[styles.legendSwatchDashed, { borderColor: colors.textTertiary }]} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Previous</Text>
                </View>
              </View>
            )}

            {/* X labels */}
            <View style={styles.xLabelsRow}>
              {points.map((point, idx) => (
                <View key={`x-${idx}`} style={[styles.xLabelCol, { left: point.x - 20 }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{point.day}</Text>
                </View>
              ))}
            </View>

            {/* Min / Max / Avg chips */}
            <View style={styles.statChipsRow}>
              {([
                ["MIN", chartStats.min],
                ["MAX", chartStats.max],
                ["AVG", chartStats.avg],
              ] as const).map(([label, val]) => (
                <View key={label} style={[styles.statChip, { backgroundColor: colors.neutralBg }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                  <Text style={[typography.label, { color: colors.text }]}>{formatGhs(val)}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* ── Section 4: Category breakdown ── */}
          {breakdown.entries.length > 0 && (
            <Card elevation="raised" style={styles.section}>
              <SectionHeader title="Category breakdown" style={{ marginBottom: spacing.lg }} />
              {visibleCats.map((entry, index) => (
                <CategoryRow
                  key={`${entry.cat}-${selectedMonth}-${selectedYear}`}
                  cat={entry.cat}
                  amount={entry.amount}
                  pct={breakdown.total > 0 ? (entry.amount / breakdown.total) * 100 : 0}
                  index={index}
                  customEmoji={getCustomEmoji(entry.cat)}
                />
              ))}
              {breakdown.entries.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAllCats(!showAllCats)}
                  activeOpacity={0.7}
                  style={styles.showAllBtn}
                  accessibilityRole="button"
                >
                  <Text style={[typography.label, { color: colors.primary }]}>
                    {showAllCats ? "Show less" : `Show all (${breakdown.entries.length})`}
                  </Text>
                  <Feather name={showAllCats ? "chevron-up" : "chevron-down"} size={15} color={colors.primary} />
                </TouchableOpacity>
              )}
            </Card>
          )}

          {/* ── Section 5: Budget performance grid ── */}
          <Card elevation="raised" style={styles.section}>
            <SectionHeader title="Budget performance" style={{ marginBottom: spacing.lg }} />
            {budgetPerformance.length === 0 ? (
              <EmptyState
                icon="target"
                title="No budgets set yet"
                body="Set monthly limits per category to track your spending against them here."
                ctaLabel="Set budgets"
                onPressCta={() => router.push("/(tabs)/budget")}
              />
            ) : (
              <View style={styles.budgetGrid}>
                {budgetPerformance.map((item: any, idx: number) => {
                  const pct = parseFloat(item.percentage) || 0;
                  const color = budgetColor(pct);
                  const status = pct >= 100
                    ? { label: "Over budget", color: colors.negative }
                    : pct >= 80
                    ? { label: "Near limit", color: colors.warning }
                    : { label: "On track", color: colors.positive };
                  return (
                    <Animated.View
                      key={item.category}
                      entering={FadeInDown.duration(duration.base).delay(staggerDelay(idx)).easing(easing.decelerate)}
                      style={[styles.budgetCard, { backgroundColor: colors.neutralBg, borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.budgetCardTitleRow}>
                        <MaterialCommunityIcons name={getCategoryIconName(item.category)} size={13} color={colors.text} />
                        <Text style={[typography.label, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                          {item.category}
                        </Text>
                      </View>
                      <Donut pct={pct} color={color} size={78} trackColor={colors.borderSubtle} />
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        GHS {(parseFloat(item.spent) || 0).toFixed(0)} of GHS {(parseFloat(item.limit) || 0).toFixed(0)}
                      </Text>
                      <View
                        style={[
                          styles.budgetStatusBadge,
                          { backgroundColor: `${status.color}1A`, borderColor: `${status.color}40` },
                        ]}
                      >
                        <Text style={[typography.caption, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </Card>
        </Animated.View>
      )}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — layout only. Every color and type value comes from theme/ at render.
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  dotTap: { alignItems: "center", gap: spacing.xs, paddingHorizontal: 6, paddingVertical: 2 },
  monthDot: { width: 8, height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },

  // Hero card
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  heroLabel: { letterSpacing: 1.5, marginBottom: spacing.sm },
  heroCompareRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  heroChipsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.lg },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },

  section: { marginBottom: spacing.lg },

  // Insights
  insightsScroll: { marginBottom: spacing.lg, marginHorizontal: -spacing.lg },
  insightsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm + 2 },
  insightCard: { width: 230, padding: spacing.md, gap: spacing.sm },

  // Chart
  chartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  segment: { flexDirection: "row", borderRadius: radius.md + 6, padding: 3 },
  segmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md + 3,
    alignItems: "center",
    justifyContent: "center",
  },
  yLabel: { position: "absolute", right: 0 },
  dotTouch: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  chartDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.5 },
  tooltip: {
    position: "absolute",
    width: 110,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    zIndex: 10,
  },
  chartLegend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  chartLegendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendSwatchDashed: { width: 14, height: 0, borderTopWidth: 2, borderStyle: "dashed" },
  xLabelsRow: { position: "relative", height: 18, marginTop: spacing.sm },
  xLabelCol: { position: "absolute", width: 40, alignItems: "center" },
  statChipsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  statChip: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center", gap: 2 },

  // Categories
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  catLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, flex: 1, marginRight: spacing.sm + 2 },
  showAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingTop: spacing.xs },

  // Budget grid
  budgetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.md,
  },
  budgetCard: {
    width: "48.5%",
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  budgetCardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%" },
  budgetStatusBadge: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
});
