import { useEffect } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { radius } from '../../theme/spacing';
import { duration, easing } from '../../theme/motion';

interface ProgressBarProps {
  /** 0–100+. Values above 100 clamp the fill but the color still reflects over-budget. */
  percentage: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Animated fill that shifts color at 80% (warning) and 100%+ (danger) —
 * used for budget category cards and the total-health ring's linear cousin.
 */
export function ProgressBar({ percentage, height = 8, style }: ProgressBarProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const clamped = Math.min(Math.max(percentage, 0), 100);

  const widthProgress = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    widthProgress.value = withTiming(clamped, { duration: duration.slow, easing: easing.decelerate });
    // 0 = positive, 1 = warning (80%), 2 = danger (100%)
    const colorTarget = percentage >= 100 ? 2 : percentage >= 80 ? 1 : 0;
    colorProgress.value = withTiming(colorTarget, { duration: duration.base, easing: easing.standard });
  }, [clamped, percentage]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthProgress.value}%`,
    backgroundColor: interpolateColor(colorProgress.value, [0, 1, 2], [colors.positive, colors.warning, colors.negative]),
  }));

  return (
    <View
      style={[{ height, borderRadius: radius.pill, backgroundColor: colors.neutralBg, overflow: 'hidden' }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Animated.View style={[{ height: '100%', borderRadius: radius.pill }, fillStyle]} />
    </View>
  );
}
