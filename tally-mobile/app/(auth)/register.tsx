import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '../../services/api';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing } from '../../theme';
import { Screen, Card, Input, Button } from '../../components/ui';
import ConfirmModal from '../../components/ConfirmModal';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

export default function RegisterScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    // Mirrors the server's second password rule (UserService.registerUser) and
    // the one forgot-password already checks client-side — without it the only
    // feedback is a round-trip rejection.
    if (!/\d/.test(password)) {
      showToast('Password must contain at least one number', 'error');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(name, email, password);
      setSuccessVisible(true);
    } catch (error: any) {
      const message = error.response?.data?.error || 'Registration failed. Please try again.';
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
        <Text style={[typography.display, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]} accessibilityRole="header">
          Create Account
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
          Join Tally to start tracking your expenses
        </Text>

        <View style={{ gap: spacing.md }}>
          <Input label="Full Name" placeholder="Enter your full name" value={name} onChangeText={setName} autoCapitalize="words" />

          <Input
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="Enter your password (min 6 chars)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            rightElement={
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
                hitSlop={13}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Feather name={showPassword ? 'eye' : 'eye-off'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            }
          />

          <Button title="Sign Up" onPress={handleRegister} loading={loading} style={{ marginTop: spacing.sm }} />

          <View style={styles.linkContainer}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />

      <ConfirmModal
        visible={successVisible}
        title="Account Created!"
        message="Your account has been created successfully. Please log in."
        confirmText="OK"
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
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
