import { ReactNode } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { Card } from './Card';

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** A small labeled stat card — "This month", "Highest category", group member count, etc. */
export function StatTile({ label, value, icon, accentColor, style }: StatTileProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Card elevation="raised" style={[{ flex: 1, gap: spacing.xs }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {icon}
        <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[typography.headline, { color: accentColor ?? colors.text }]}>{value}</Text>
      ) : (
        value
      )}
    </Card>
  );
}
