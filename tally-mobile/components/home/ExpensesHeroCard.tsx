import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { AmountText, ProgressBar } from '../ui';

interface ExpensesHeroCardProps {
  totalSpent: number;
  totalIncome: number;
  totalBudget: number;
  remaining: number;
  transactionCount: number;
}

/** The dark hero card at the top of the dashboard — total spend, transaction count, budget progress. */
export function ExpensesHeroCard({ totalSpent, totalIncome, totalBudget, remaining, transactionCount }: ExpensesHeroCardProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const isDark = theme === 'dark';
  const heroBg = isDark ? colors.surfaceHigh : '#111318';

  return (
    <View style={[styles.card, { backgroundColor: heroBg }]}>
      <View style={[styles.radialCircle1, { backgroundColor: colors.primary }]} />
      <View style={[styles.radialCircle2, { backgroundColor: colors.accent }]} />
      <View style={[styles.radialCircle3, { backgroundColor: colors.negative }]} />

      <Text style={[typography.label, { color: colors.textTertiary, marginBottom: spacing.xs }]}>
        YOUR EXPENSES
      </Text>

      <AmountText value={totalSpent} size="displayLarge" color="#FFFFFF" style={{ marginBottom: spacing.md }} />

      <View style={styles.trendRow}>
        <View style={styles.trendBadge}>
          <Text style={[typography.caption, { color: '#FFFFFF', fontFamily: typography.bodyStrong.fontFamily }]}>
            {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
          </Text>
        </View>
        {totalIncome > 0 && (
          <View style={[styles.trendBadge, { backgroundColor: `${colors.positive}30` }]}>
            <Text style={[typography.caption, { color: colors.positive, fontFamily: typography.bodyStrong.fontFamily }]}>
              +GHS {totalIncome.toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {totalBudget > 0 && (
        <>
          <ProgressBar percentage={(totalSpent / totalBudget) * 100} style={{ marginBottom: spacing.sm }} />
          <View style={styles.budgetStatsRow}>
            <Text style={[typography.caption, { color: colors.textTertiary, fontFamily: typography.bodyStrong.fontFamily }]}>
              Budget: GHS {totalBudget.toLocaleString()}
            </Text>
            <Text style={[typography.caption, { color: '#FFFFFF', fontFamily: typography.bodyStrong.fontFamily }]}>
              {remaining >= 0
                ? `Remaining: GHS ${remaining.toLocaleString()}`
                : `Overspent: GHS ${Math.abs(remaining).toLocaleString()}`}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl + 8,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  radialCircle1: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.15,
    top: -120,
    right: -80,
  },
  radialCircle2: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.1,
    bottom: -90,
    left: -40,
  },
  radialCircle3: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    opacity: 0.05,
    top: 40,
    left: 80,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  trendBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  budgetStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
