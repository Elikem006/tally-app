import { ReactNode } from 'react';
import { View, ViewStyle, StyleProp, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { spacing, radius } from '../../theme/spacing';

export type CardElevation = 'flat' | 'raised' | 'floating';

interface CardProps {
  children: ReactNode;
  elevation?: CardElevation;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Every card in the app should be one of these three elevation steps —
 * the "layered surfaces, not flat fills" requirement. Shadow values are
 * tuned separately per theme: dark mode shadows are barely visible against
 * a dark background, so dark elevation leans more on a lighter border and
 * a brighter surface color than on shadow depth.
 */
export function Card({ children, elevation = 'raised', padded = true, style }: CardProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const isDark = theme === 'dark';

  const surfaceColor =
    elevation === 'flat' ? colors.surface : elevation === 'raised' ? colors.surfaceElevated : colors.surfaceHigh;

  const shadow =
    elevation === 'flat'
      ? {}
      : Platform.select({
          ios: {
            shadowColor: colors.shadowColor,
            shadowOffset: { width: 0, height: elevation === 'floating' ? 8 : 4 },
            shadowOpacity: isDark ? (elevation === 'floating' ? 0.4 : 0.25) : elevation === 'floating' ? 0.12 : 0.06,
            shadowRadius: elevation === 'floating' ? 16 : 10,
          },
          android: { elevation: elevation === 'floating' ? 6 : 2 },
          default: {},
        });

  return (
    <View
      style={[
        {
          backgroundColor: surfaceColor,
          borderRadius: radius.lg,
          borderWidth: elevation === 'flat' ? 1 : isDark ? 1 : 0,
          borderColor: colors.borderSubtle,
          padding: padded ? spacing.lg : 0,
        },
        shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}
