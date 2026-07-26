import { View, Text } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from './Button';

interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/** Icon + headline + body + optional CTA — the shared empty/error-adjacent state for every screen. */
export function EmptyState({ icon, title, body, ctaLabel, onPressCta }: EmptyStateProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.md }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primarySubtle,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
        }}
      >
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[typography.headline, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {!!body && (
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>{body}</Text>
      )}
      {!!ctaLabel && !!onPressCta && (
        <Button title={ctaLabel} onPress={onPressCta} variant="secondary" size="sm" fullWidth={false} style={{ marginTop: spacing.sm }} />
      )}
    </View>
  );
}
