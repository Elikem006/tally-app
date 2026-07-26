import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';

interface SharedExpenseRowProps {
  title: string;
  subtitle: string;
  amount: string;
  amountColor: string;
  settled?: boolean;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** One shared-expense row — payer view, "your share" view, or the non-personalized fallback. */
export function SharedExpenseRow({ title, subtitle, amount, amountColor, settled, index = 0 }: SharedExpenseRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[styles.row, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
    >
      <View style={{ flex: 1, marginRight: spacing.sm + 2 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[typography.bodyStrong, { color: amountColor }]}>{amount}</Text>
        {settled && (
          <Text style={[typography.label, { color: colors.positive, marginTop: 2 }]}>Settled ✓</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
});
