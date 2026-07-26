import { ReactNode, useEffect } from 'react';
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

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: duration.base, easing: easing.standard });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    }
  }, [visible]);

  function handleDismiss(action?: () => void) {
    overlayOpacity.value = withTiming(0, { duration: duration.fast, easing: easing.standard });
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: duration.fast, easing: easing.standard }, (finished) => {
      if (finished && action) runOnJS(action)();
    });
  }

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => handleDismiss(onCancel)}>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => handleDismiss(onCancel)} />
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
          onPress={() => handleDismiss(onCancel)}
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
