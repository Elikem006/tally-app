import { ReactNode } from 'react';
import { View, Text } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from './Button';

interface EmptyStateProps {
  /** Fallback mark. Ignored when `illustration` is supplied. */
  icon: keyof typeof Feather.glyphMap;
  /**
   * Line art for the handful of empty states a new user actually lands on
   * (see components/ui/Illustration.tsx). Everywhere else the icon is the
   * right weight — a full illustration on a filtered-search miss would be
   * more ceremony than the moment deserves.
   */
  illustration?: ReactNode;
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/** Mark + headline + body + optional CTA — the shared empty/error-adjacent state for every screen. */
export function EmptyState({ icon, illustration, title, body, ctaLabel, onPressCta }: EmptyStateProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.md }}>
      {illustration ? (
        <View style={{ marginBottom: spacing.xs }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {illustration}
        </View>
      ) : (
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
      )}
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
