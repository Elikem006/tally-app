import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '../hooks/useTheme';

/**
 * Shimmering placeholder shown while lists load (skeleton loading,
 * like Revolut/Splitwise) — a grey rounded rectangle pulsing 0.3 → 0.7.
 */
export default function SkeletonItem({
  width = '100%',
  height = 72,
  borderRadius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: colors.neutralBg, opacity },
        style,
      ]}
    />
  );
}

/** Fake expense card: avatar circle + two text bars + amount bar. */
export function SkeletonExpenseItem() {
  const { colors } = useTheme();
  return (
    <View style={[styles.expenseRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <SkeletonItem width={40} height={40} borderRadius={20} />
      <View style={styles.expenseMiddle}>
        <SkeletonItem width="70%" height={14} borderRadius={7} />
        <SkeletonItem width="45%" height={11} borderRadius={6} style={{ marginTop: 8 }} />
      </View>
      <SkeletonItem width={64} height={16} borderRadius={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  expenseMiddle: {
    flex: 1,
  },
});
