import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, runOnJS } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors } from '../theme';
import { typography } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';
import { duration, easing } from '../theme/motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  visible: boolean;
  /** Changes on every showToast call so a re-fire restarts the animation. */
  nonce?: number;
  onHide: () => void;
}

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
};

const AUTO_HIDE_MS = 3000;

export default function Toast({ message, type, visible, nonce, onHide }: ToastProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  const bg = { success: colors.positive, error: colors.negative, warning: colors.warning, info: colors.surfaceHigh }[type];
  const textColor = type === 'warning' ? '#1A1F2E' : type === 'info' ? colors.text : '#FFFFFF';

  // Entrance and auto-hide must be one withSequence per value: assigning
  // `.value` twice in a tick cancels the first animation, and withDelay holds
  // whatever value it started at — which left opacity pinned at 0 for the whole
  // delay, so the toast never appeared at all.
  useEffect(() => {
    if (visible) {
      translateY.value = withSequence(
        withTiming(0, { duration: duration.base, easing: easing.decelerate }),
        withDelay(
          AUTO_HIDE_MS,
          withTiming(100, { duration: duration.base, easing: easing.accelerate }, (finished) => {
            if (finished) runOnJS(onHide)();
          }),
        ),
      );
      opacity.value = withSequence(
        withTiming(1, { duration: duration.base, easing: easing.standard }),
        withDelay(AUTO_HIDE_MS, withTiming(0, { duration: duration.base, easing: easing.accelerate })),
      );
    } else {
      translateY.value = 100;
      opacity.value = 0;
    }
  }, [visible, nonce]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: bg }, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Feather name={ICONS[type]} size={18} color={textColor} />
      <Text style={[typography.bodyStrong, styles.message, { color: textColor }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 9999,
  },
  message: {
    flex: 1,
  },
});
