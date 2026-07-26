import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';
import { ProgressBar } from '../ui';

interface BudgetCategoryCardProps {
  category: string;
  icon: string;
  spent: number;
  limit: number;
  percentage: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** One category's spend-vs-limit card in the Budget Overview tab. */
export function BudgetCategoryCard({ category, icon, spent, limit, percentage, isOverBudget, isNearLimit, index = 0 }: BudgetCategoryCardProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const barColor = isOverBudget ? colors.negative : isNearLimit ? colors.warning : colors.positive;

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
    >
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={[styles.iconCircle, { backgroundColor: colors.neutralBg }]}>
            <Text style={{ fontSize: 18 }}>{icon}</Text>
          </View>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{category}</Text>
        </View>

        {isOverBudget && (
          <View style={[styles.badge, { backgroundColor: `${colors.negative}12`, borderColor: `${colors.negative}30` }]}>
            <Text style={[typography.label, { color: colors.negative }]}>Over!</Text>
          </View>
        )}
        {isNearLimit && !isOverBudget && (
          <View style={[styles.badge, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}30` }]}>
            <Text style={[typography.label, { color: colors.warning }]}>Near limit</Text>
          </View>
        )}
      </View>

      <View style={styles.progressRow}>
        <ProgressBar percentage={percentage} style={{ flex: 1 }} />
        <Text style={[typography.bodyStrong, { color: barColor, width: 36, textAlign: 'right' }]}>{percentage.toFixed(0)}%</Text>
      </View>

      <View style={styles.amountRow}>
        <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>
          GHS {spent.toFixed(2)} spent
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>of GHS {limit.toFixed(2)}</Text>
      </View>

      <Text style={[typography.caption, { color: isOverBudget ? colors.negative : colors.textSecondary, marginTop: 2, fontFamily: typography.bodyStrong.fontFamily }]}>
        {limit === 0
          ? 'No budget limit set'
          : isOverBudget
            ? `GHS ${(spent - limit).toFixed(2)} over budget`
            : `GHS ${(limit - spent).toFixed(2)} remaining`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs + 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
