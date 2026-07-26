import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';

interface BudgetLimitRowProps {
  category: string;
  icon: string;
  spent: number;
  value: string;
  onChangeValue: (v: string) => void;
}

/** One category's editable monthly limit row in the Budget Setup tab. */
export function BudgetLimitRow({ category, icon, spent, value, onChangeValue }: BudgetLimitRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.capsule, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
      <View style={styles.left}>
        <View style={[styles.iconCircle, { backgroundColor: colors.neutralBg }]}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text, fontSize: 14 }]}>{category}</Text>
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
    </View>
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
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
