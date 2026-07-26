import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import Avatar from '../Avatar';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing, staggerDelay } from '../../theme';

interface MemberRowProps {
  userId: number | string;
  name: string;
  avatarData?: string;
  isCreator?: boolean;
  onRemove?: () => void;
  /** Position within its list — staggers the entrance animation, capped after the 8th item. */
  index?: number;
}

/** One group member row — avatar, name (+ crown if creator), user id, optional remove action. */
export function MemberRow({ userId, name, avatarData, isCreator, onRemove, index = 0 }: MemberRowProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).delay(staggerDelay(index)).easing(easing.decelerate)}
      style={[styles.row, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
    >
      <Avatar userId={userId} name={name} size={40} avatarData={avatarData} style={{ marginRight: spacing.md }} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {name}{isCreator ? '  👑' : ''}
        </Text>
        <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>ID: #{userId}</Text>
      </View>
      {onRemove && (
        <TouchableOpacity
          style={[styles.removeBtn, { backgroundColor: `${colors.negative}12`, borderColor: `${colors.negative}30` }]}
          onPress={onRemove}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
        >
          <Feather name="x" size={14} color={colors.negative} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
