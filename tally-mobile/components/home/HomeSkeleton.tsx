import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, spacing, radius } from '../../theme';
import { Skeleton } from '../ui';

/**
 * Placeholder for the dashboard body, shaped like the real thing: hero card,
 * wallet card, chart, then a couple of rows. Home previously showed a bare
 * centred spinner on an otherwise empty screen, so the first frame of the
 * app carried no layout information at all and everything arrived in one
 * jump once data landed.
 *
 * Matching the real block sizes matters more than matching the detail — what
 * makes the swap feel continuous is that nothing changes size or position
 * when content replaces it.
 */
export function HomeSkeleton() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Hero card */}
      <Skeleton height={196} borderRadius={radius.xl + 8} style={{ marginBottom: spacing.lg }} />

      {/* MoMo wallet card */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
        ]}
      >
        <Skeleton width="55%" height={15} />
        <Skeleton width="40%" height={30} borderRadius={radius.sm} />
        <Skeleton width="70%" height={12} />
      </View>

      {/* Spending chart */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
        ]}
      >
        <Skeleton width="45%" height={15} />
        <Skeleton width="100%" height={110} borderRadius={radius.md} />
      </View>

      {/* Two transaction rows */}
      {[0, 1].map((i) => (
        <View
          key={i}
          style={[
            styles.row,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
          ]}
        >
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width="65%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={62} height={16} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
