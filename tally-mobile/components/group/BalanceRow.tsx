import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Avatar from '../Avatar';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';
import { Button } from '../ui';

interface BalanceRowProps {
  userId: number | string;
  name: string;
  avatarData?: string;
  owes: boolean;
  amount: number;
  isCurrentUser: boolean;
  onSettleUp?: () => void;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** One member's net balance in the group — owes/owed badge, Settle Up when it's the viewer's own debt. */
export function BalanceRow({ userId, name, avatarData, owes, amount, isCurrentUser, onSettleUp, index = 0 }: BalanceRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const tintColor = owes ? colors.negative : colors.positive;

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[
        styles.row,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
        isCurrentUser && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.primarySubtle },
      ]}
    >
      <View style={styles.left}>
        <Avatar userId={userId} name={name} size={40} avatarData={avatarData} style={{ marginRight: spacing.sm + 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {isCurrentUser ? `${name} (You)` : name}
          </Text>
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>
            {owes ? 'Owes money' : 'Is owed money'}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.xs + 2 }}>
        <View style={[styles.badge, { backgroundColor: `${tintColor}12`, borderColor: `${tintColor}30` }]}>
          <Text style={[typography.label, { color: tintColor }]}>
            {owes ? 'Owes' : 'Owed'} GHS {amount.toFixed(2)}
          </Text>
        </View>
        {onSettleUp && <Button title="💳 Settle Up" onPress={onSettleUp} size="sm" fullWidth={false} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm + 2,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
});
