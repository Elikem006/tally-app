import { ReactNode } from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { duration, easing, pressScale } from '../../theme/motion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_CONFIG: Record<ButtonSize, { paddingVertical: number; fontSize: number; gap: number }> = {
  sm: { paddingVertical: spacing.sm, fontSize: 13, gap: spacing.xs },
  md: { paddingVertical: 14, fontSize: 15, gap: spacing.sm },
  lg: { paddingVertical: spacing.lg - 2, fontSize: 16, gap: spacing.sm },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withTiming(pressScale, { duration: duration.fast, easing: easing.standard });
  }
  function handlePressOut() {
    scale.value = withTiming(1, { duration: duration.fast, easing: easing.standard });
  }
  function handlePress() {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }

  const variantStyle = getVariantStyle(variant, colors, isDisabled);
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          paddingVertical: sizeConfig.paddingVertical,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
          borderWidth: variantStyle.borderWidth,
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              typography.bodyStrong,
              { color: variantStyle.textColor, fontSize: sizeConfig.fontSize },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

function getVariantStyle(
  variant: ButtonVariant,
  colors: ReturnType<typeof getExtendedColors>,
  isDisabled: boolean,
) {
  const opacity = isDisabled ? 0.5 : 1;
  switch (variant) {
    case 'primary':
      return { backgroundColor: withOpacity(colors.primary, opacity), borderColor: 'transparent', borderWidth: 0, textColor: colors.onPrimary };
    case 'secondary':
      return { backgroundColor: withOpacity(colors.primarySubtle, opacity), borderColor: 'transparent', borderWidth: 0, textColor: colors.primary };
    case 'ghost':
      return { backgroundColor: 'transparent', borderColor: withOpacity(colors.border, opacity), borderWidth: 1, textColor: colors.text };
    case 'danger':
      return { backgroundColor: withOpacity(colors.negative, opacity), borderColor: 'transparent', borderWidth: 0, textColor: '#FFFFFF' };
  }
}

// Solid hex colors get real alpha blending; rgba()-based tokens (primarySubtle
// etc.) already carry their own alpha, so leave those untouched — cutting
// their opacity again would double-fade them into near-invisibility.
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1 || color.startsWith('rgba') || color === 'transparent') return color;
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return color.startsWith('#') ? `${color}${alpha}` : color;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
  },
});
