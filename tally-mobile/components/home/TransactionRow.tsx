import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface TransactionRowProps {
  leading: ReactNode;
  title: string;
  subtitle: string;
  badges?: ReactNode;
  tags?: string[];
  amount: string;
  amountColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  accentBorder?: boolean;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** A generic transaction/reminder/recurring row — icon chip, title/subtitle, optional badges + tags, trailing amount. */
export function TransactionRow({ leading, title, subtitle, badges, tags, amount, amountColor, onPress, onLongPress, accentBorder, index = 0 }: TransactionRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <AnimatedTouchable
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: accentBorder ? `${colors.primary}40` : colors.borderSubtle },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress && !onLongPress}
    >
      <View style={styles.left}>
        {leading}
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 1, marginBottom: badges || tags ? spacing.xs : 0 }]}>
            {subtitle}
          </Text>
          {badges}
          {!!tags?.length && (
            <View style={styles.tagsRow}>
              {tags.map((tag) => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: colors.neutralBg, borderColor: colors.borderSubtle }]}>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[typography.bodyStrong, { color: amountColor ?? colors.text }]}>{amount}</Text>
        {onPress && <Feather name="chevron-right" size={18} color={colors.textTertiary} />}
      </View>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagPill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderWidth: 1,
  },
});
