import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import {
  getExtendedColors,
  getCategoryColor,
  typography,
  spacing,
  radius,
  duration,
  easing,
  staggerDelay,
} from '../../theme';
import { AmountText } from '../ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 200;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Arc-length gap between segments, in px along the circumference. */
const GAP = 4;

interface Segment {
  category: string;
  amount: number;
  fraction: number;
  startFraction: number;
  color: string;
}

interface RingSegmentProps {
  segment: Segment;
  index: number;
  dimmed: boolean;
  onPress: () => void;
}

/**
 * One arc of the ring. Each segment owns its own shared values — a single
 * shared value driving a `.map()` would put hooks inside a loop.
 */
function RingSegment({ segment, index, dimmed, onPress }: RingSegmentProps) {
  const draw = useSharedValue(0);
  const dim = useSharedValue(0);

  useEffect(() => {
    draw.value = 0;
    draw.value = withDelay(
      staggerDelay(index, 70),
      withTiming(1, { duration: duration.slow, easing: easing.decelerate }),
    );
  }, [segment.fraction, index]);

  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: duration.fast, easing: easing.standard });
  }, [dimmed]);

  const animatedProps = useAnimatedProps(() => {
    const full = segment.fraction * CIRCUMFERENCE;
    // Never let the gap eat a hairline segment entirely — it would vanish.
    const len = Math.max(full - GAP, 1) * draw.value;
    return {
      strokeDasharray: [len, CIRCUMFERENCE - len],
      opacity: 1 - dim.value * 0.72,
    };
  });

  return (
    <AnimatedCircle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      stroke={segment.color}
      strokeWidth={STROKE}
      strokeLinecap="butt"
      fill="none"
      animatedProps={animatedProps}
      transform={`rotate(${segment.startFraction * 360 - 90} ${SIZE / 2} ${SIZE / 2})`}
      onPress={onPress}
    />
  );
}

interface SpendingRingProps {
  /** category name -> total spent. Rendered largest-first. */
  categoryTotals: { [category: string]: number };
  /** Emoji for a user-created custom category, looked up by name. */
  getCustomEmoji?: (category: string) => string | undefined;
}

/**
 * "Where your money went" — one donut segmented by category, total in the
 * middle. Tapping a segment (or its legend chip) swaps the centre figure to
 * that category; tapping again returns to the total.
 */
export function SpendingRing({ categoryTotals }: SpendingRingProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [selected, setSelected] = useState<string | null>(null);

  const { segments, total } = useMemo(() => {
    const entries = Object.entries(categoryTotals)
      .map(([category, amount]) => ({ category, amount: Math.abs(amount) }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const sum = entries.reduce((s, e) => s + e.amount, 0);
    let running = 0;
    const segs: Segment[] = entries.map((e) => {
      const fraction = sum > 0 ? e.amount / sum : 0;
      const seg: Segment = {
        category: e.category,
        amount: e.amount,
        fraction,
        startFraction: running,
        color: getCategoryColor(e.category),
      };
      running += fraction;
      return seg;
    });
    return { segments: segs, total: sum };
  }, [categoryTotals]);

  if (segments.length === 0) return null;

  const active = selected ? segments.find((s) => s.category === selected) ?? null : null;

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          {/* Track — keeps the ring readable when one category dominates */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.neutralBg}
            strokeWidth={STROKE}
            fill="none"
          />
          {segments.map((segment, index) => (
            <RingSegment
              key={segment.category}
              segment={segment}
              index={index}
              dimmed={!!selected && selected !== segment.category}
              onPress={() => setSelected(selected === segment.category ? null : segment.category)}
            />
          ))}
        </Svg>

        {/* Centre readout — crossfades when the selection changes */}
        <View style={styles.centre} pointerEvents="none">
          <Animated.View key={active?.category ?? 'total'} entering={FadeIn.duration(duration.fast)} style={styles.centreInner}>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {active ? active.category.toUpperCase() : 'TOTAL SPENT'}
            </Text>
            <AmountText value={active ? active.amount : total} size="display" />
            {active && (
              <Text style={[typography.caption, { color: active.color }]}>
                {(active.fraction * 100).toFixed(0)}% of spending
              </Text>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Legend — the reliable tap target; the arcs are thin on small screens */}
      <View style={styles.legend}>
        {segments.map((segment) => {
          const isActive = selected === segment.category;
          return (
            <Pressable
              key={segment.category}
              onPress={() => setSelected(isActive ? null : segment.category)}
              style={[
                styles.legendChip,
                {
                  backgroundColor: isActive ? `${segment.color}24` : colors.neutralBg,
                  borderColor: isActive ? segment.color : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${segment.category}, GHS ${segment.amount.toFixed(2)}, ${(segment.fraction * 100).toFixed(0)} percent of spending`}
            >
              <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
              <Text style={[typography.caption, { color: isActive ? colors.text : colors.textSecondary }]}>
                {segment.category}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {(segment.fraction * 100).toFixed(0)}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.lg },
  centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  centreInner: { alignItems: 'center', gap: 2, paddingHorizontal: spacing.xl },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
