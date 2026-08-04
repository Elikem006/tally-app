import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '../../services/api';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing } from '../../theme';
import { Screen, Card, Input, Button } from '../../components/ui';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

import {
  currentUser,
  loadRememberedUser,
  saveRememberedUser,
  clearRememberedUser,
  notifyUserChanged,
  safeStorage,
} from '../../services/storage';

export default function LoginScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [checkingRemembered, setCheckingRemembered] = useState(true);
  const [loginFailed, setLoginFailed] = useState(false);

  // Auto-login: restore a remembered session and skip the login screen entirely
  useEffect(() => {
    let active = true;
    (async () => {
      const restored = await loadRememberedUser();
      if (!active) return;
      if (restored) {
        router.replace('/(tabs)');
      } else {
        setCheckingRemembered(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    if (!email || !password) {
      showToast('Please enter your email and password', 'error');
      return;
    }

    setLoginFailed(false);
    setLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const { token, userId, name, email: userEmail, avatarType, avatarData, phoneNumber } = response.data;

      currentUser.token = token;
      currentUser.userId = String(userId);
      currentUser.userName = name;
      currentUser.email = userEmail ?? email;
      currentUser.avatarType = avatarType ?? '';
      currentUser.avatarData = avatarData ?? '';
      currentUser.phoneNumber = phoneNumber ?? '';
      currentUser.lastCategory = 'Food';
      currentUser.lastPaymentMethod = 'CASH';

      notifyUserChanged();

      if (rememberMe) {
        await saveRememberedUser();
      } else {
        await clearRememberedUser();
      }

      setLoading(false);

      const onboardingComplete = await safeStorage.getItem('tallyOnboardingComplete');
      if (!onboardingComplete) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      setLoading(false);
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        (error.message === 'Network Error'
          ? 'Cannot reach server. Check that the backend is running and the IP in api.ts is correct.'
          : error.message || 'Something went wrong');
      showToast(message, 'error');
      // The login endpoint returns 400 for bad credentials (client-side already
      // guards the "missing fields" 400 case above, so any 400 reaching here is
      // a real mismatch). It deliberately doesn't distinguish wrong password
      // from unregistered email, to avoid leaking which emails are registered —
      // either way, forgot-password is the relevant next step, so nudge toward
      // it instead of leaving the user stuck after the toast fades.
      if (error.response?.status === 400) {
        setLoginFailed(true);
      }
    }
  }

  if (checkingRemembered) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Screen keyboardAvoiding contentStyle={styles.scrollContent}>
      <Card elevation="raised" style={styles.card}>
        <Text style={[typography.headline, { color: colors.primary, textAlign: 'center', marginBottom: spacing.md }]}>
          💰 Tally
        </Text>
        <Text style={[typography.display, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]} accessibilityRole="header">
          Welcome Back
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
          Sign in to manage your budget
        </Text>

        <View style={{ gap: spacing.md }}>
          <Input
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setLoginFailed(false);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setLoginFailed(false);
            }}
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

          {loginFailed && (
            <TouchableOpacity
              style={[styles.failedHint, { backgroundColor: colors.primarySubtle }]}
              onPress={() => router.push('/(auth)/forgot-password')}
              activeOpacity={0.7}
            >
              <Feather name="help-circle" size={16} color={colors.primary} />
              <Text style={[typography.label, { color: colors.primary, flex: 1 }]}>
                Wrong password? Reset it here
              </Text>
              <Feather name="chevron-right" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}

          <View style={styles.optionsRow}>
            <TouchableOpacity style={styles.checkboxContainer} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.8}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: colors.border },
                  rememberMe && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {rememberMe && <Feather name="check" size={10} color={colors.onPrimary} />}
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} activeOpacity={0.7}>
              <Text style={[typography.labelStrong, { color: colors.primary }]}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <Button title="Sign In" onPress={handleLogin} loading={loading} />

          <View style={styles.linkContainer}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginHorizontal: spacing.xs,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  failedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
