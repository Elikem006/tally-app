import { ReactNode, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors } from '../theme';
import { typography } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';
import { duration, easing } from '../theme/motion';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Accepts either a legacy emoji string (existing call sites) or a vector
   * icon element — kept union-typed so screens can migrate to a proper icon
   * incrementally without this component needing to change again. New call
   * sites should pass a ReactNode (e.g. a Feather icon), not an emoji.
   */
  icon?: string | ReactNode;
  /** For single-action acknowledgements (e.g. a success notice) — hides the Cancel button so there's one clear action, not two identically-behaving buttons. */
  hideCancel?: boolean;
  /**
   * Marks the confirm action as destructive, which weights its haptic more
   * heavily than a routine confirmation. Mirrors ActionSheetOption's existing
   * `destructive` flag rather than introducing a second way to express it.
   */
  destructive?: boolean;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor,
  onConfirm,
  onCancel,
  icon,
  hideCancel = false,
  destructive = false,
}: ConfirmModalProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const resolvedConfirmColor = confirmColor ?? colors.negative;

  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 0.85;
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: duration.base, easing: easing.standard });
      scale.value = withSpring(1, { damping: 16, stiffness: 220 });
    }
  }, [visible]);

  function dismiss(callback: () => void) {
    opacity.value = withTiming(0, { duration: duration.fast, easing: easing.standard }, (finished) => {
      if (finished) runOnJS(callback)();
    });
    scale.value = withTiming(0.92, { duration: duration.fast, easing: easing.standard });
  }

  function handleConfirm() {
    // Destructive confirmations land heavier than routine ones. Fired here,
    // once, rather than at the call site — history.tsx was adding its own
    // Heavy inside onConfirm on top of this Medium, so deleting an expense
    // buzzed twice.
    Haptics.impactAsync(
      destructive ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    ).catch(() => {});
    dismiss(onConfirm);
  }

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(onCancel)}>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => dismiss(onCancel)} />

        <Animated.View style={[styles.card, { backgroundColor: colors.surfaceHigh }, cardStyle]}>
          {!!icon && (typeof icon === 'string' ? <Text style={styles.iconEmoji}>{icon}</Text> : <View style={styles.iconWrap}>{icon}</View>)}

          <Text style={[typography.title, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]}>{title}</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
            {message}
          </Text>

          <View style={styles.buttonRow}>
            {!hideCancel && (
              <Pressable
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => dismiss(onCancel)}
                accessibilityRole="button"
                accessibilityLabel={cancelText}
              >
                <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>{cancelText}</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: resolvedConfirmColor, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmText}
            >
              <Text style={[typography.bodyStrong, { color: '#FFFFFF' }]}>{confirmText}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl + 4,
    width: '100%',
    maxWidth: 340,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
});
