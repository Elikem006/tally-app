import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Defs, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, duration, easing, spring } from '../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The Tally mark: a tally stroke group (four uprights + the diagonal that
 * closes a count of five) enclosed in a ring. It is the app's name rendered
 * literally — counting — rather than a generic wallet or coin, and it is
 * built from the same gradient tokens as the hero cards so the brand reads
 * as one system from the very first frame.
 *
 * `animate` draws the strokes on in sequence, then closes the ring. Used for
 * the cold open; everywhere else the mark renders statically.
 */

/** Total path length of one upright, used for the draw-on animation. */
const UPRIGHT_LEN = 46;
const DIAGONAL_LEN = 62;
const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

interface BrandMarkProps {
  size?: number;
  animate?: boolean;
  /** Delay before the draw-on begins, ms. */
  delay?: number;
}

function Stroke({ d, length, color, progress, width = 9 }: {
  d: string;
  length: number;
  color: string;
  progress: SharedValue<number>;
  width?: number;
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));

  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={length}
      animatedProps={animatedProps}
    />
  );
}

export function BrandMark({ size = 120, animate = false, delay = 0 }: BrandMarkProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  // One shared value per stroke so they can arrive in sequence.
  const s1 = useSharedValue(animate ? 0 : 1);
  const s2 = useSharedValue(animate ? 0 : 1);
  const s3 = useSharedValue(animate ? 0 : 1);
  const s4 = useSharedValue(animate ? 0 : 1);
  const s5 = useSharedValue(animate ? 0 : 1);
  const ring = useSharedValue(animate ? 0 : 1);
  const pop = useSharedValue(animate ? 0.82 : 1);

  useEffect(() => {
    if (!animate) return;
    const strokes = [s1, s2, s3, s4];
    strokes.forEach((s, i) => {
      s.value = withDelay(delay + i * 110, withTiming(1, { duration: 260, easing: easing.decelerate }));
    });
    // The fifth stroke is the diagonal that completes the count of five.
    s5.value = withDelay(delay + 4 * 110 + 60, withTiming(1, { duration: 300, easing: easing.decelerate }));
    ring.value = withDelay(delay + 40, withTiming(1, { duration: 900, easing: easing.decelerate }));
    pop.value = withDelay(delay + 4 * 110 + 60, withSpring(1, spring.gentle));
  }, [animate, delay]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - ring.value),
  }));

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    // The mark carries no information a screen-reader user needs — the
    // wordmark beneath it in BrandLockup, and each screen's own heading,
    // already say what this is. Hidden rather than announced as an unlabeled
    // graphic, matching how the empty-state illustrations are treated.
    <Animated.View
      style={[{ width: size, height: size }, popStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <Defs>
          <SvgGradient id="brandStroke" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.heroGradientFrom} />
            <Stop offset="1" stopColor={colors.heroGradientTo} />
          </SvgGradient>
        </Defs>

        {/* Enclosing ring, drawn in the brand gradient */}
        <AnimatedCircle
          cx={60}
          cy={60}
          r={54}
          stroke="url(#brandStroke)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={ringProps}
          transform="rotate(-90 60 60)"
        />

        {/* Four uprights */}
        <Stroke d="M40 37 L40 83" length={UPRIGHT_LEN} color={colors.primary} progress={s1} />
        <Stroke d="M53 37 L53 83" length={UPRIGHT_LEN} color={colors.primary} progress={s2} />
        <Stroke d="M66 37 L66 83" length={UPRIGHT_LEN} color={colors.primary} progress={s3} />
        <Stroke d="M79 37 L79 83" length={UPRIGHT_LEN} color={colors.primary} progress={s4} />

        {/* The closing diagonal — in accent, because it's the one that counts */}
        <Stroke d="M33 79 L86 41" length={DIAGONAL_LEN} color={colors.accent} progress={s5} width={9} />
      </Svg>
    </Animated.View>
  );
}

/** Mark + wordmark, stacked. The app's signature lockup. */
export function BrandLockup({ size = 120, animate = false, delay = 0 }: BrandMarkProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const textIn = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    textIn.value = withDelay(delay + 560, withTiming(1, { duration: duration.slow, easing: easing.decelerate }));
  }, [animate, delay]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateY: (1 - textIn.value) * 10 }],
  }));

  return (
    <View style={styles.lockup}>
      <BrandMark size={size} animate={animate} delay={delay} />
      <Animated.View style={[styles.wordmarkWrap, textStyle]}>
        {/* The cold-open screen's primary title. Carries the header role for
            the same reason every other screen title does since Phase 5 — with
            the mark itself now hidden, this is the only thing naming the
            screen. */}
        <Text
          style={[typography.display, { color: colors.text, letterSpacing: -0.5 }]}
          accessibilityRole="header"
        >
          Tally
        </Text>
        <Text style={[typography.label, { color: colors.textSecondary }]}>Every cedi accounted for</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', gap: spacing.lg },
  wordmarkWrap: { alignItems: 'center', gap: 2 },
});
