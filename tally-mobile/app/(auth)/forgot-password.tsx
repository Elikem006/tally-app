import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '../../services/api';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Screen, Card, Input, Button } from '../../components/ui';
import ConfirmModal from '../../components/ConfirmModal';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

type Step = 1 | 2 | 3;

export default function ForgotPasswordScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  // Step 1 — email
  const [email, setEmail] = useState('');

  // Step 2 — OTP
  const [otp, setOtp] = useState('');
  const [otpHint, setOtpHint] = useState(''); // sandbox: shows the returned OTP
  const [secondsLeft, setSecondsLeft] = useState(15 * 60); // 15-minute countdown
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3 — new password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Start / stop countdown
  useEffect(() => {
    if (step === 2) {
      setSecondsLeft(15 * 60);
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  function formatCountdown(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Step 1: request OTP ────────────────────────────────────────────────────
  async function handleSendOtp() {
    if (!email.trim()) {
      showToast('Please enter your email address', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword(email.trim().toLowerCase());
      const { otp: returnedOtp } = res.data;
      // Sandbox: display the OTP so testers can use it
      setOtpHint(returnedOtp ?? '');
      setStep(2);
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.message ||
        'Failed to send OTP. Please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  function handleVerifyOtp() {
    if (!otp.trim() || otp.length !== 6) {
      showToast('Please enter the 6-digit OTP', 'error');
      return;
    }
    if (secondsLeft === 0) {
      showToast('Your OTP has expired. Please request a new one.', 'error');
      return;
    }
    setStep(3);
  }

  // ── Step 3: reset password ─────────────────────────────────────────────────
  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) {
      showToast('Please fill in both password fields', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (!/\d/.test(newPassword)) {
      showToast('Password must contain at least one number', 'error');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
      setSuccessVisible(true);
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.message ||
        'Failed to reset password. Please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen keyboardAvoiding contentStyle={styles.scrollContent}>
      <Card elevation="raised" style={styles.card}>
        <Text style={[typography.headline, { color: colors.primary, textAlign: 'center', marginBottom: spacing.md }]}>
          💰 Tally
        </Text>
        <Text style={[typography.display, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]}>
          {step === 1 ? 'Forgot Password?' : step === 2 ? 'Enter OTP' : 'New Password'}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }]}>
          {step === 1
            ? "We'll send a one-time code to your email"
            : step === 2
              ? `Enter the 6-digit code sent to ${email}`
              : 'Choose a strong new password'}
        </Text>

        <View style={styles.stepRow}>
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[styles.stepDot, { backgroundColor: step >= s ? colors.primary : colors.border }]} />
          ))}
        </View>

        <View style={{ gap: spacing.md }}>
          {/* ── Step 1 — Email ──────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <Input label="Email Address" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoFocus />
              <Button title="Send OTP" onPress={handleSendOtp} loading={loading} />
            </>
          )}

          {/* ── Step 2 — OTP ────────────────────────────────────────────── */}
          {step === 2 && (
            <>
              {!!otpHint && (
                <View style={[styles.otpHintBox, { backgroundColor: colors.neutralBg, borderColor: colors.border }]}>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>🧪 Testing OTP</Text>
                  <Text style={[typography.displayLarge, { color: colors.primary, letterSpacing: 8 }]}>{otpHint}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
                    In production this would be sent to your email.
                  </Text>
                </View>
              )}

              <Input
                label="6-Digit OTP"
                placeholder="000000"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={{ fontSize: 22, letterSpacing: 6, fontFamily: typography.bodyStrong.fontFamily }}
              />

              <View style={styles.countdownRow}>
                <Feather name="clock" size={14} color={secondsLeft < 60 ? colors.negative : colors.textSecondary} />
                <Text style={[typography.caption, { color: secondsLeft < 60 ? colors.negative : colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>
                  {secondsLeft > 0 ? `OTP expires in ${formatCountdown(secondsLeft)}` : 'OTP has expired'}
                </Text>
              </View>

              <Button title="Verify OTP" onPress={handleVerifyOtp} disabled={secondsLeft === 0} />

              <TouchableOpacity
                style={styles.resendRow}
                onPress={() => { setStep(1); setOtp(''); setOtpHint(''); }}
                activeOpacity={0.7}
              >
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Didn't receive it? <Text style={{ color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 3 — New Password ──────────────────────────────────── */}
          {step === 3 && (
            <>
              <Input
                label="New Password"
                placeholder="Min 6 chars, include a number"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                autoFocus
                rightElement={
                  <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} activeOpacity={0.7} hitSlop={8}>
                    <Feather name={showNewPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                }
              />

              <Input
                label="Confirm Password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                rightElement={
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} activeOpacity={0.7} hitSlop={8}>
                    <Feather name={showConfirmPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                }
              />

              {!!confirmPassword && (
                <Text style={[typography.caption, { color: newPassword === confirmPassword ? colors.positive : colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>
                  {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </Text>
              )}

              <Button title="Reset Password" onPress={handleResetPassword} loading={loading} />
            </>
          )}

          <View style={styles.linkContainer}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Remember your password? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />

      <ConfirmModal
        visible={successVisible}
        title="Password Reset!"
        message="Your password has been reset successfully. Please log in with your new password."
        confirmText="Sign In"
        confirmColor={colors.positive}
        hideCancel
        onConfirm={() => {
          setSuccessVisible(false);
          router.replace('/(auth)/login');
        }}
        onCancel={() => {
          setSuccessVisible(false);
          router.replace('/(auth)/login');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginHorizontal: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  otpHintBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendRow: {
    alignItems: 'center',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
