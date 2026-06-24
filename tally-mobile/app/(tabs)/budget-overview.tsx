import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { budgetAPI } from "../../services/api";
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
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let notificationsSent = false;

      async function load() {
        try {
          const userId = getUserId();
          const response = await budgetAPI.getBudgetSummary(userId);
          setSummary(response.data);

          if (!notificationsSent) {
            notificationsSent = true;
            const data = response.data;
            for (const category in data) {
              if (data[category].isNearLimit || data[category].isOverBudget) {
                await notifyBudgetWarning(category, data[category].percentage);
              }
            }
          }
        } catch (error) {
          console.log("Error fetching budget summary:", error);
        } finally {
          setLoading(false);
        }
      }

      load();
    }, []),
  );

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

  if (Object.keys(summary).length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>No budgets set yet</Text>
        <Text style={styles.emptySubtext}>Set your monthly limits first</Text>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => router.push("/(tabs)/budget")}
        >
          <Text style={styles.setupButtonText}>Set Up Budgets</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Budget Overview</Text>
      <Text style={styles.subtitle}>
        Your spending this month vs your limits
      </Text>

      {Object.entries(summary).map(([category, data]: [string, any]) => {
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
        style={styles.editButton}
        onPress={() => router.push("/(tabs)/budget")}
      >
        <Text style={styles.editButtonText}>Edit Budgets</Text>
      </TouchableOpacity>
    </ScrollView>
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
    padding: 24,
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
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
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
  editButton: {
    borderWidth: 1,
    borderColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  editButtonText: {
    color: "#00C896",
    fontSize: 15,
    fontWeight: "600",
  },
});
