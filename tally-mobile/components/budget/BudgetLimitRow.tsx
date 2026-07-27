import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';
import { CategoryIcon } from '../ui';

interface BudgetLimitRowProps {
  category: string;
  /** User-chosen emoji for a custom category — ignored for built-ins. */
  customEmoji?: string;
  spent: number;
  value: string;
  onChangeValue: (v: string) => void;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** One category's editable monthly limit row in the Budget Setup tab. */
export function BudgetLimitRow({ category, customEmoji, spent, value, onChangeValue, index = 0 }: BudgetLimitRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [focused, setFocused] = useState(false);

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[styles.capsule, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
    >
      <View style={styles.left}>
        <CategoryIcon category={category} customEmoji={customEmoji} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyCompact, { color: colors.text }]}>{category}</Text>
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
            Spent: GHS {spent.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: focused ? colors.primary : colors.border }]}>
        <Text style={[typography.label, { color: colors.textSecondary, marginRight: spacing.xs }]}>GHS</Text>
        <TextInput
          style={[typography.bodyStrong, { color: colors.text, width: 60, padding: 0, textAlign: 'right' }]}
          placeholder="0.00"
          placeholderTextColor={colors.textTertiary}
          value={value}
          onChangeText={onChangeValue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="decimal-pad"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    marginRight: spacing.md,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    height: 40,
  },
});
