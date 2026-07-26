import { useEffect } from 'react';
import { View, StyleSheet, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { radius, spacing } from '../../theme/spacing';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A moving-highlight shimmer placeholder. Generalizes the old SkeletonItem
 * (opacity pulse) into the shared primitive every loading state should use —
 * previously only 2 of 21 screens had any skeleton at all; the other 19 used
 * a bare ActivityIndicator.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const translateX = useSharedValue(-1);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${translateX.value * 200}%` }],
  }));

  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: colors.neutralBg, overflow: 'hidden' },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient
          colors={theme === 'dark' ? ['transparent', 'rgba(255,255,255,0.06)', 'transparent'] : ['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** A fake expense/list row: avatar circle + two text bars + trailing amount bar. */
export function SkeletonRow({ style }: { style?: ViewStyle }) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        style,
      ]}
    >
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
      </View>
      <Skeleton width={56} height={16} />
    </View>
  );
}

/** A fake card — for budget/summary cards during load. */
export function SkeletonCard({ height = 120, style }: { height?: number; style?: ViewStyle }) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  return (
    <View
      style={[
        { backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
        style,
      ]}
    >
      <Skeleton width="50%" height={14} />
      <Skeleton width="80%" height={height * 0.4} borderRadius={radius.md} />
      <Skeleton width="30%" height={11} />
    </View>
  );
}
