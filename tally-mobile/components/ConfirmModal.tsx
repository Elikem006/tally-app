import { ReactNode, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
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
   * A Feather glyph name ('trash-2'), which this component renders in the
   * same 64px tinted-circle mark EmptyState uses, or a ReactNode for a fully
   * custom mark. A bare emoji string still renders as legacy text — the union
   * is kept so nothing breaks, but every call site in the app has migrated.
   */
  icon?: keyof typeof Feather.glyphMap | string | ReactNode;
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
          {/* A Feather name resolves to the tinted-circle mark; the tint follows
              the action's intent so a destructive confirm reads red rather than
              brand violet. Anything else falls through to the legacy paths. */}
          {!!icon &&
            (typeof icon === 'string' && icon in Feather.glyphMap ? (
              <View style={styles.iconWrap}>
                <View
                  style={[
                    styles.iconBadge,
                    { backgroundColor: destructive ? `${colors.negative}20` : colors.primarySubtle },
                  ]}
                >
                  <Feather
                    name={icon as keyof typeof Feather.glyphMap}
                    size={28}
                    color={destructive ? colors.negative : colors.primary}
                  />
                </View>
              </View>
            ) : typeof icon === 'string' ? (
              <Text style={styles.iconEmoji}>{icon}</Text>
            ) : (
              <View style={styles.iconWrap}>{icon}</View>
            ))}

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
  // Same mark as EmptyState's: 64px circle, 28px glyph. Two components showing
  // the same size mark keeps the icon language consistent between them.
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
