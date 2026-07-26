import { ReactNode } from 'react';
import { Pressable, View, Text, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { duration, easing, pressScale } from '../../theme/motion';

interface ListRowProps {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A generic row: leading element (icon/avatar), title + subtitle, trailing element (amount/chevron). */
export function ListRow({ leading, title, subtitle, trailing, onPress, style }: ListRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={!onPress}
      onPressIn={() => {
        if (onPress) scale.value = withTiming(pressScale, { duration: duration.fast, easing: easing.standard });
      }}
      onPressOut={() => {
        if (onPress) scale.value = withTiming(1, { duration: duration.fast, easing: easing.standard });
      }}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? (subtitle ? `${title}, ${subtitle}` : title) : undefined}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm + 2,
          minHeight: 44,
        },
        animatedStyle,
        style,
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </AnimatedPressable>
  );
}
