import { ReactNode } from 'react';
import { Pressable, Text, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { duration, easing, pressScale } from '../../theme/motion';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Filter/selection chip — category filters, date-range picks, quick-add category row. */
export function Chip({ label, selected = false, onPress, icon, style }: ChipProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration: duration.fast, easing: easing.standard });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: duration.fast, easing: easing.standard });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.primary : colors.surfaceElevated,
          borderWidth: selected ? 0 : 1,
          borderColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    >
      {icon}
      <Text style={[typography.label, { color: selected ? colors.onPrimary : colors.textSecondary }]}>{label}</Text>
    </AnimatedPressable>
  );
}
