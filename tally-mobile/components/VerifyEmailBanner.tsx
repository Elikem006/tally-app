import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { authAPI } from '../services/api';
import { currentUser } from '../services/storage';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';

interface Props {
  /** Surfaces the outcome through the host screen's existing Toast. */
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * Nudge shown while an account's email is unconfirmed.
 *
 * Deliberately dismissible and non-blocking: verification is soft, so this
 * must never read as a wall. Dismissal is per-mount rather than persisted —
 * the reminder should come back next launch, but not keep interrupting the
 * session the user just dismissed it in.
 */
export default function VerifyEmailBanner({ onNotify }: Props) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (dismissed || currentUser.emailVerified) return null;

  async function handleResend() {
    if (!currentUser.email) {
      onNotify('No email address on this account', 'error');
      return;
    }
    setSending(true);
    try {
      await authAPI.resendVerification(currentUser.email);
      onNotify(`Confirmation link sent to ${currentUser.email}`, 'success');
    } catch (err: any) {
      onNotify(
        err?.response?.data?.error || 'Could not send the link. Please try again shortly.',
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}55` }]}>
      <Feather name="mail" size={18} color={colors.warning} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: 2 }]}>
          Confirm your email
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 18 }]}>
          We sent a link to {currentUser.email || 'your address'}. Confirming it is what lets you
          reset your password later.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleResend} disabled={sending} activeOpacity={0.7}>
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>
                Resend link
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDismissed(true)} activeOpacity={0.7}>
            <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>
              Not now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Feather name="x" size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
});
