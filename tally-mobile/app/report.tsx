import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reportAPI } from "../services/api";
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

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  function statusColor(status: string) {
    if (status === "over") return "#FF3B30";
    if (status === "warning") return "#FF9500";
    return "#34C759";
  }

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
    width: 120 
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
    marginLeft: 10, 
    gap: 4 
  },
  barTrack: {
    height: 8,
    backgroundColor: "#F2F4F7",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill: { 
    height: "100%", 
    backgroundColor: "#111111", 
    borderRadius: 4 
  },
  breakdownAmount: { 
    fontSize: 12, 
    color: "#8E9AA6", 
    fontWeight: "600",
    textAlign: "right" 
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
});
