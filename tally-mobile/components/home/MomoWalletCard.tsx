import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button } from '../ui';

interface MomoWalletCardProps {
  status: 'loading' | 'available' | 'unavailable';
  balanceLoading: boolean;
  balance: string;
  hideBalance: boolean;
  monthlySpent: string;
  onToggleHide: () => void;
  onRefresh: () => void;
  onPayVendor: () => void;
}

const EyelashClosedIcon = ({ size = 18, color }: { size?: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M2 10C6 15 18 15 22 10" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M4 12L2 14.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M8 13.5L7 16.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M12 14L12 17.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M16 13.5L17 16.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Path d="M20 12L22 14.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

const EyelashOpenIcon = ({ size = 18, color }: { size?: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 12C6 6 18 6 22 12C18 18 6 18 2 12Z"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      stroke={color}
      strokeWidth={2.2}
      fill={color}
    />
  </Svg>
);

/** MTN MoMo sandbox wallet balance card — loading / available / unavailable states. */
export function MomoWalletCard({
  status,
  balanceLoading,
  balance,
  hideBalance,
  monthlySpent,
  onToggleHide,
  onRefresh,
  onPayVendor,
}: MomoWalletCardProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: status === 'unavailable' ? `${colors.accent}40` : colors.accent,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="smartphone" size={18} color={colors.accent} />
          <Text style={[typography.bodyStrong, { color: colors.accent, flex: 1 }]}>MTN MoMo Sandbox Wallet</Text>
        </View>
        {!balanceLoading && status === 'available' && (
          <TouchableOpacity
            onPress={onToggleHide}
            style={[styles.hideBtn, { backgroundColor: colors.accentSubtle, borderColor: `${colors.accent}30` }]}
            activeOpacity={0.7}
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel={hideBalance ? 'Show balance' : 'Hide balance'}
          >
            {hideBalance ? <EyelashClosedIcon color={colors.accent} /> : <EyelashOpenIcon color={colors.accent} />}
          </TouchableOpacity>
        )}
      </View>

      {(balanceLoading || status === 'loading') && (
        <View style={styles.stateRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={[typography.body, { color: colors.textSecondary }]}>Fetching sandbox balance...</Text>
        </View>
      )}

      {!balanceLoading && status === 'available' && (
        <View>
          <Text style={[typography.display, { color: colors.accent, marginBottom: spacing.xs }]}>
            {hideBalance ? 'GHS ••••••' : `GHS ${balance}`}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            GHS {monthlySpent} spent via MoMo this month
          </Text>
          <View style={styles.actionRow}>
            <Button title="Refresh ↻" onPress={onRefresh} variant="secondary" size="sm" fullWidth={false} />
            <Button title="Pay Vendor →" onPress={onPayVendor} size="sm" fullWidth={false} />
          </View>
        </View>
      )}

      {!balanceLoading && status === 'unavailable' && (
        <View>
          <View style={styles.stateRow}>
            <Feather name="wifi-off" size={14} color={colors.accent} />
            <Text style={[typography.bodyStrong, { color: colors.accent }]}>Sandbox balance temporarily unavailable</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            This is normal in sandbox mode. Payments still work.
          </Text>
          <Text style={[typography.caption, { color: colors.accent, marginBottom: spacing.md }]}>
            GHS {monthlySpent} spent via MoMo this month
          </Text>
          <View style={styles.actionRow}>
            <Button title="Retry ↻" onPress={onRefresh} variant="secondary" size="sm" fullWidth={false} />
            <Button title="Pay Vendor →" onPress={onPayVendor} size="sm" fullWidth={false} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  hideBtn: {
    padding: spacing.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
