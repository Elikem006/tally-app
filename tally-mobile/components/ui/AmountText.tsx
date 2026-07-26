import { useEffect, useState } from 'react';
import { Text, View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography, FONT_FAMILY } from '../../theme/typography';
import { duration, easing } from '../../theme/motion';

export type AmountSize = 'displayLarge' | 'display' | 'numericLarge' | 'numeric';

interface AmountTextProps {
  /** The amount, e.g. -55.5 or 1200. Sign is handled by `showSign`, not by passing a signed value for display purposes. */
  value: number;
  size?: AmountSize;
  /** Overrides the default text color (e.g. colors.positive / colors.negative for income vs. expense). */
  color?: string;
  /** Prefix a +/- based on the sign of `value`. Off by default — most call sites already know whether they're showing an expense or income and color accordingly. */
  showSign?: boolean;
  /** Count up from 0 on mount. Off by default — only the hero dashboard figure should draw attention to itself this way. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_MAP: Record<AmountSize, { main: keyof typeof typography; currencyRatio: number; decimalRatio: number }> = {
  displayLarge: { main: 'displayLarge', currencyRatio: 0.4, decimalRatio: 0.55 },
  display: { main: 'display', currencyRatio: 0.42, decimalRatio: 0.6 },
  numericLarge: { main: 'numericLarge', currencyRatio: 0.42, decimalRatio: 0.6 },
  numeric: { main: 'numeric', currencyRatio: 0.55, decimalRatio: 0.85 },
};

/**
 * The one place amounts render. GHS at a reduced size, integer part large,
 * decimals smaller and dimmed — systematizes the split index.tsx already
 * does ad hoc. Always uses tabular figures (via the numeric* type styles)
 * so the layout doesn't reflow as digits change during the count-up.
 */
export function AmountText({
  value,
  size = 'numeric',
  color,
  showSign = false,
  animate = false,
  style,
}: AmountTextProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const textColor = color ?? colors.text;

  const [displayValue, setDisplayValue] = useState(animate ? 0 : Math.abs(value));
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(Math.abs(value));
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.slow, easing: easing.decelerate });
  }, [value, animate]);

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      if (animate) runOnJS(setDisplayValue)(Math.abs(value) * p);
    },
    [value, animate],
  );

  const sizeConfig = SIZE_MAP[size];
  const mainStyle = typography[sizeConfig.main];
  const mainFontSize = (mainStyle.fontSize as number) ?? 15;

  const sign = showSign ? (value < 0 ? '-' : value > 0 ? '+' : '') : '';
  const [integerPart, decimalPart] = displayValue.toFixed(2).split('.');

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start' }, style]} accessibilityLabel={`GHS ${displayValue.toFixed(2)}`}>
      <Text
        style={[
          mainStyle,
          {
            color: textColor,
            fontFamily: FONT_FAMILY.semiBold,
            fontSize: mainFontSize * sizeConfig.currencyRatio,
            marginRight: 3,
            marginTop: 2,
          },
        ]}
      >
        GHS{sign}
      </Text>
      <Text style={[mainStyle, { color: textColor, fontVariant: ['tabular-nums'] }]}>{integerPart}</Text>
      <Text
        style={[
          mainStyle,
          {
            color: textColor,
            opacity: 0.55,
            fontSize: mainFontSize * sizeConfig.decimalRatio,
            fontVariant: ['tabular-nums'],
            marginTop: mainFontSize * 0.08,
          },
        ]}
      >
        .{decimalPart}
      </Text>
    </View>
  );
}
