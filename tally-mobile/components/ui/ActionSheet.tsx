import { ReactNode, useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { duration, easing } from '../../theme/motion';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onCancel: () => void;
  cancelLabel?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Gap between the sheet closing and the chosen action running.
 *
 * An option's action may present another native surface (the image picker,
 * the camera, a share sheet) or navigate. Any of those launched while this
 * Modal is still mounted will not appear — on iOS you cannot present a view
 * controller from one that is mid-dismiss — and the picker's promise then
 * never settles, which reads as the app freezing rather than failing. Letting
 * React flush the unmount first avoids the whole class of problem.
 */
const ACTION_DEFER_MS = 80;

/**
 * A multi-option bottom sheet — for choices that aren't a yes/no confirmation
 * (export format, recurrence frequency, photo source) and aren't a passive
 * notice either. Distinct from ConfirmModal (always exactly 2 buttons) and
 * Toast (no interactivity at all). One option may be marked `destructive`
 * without the whole sheet being a destructive confirmation.
 */
export function ActionSheet({ visible, title, message, options, onCancel, cancelLabel = 'Cancel' }: ActionSheetProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const overlayOpacity = useSharedValue(0);
  const translateY = useSharedValue(SCREEN_HEIGHT);

  // Held on the JS side rather than passed through runOnJS — the exit
  // callback is a worklet, and functions are not serializable across that
  // boundary.
  const pendingAction = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      // Reset before animating in, so an exit that was interrupted mid-flight
      // can't leave the sheet part-way up on the next open.
      overlayOpacity.value = 0;
      translateY.value = SCREEN_HEIGHT;
      overlayOpacity.value = withTiming(1, { duration: duration.base, easing: easing.standard });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    }
  }, [visible]);

  /**
   * Runs once the exit animation ends. `onCancel` is the only thing that
   * actually flips `visible` and unmounts the Modal — without it the sheet
   * animates out of sight but stays mounted as a full-screen, fully
   * transparent Pressable that swallows every touch in the app.
   */
  function finishDismiss() {
    const action = pendingAction.current;
    pendingAction.current = undefined;
    onCancel();
    if (action) setTimeout(action, ACTION_DEFER_MS);
  }

  function handleDismiss(action?: () => void) {
    pendingAction.current = action;
    overlayOpacity.value = withTiming(0, { duration: duration.fast, easing: easing.standard });
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: duration.fast, easing: easing.standard }, () => {
      // Deliberately not gated on `finished`: an interrupted exit still has to
      // close the sheet. Gating it meant a cancelled animation left the Modal
      // mounted and invisible with no way back.
      runOnJS(finishDismiss)();
    });
  }

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => handleDismiss()}>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => handleDismiss()} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { backgroundColor: colors.surfaceHigh }, sheetStyle]}>
        <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />

        {(!!title || !!message) && (
          <View style={styles.header}>
            {!!title && <Text style={[typography.headline, { color: colors.text, textAlign: 'center' }]}>{title}</Text>}
            {!!message && (
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }]}>
                {message}
              </Text>
            )}
          </View>
        )}

        <View style={{ gap: spacing.xs }}>
          {options.map((option, i) => (
            <Pressable
              key={i}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleDismiss(option.onPress);
              }}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: pressed ? colors.surfaceElevated : 'transparent' },
              ]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              {option.icon}
              <Text style={[typography.bodyStrong, { color: option.destructive ? colors.negative : colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => handleDismiss()}
          style={[styles.cancelButton, { backgroundColor: colors.surfaceElevated }]}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        >
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{cancelLabel}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { marginBottom: spacing.md, paddingHorizontal: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
