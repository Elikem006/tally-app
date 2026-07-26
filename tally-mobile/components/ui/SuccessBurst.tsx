import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, getCategoryColor, typography, spacing, easing, duration, spring } from '../../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const SIZE = 132;
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;
const CHECK_LEN = 60;
/** Rays fan out around the ring. Kept few and even — this is a confirmation, not confetti. */
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

interface SuccessBurstProps {
  visible: boolean;
  /** Drives the ring/ray color so the confirmation matches what was just logged. */
  category?: string;
  label: string;
  amountLabel: string;
  onDone: () => void;
}

function Ray({ angle, color, progress }: { angle: number; color: string; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const dist = 44 + p * 26;
    const rad = (angle * Math.PI) / 180;
    return {
      opacity: p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85),
      transform: [
        { translateX: Math.cos(rad) * dist },
        { translateY: Math.sin(rad) * dist },
        { scale: 0.4 + p * 0.6 },
      ],
    };
  });

  return <Animated.View style={[styles.ray, { backgroundColor: color }, style]} />;
}

/**
 * The confirmation shown after an expense lands: a ring closes, a check
 * draws, and eight rays fan out once. Non-blocking by design — it sits over
 * the screen, cannot be tapped through to, and dismisses itself. A modal
 * with an OK button would make the most-repeated action in the app one tap
 * slower every single time.
 */
export function SuccessBurst({ visible, category, label, amountLabel, onDone }: SuccessBurstProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const accent = category ? getCategoryColor(category) : colors.positive;

  const ring = useSharedValue(0);
  const check = useSharedValue(0);
  const rays = useSharedValue(0);
  const shell = useSharedValue(0);
  const pop = useSharedValue(0.9);

  useEffect(() => {
    if (!visible) {
      shell.value = 0;
      ring.value = 0;
      check.value = 0;
      rays.value = 0;
      pop.value = 0.9;
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    shell.value = withTiming(1, { duration: duration.fast, easing: easing.decelerate });
    pop.value = withSpring(1, spring.gentle);
    ring.value = withTiming(1, { duration: 420, easing: easing.decelerate });
    check.value = withDelay(300, withTiming(1, { duration: 260, easing: easing.decelerate }));
    rays.value = withDelay(320, withTiming(1, { duration: 620, easing: easing.standard }));

    // Hold the confirmation, then hand control back to the caller.
    shell.value = withSequence(
      withTiming(1, { duration: duration.fast, easing: easing.decelerate }),
      withDelay(
        1150,
        withTiming(0, { duration: duration.base, easing: easing.accelerate }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
  }, [visible]);

  const shellStyle = useAnimatedStyle(() => ({ opacity: shell.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - ring.value),
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LEN * (1 - check.value),
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: colors.overlay }, shellStyle]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${label}. ${amountLabel}`}
    >
      <Animated.View style={[styles.stage, popStyle]}>
        <View style={styles.markWrap}>
          {RAYS.map((angle) => (
            <Ray key={angle} angle={angle} color={accent} progress={rays} />
          ))}

          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={RING_R} stroke={`${accent}26`} strokeWidth={6} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RING_R}
              stroke={accent}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              animatedProps={ringProps}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
            <AnimatedPath
              d="M44 68 L58 82 L88 50"
              stroke={accent}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={CHECK_LEN}
              animatedProps={checkProps}
            />
          </Svg>
        </View>

        <Text style={[typography.headline, { color: colors.text, textAlign: 'center' }]}>{label}</Text>
        <Text style={[typography.display, { color: accent, textAlign: 'center' }]}>{amountLabel}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  stage: { alignItems: 'center', gap: spacing.sm },
  markWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ray: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
