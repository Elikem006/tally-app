import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authAPI } from '../../services/api';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

type Step = 1 | 2 | 3;

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  // Step 1 — email
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);

  // Step 2 — OTP
  const [otp, setOtp] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [otpHint, setOtpHint] = useState(''); // sandbox: shows the returned OTP
  const [secondsLeft, setSecondsLeft] = useState(15 * 60); // 15-minute countdown
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3 — new password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

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
      Alert.alert('Error', 'Please enter your email address');
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
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  function handleVerifyOtp() {
    if (!otp.trim() || otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP');
      return;
    }
    if (secondsLeft === 0) {
      Alert.alert('OTP Expired', 'Your OTP has expired. Please request a new one.');
      return;
    }
    setStep(3);
  }

  // ── Step 3: reset password ─────────────────────────────────────────────────
  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (!/\d/.test(newPassword)) {
      Alert.alert('Error', 'Password must contain at least one number');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
      Alert.alert(
        'Password Reset!',
        'Your password has been reset successfully. Please log in with your new password.',
        [{ text: 'Sign In', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        error.message ||
        'Failed to reset password. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === 'dark';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          {
            backgroundColor: colors.background,
            paddingTop: Math.max(insets.top, 40),
            paddingBottom: Math.max(insets.bottom, 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {/* Header */}
          <Text style={[styles.brandTitle, { color: colors.primary }]}>💰 Tally</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {step === 1 ? 'Forgot Password?' : step === 2 ? 'Enter OTP' : 'New Password'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {step === 1
              ? "We'll send a one-time code to your email"
              : step === 2
              ? `Enter the 6-digit code sent to ${email}`
              : 'Choose a strong new password'}
          </Text>

          {/* Step dots */}
          <View style={styles.stepRow}>
            {([1, 2, 3] as Step[]).map((s) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  { backgroundColor: step >= s ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          <View style={styles.form}>
            {/* ── Step 1 — Email ──────────────────────────────────────────── */}
            {step === 1 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Email Address</Text>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                    emailFocused && { borderColor: colors.primary },
                  ]}
                >
                  <Feather name="at-sign" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Enter your email"
                    placeholderTextColor={isDark ? '#4B5563' : '#C8D2DC'}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 2 — OTP ────────────────────────────────────────────── */}
            {step === 2 && (
              <>
                {/* Sandbox OTP hint */}
                {!!otpHint && (
                  <View style={[styles.otpHintBox, { backgroundColor: colors.neutralBg, borderColor: colors.border }]}>
                    <Text style={[styles.otpHintLabel, { color: colors.textSecondary }]}>
                      🧪 Testing OTP
                    </Text>
                    <Text style={[styles.otpHintValue, { color: colors.primary }]}>{otpHint}</Text>
                    <Text style={[styles.otpHintNote, { color: colors.textSecondary }]}>
                      In production this would be sent to your email.
                    </Text>
                  </View>
                )}

                <Text style={[styles.label, { color: colors.textSecondary }]}>6-Digit OTP</Text>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                    otpFocused && { borderColor: colors.primary },
                  ]}
                >
                  <Feather name="shield" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, styles.otpInput, { color: colors.text }]}
                    placeholder="000000"
                    placeholderTextColor={isDark ? '#4B5563' : '#C8D2DC'}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    autoFocus
                  />
                </View>

                {/* Countdown */}
                <View style={styles.countdownRow}>
                  <Feather
                    name="clock"
                    size={14}
                    color={secondsLeft < 60 ? '#E05C5C' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.countdownText,
                      { color: secondsLeft < 60 ? '#E05C5C' : colors.textSecondary },
                    ]}
                  >
                    {secondsLeft > 0
                      ? `OTP expires in ${formatCountdown(secondsLeft)}`
                      : 'OTP has expired'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading || secondsLeft === 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Verify OTP</Text>
                </TouchableOpacity>

                {/* Resend */}
                <TouchableOpacity
                  style={styles.resendRow}
                  onPress={() => { setStep(1); setOtp(''); setOtpHint(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resendText, { color: colors.textSecondary }]}>
                    Didn't receive it?{' '}
                    <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Resend</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 3 — New Password ──────────────────────────────────── */}
            {step === 3 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>New Password</Text>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                    newPasswordFocused && { borderColor: colors.primary },
                  ]}
                >
                  <Feather name="lock" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Min 6 chars, include a number"
                    placeholderTextColor={isDark ? '#4B5563' : '#C8D2DC'}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    onFocus={() => setNewPasswordFocused(true)}
                    onBlur={() => setNewPasswordFocused(false)}
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.eyeIcon}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={showNewPassword ? 'eye' : 'eye-off'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password</Text>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                    confirmPasswordFocused && { borderColor: colors.primary },
                  ]}
                >
                  <Feather name="lock" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Repeat your new password"
                    placeholderTextColor={isDark ? '#4B5563' : '#C8D2DC'}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    onFocus={() => setConfirmPasswordFocused(true)}
                    onBlur={() => setConfirmPasswordFocused(false)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeIcon}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={showConfirmPassword ? 'eye' : 'eye-off'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Password match indicator */}
                {!!confirmPassword && (
                  <Text
                    style={[
                      styles.matchIndicator,
                      { color: newPassword === confirmPassword ? '#00C896' : '#E05C5C' },
                    ]}
                  >
                    {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </Text>
                )}

                <TouchableOpacity
                  style={[
                    styles.button,
                    { backgroundColor: colors.primary, marginTop: 24 },
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Back to login */}
            <View style={styles.linkContainer}>
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Remember your password?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
                <Text style={[styles.linkBold, { color: colors.primary }]}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  otpInput: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 6,
  },
  eyeIcon: {
    padding: 4,
  },
  otpHintBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
    alignItems: 'center',
    gap: 4,
  },
  otpHintLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  otpHintValue: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  otpHintNote: {
    fontSize: 11,
    textAlign: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  resendText: {
    fontSize: 13,
  },
  matchIndicator: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  button: {
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkBold: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
