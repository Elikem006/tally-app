import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function BudgetOverviewScreen() {
  const [summary, setSummary] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [])
  );

  async function fetchSummary() {
    setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const response = await budgetAPI.getBudgetSummary(userId);
      setSummary(response.data || {});
    } catch (err: any) {
      console.log('Error fetching budget summary:', err);
      setError('Failed to load budget summary. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function getBarColor(isOverBudget: boolean, isNearLimit: boolean) {
    if (isOverBudget) return '#FF3B30'; // Red
    if (isNearLimit) return '#FF9500'; // Orange
    return '#8B5CF6'; // Violet / Purple
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSummary}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (Object.keys(summary).length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIconCircle}>
          <Text style={styles.emptyIcon}>📊</Text>
        </View>
        <Text style={styles.emptyText}>No budgets set yet</Text>
        <Text style={styles.emptySubtext}>Set your monthly limits first to track overview statistics</Text>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => router.push('/(tabs)/budget')}
        >
          <Text style={styles.setupButtonText}>Set Up Budgets</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>Budget Overview</Text>
        <Text style={styles.subtitle}>
          Your spending this month vs your limits
        </Text>

        {Object.entries(summary).map(([category, data]: [string, any]) => {
          const percentage = Math.min(data.percentage, 100);
          const barColor = getBarColor(data.isOverBudget, data.isNearLimit);

          return (
            <View key={category} style={styles.categoryCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLeft}>
                  <View style={styles.iconCircle}>
                    <Text style={styles.icon}>{CATEGORY_ICONS[category] || '📦'}</Text>
                  </View>
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

              <Text style={[
                styles.remaining,
                data.isOverBudget && styles.remainingOver
              ]}>
                {data.isOverBudget
                  ? `GHS ${(parseFloat(data.spent) - parseFloat(data.limit)).toFixed(2)} over budget`
                  : `GHS ${(parseFloat(data.limit) - parseFloat(data.spent)).toFixed(2)} remaining`}
              </Text>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push('/(tabs)/budget')}
          activeOpacity={0.85}
        >
          <Text style={styles.editButtonText}>Edit Budgets</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E9AA6',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  setupButton: {
    backgroundColor: '#111111',
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  setupButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // White container card
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 24,
  },
  categoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  warningBadge: {
    backgroundColor: '#FF3B3012',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  warningText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
  },
  nearBadge: {
    backgroundColor: '#FF950012',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  nearText: {
    color: '#FF9500',
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#F2F4F7',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  percentage: {
    fontSize: 12,
    fontWeight: 'bold',
    width: 36,
    textAlign: 'right',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  spentText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
  },
  limitText: {
    fontSize: 13,
    color: '#8E9AA6',
  },
  remaining: {
    fontSize: 12,
    color: '#8E9AA6',
    marginTop: 2,
  },
  remainingOver: {
    color: '#FF3B30',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#111111', // Black rounded button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
