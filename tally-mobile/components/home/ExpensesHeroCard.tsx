import { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, easing, duration } from '../../theme';
import { AmountText, ProgressBar } from '../ui';

/** Beat of stillness between the amount settling and the highlight crossing. */
const SWEEP_HOLD_MS = 180;

interface ExpensesHeroCardProps {
  totalSpent: number;
  totalIncome: number;
  totalBudget: number;
  remaining: number;
  transactionCount: number;
}

/**
 * The dashboard's headline card — total spend, transaction count, budget
 * progress. Shares the hero gradient tokens with the report screen's hero so
 * the app has one hero treatment rather than two that disagree.
 *
 * On first paint the amount counts up and a single specular band sweeps
 * across the card. The sweep runs once on mount, not on a loop: a repeating
 * shimmer reads as a loading skeleton, a single pass reads as material.
 */
export function ExpensesHeroCard({ totalSpent, totalIncome, totalBudget, remaining, transactionCount }: ExpensesHeroCardProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { width: screenWidth } = useWindowDimensions();

  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = 0;
    // Sequenced, not simultaneous, and with a real gap between the two.
    //
    // The card enters and the amount counts up over the same 0–350ms. The
    // sweep previously started at exactly 350ms, so it began while the eye
    // was still resolving the settling digits — the number never quite
    // landed and the sweep never quite registered as its own gesture. It
    // also ran 900ms, nearly three times the app's slowest duration token,
    // so it drifted rather than passed.
    //
    // Now the amount settles, the card holds still for a beat, and only then
    // does the highlight cross it: information first, finish second.
    sweep.value = withDelay(
      duration.slow + SWEEP_HOLD_MS,
      withTiming(1, { duration: 620, easing: easing.standard }),
    );
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: sweep.value > 0 && sweep.value < 1 ? 1 : 0,
    transform: [{ translateX: -screenWidth + sweep.value * (screenWidth * 2) }, { rotate: '18deg' }],
  }));

  return (
    <LinearGradient
      colors={[colors.heroGradientFrom, colors.heroGradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Depth: two soft blooms behind the content */}
      <View style={[styles.bloomTop, { backgroundColor: colors.onHero }]} />
      <View style={[styles.bloomBottom, { backgroundColor: colors.accent }]} />

      {/* One-pass specular sweep */}
      <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', colors.heroChipBg, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Text style={[typography.label, { color: colors.onHeroDim, marginBottom: spacing.xs }]}>
        YOUR EXPENSES
      </Text>

      <AmountText
        value={totalSpent}
        size="displayLarge"
        color={colors.onHero}
        animate
        style={{ marginBottom: spacing.md }}
      />

      <View style={styles.trendRow}>
        <View style={[styles.trendBadge, { backgroundColor: colors.heroChipBg }]}>
          <Text style={[typography.caption, { color: colors.onHero, fontFamily: typography.bodyStrong.fontFamily }]}>
            {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
          </Text>
        </View>
        {totalIncome > 0 && (
          <View style={[styles.trendBadge, { backgroundColor: `${colors.positive}30` }]}>
            <Text style={[typography.caption, { color: colors.onHero, fontFamily: typography.bodyStrong.fontFamily }]}>
              +GHS {totalIncome.toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {totalBudget > 0 && (
        <>
          <ProgressBar percentage={(totalSpent / totalBudget) * 100} style={{ marginBottom: spacing.sm }} />
          <View style={styles.budgetStatsRow}>
            <Text style={[typography.caption, { color: colors.onHeroDim, fontFamily: typography.bodyStrong.fontFamily }]}>
              Budget: GHS {totalBudget.toLocaleString()}
            </Text>
            <Text style={[typography.caption, { color: colors.onHero, fontFamily: typography.bodyStrong.fontFamily }]}>
              {remaining >= 0
                ? `Remaining: GHS ${remaining.toLocaleString()}`
                : `Overspent: GHS ${Math.abs(remaining).toLocaleString()}`}
            </Text>
          </View>
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl + 8,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  bloomTop: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.09,
    top: -120,
    right: -80,
  },
  bloomBottom: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.14,
    bottom: -90,
    left: -40,
  },
  sweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 110,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  trendBadge: {
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
