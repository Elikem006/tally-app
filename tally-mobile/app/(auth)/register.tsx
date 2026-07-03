import { useState } from 'react';
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
import { Feather, AntDesign, FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(name, email, password);
      Alert.alert(
        'Account Created!',
        'Your account has been created successfully. Please log in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: any) {
      const message =
        error.response?.data?.error || 'Registration failed. Please try again.';
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scrollContainer, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 40), paddingBottom: Math.max(insets.bottom, 40) }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.brandTitle, { color: colors.primary }]}>💰 Tally</Text>
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Join Tally to start tracking your expenses</Text>

          <View style={styles.form}>
            {/* Full Name Field */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name</Text>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                nameFocused && { borderColor: colors.primary },
              ]}
            >
              <Feather name="user" size={18} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Enter your full name"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#C8D2DC'}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
              />
            </View>

            {/* Email Field */}
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
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#C8D2DC'}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password Field */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                passwordFocused && { borderColor: colors.primary },
              ]}
            >
              <Feather name="lock" size={18} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Enter your password (min 6 chars)"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#C8D2DC'}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                activeOpacity={0.7}
              >
                <Feather
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Sign Up / Create Account Button */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled, { marginTop: 24 }]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            {/* Sign In Link */}
            <View style={styles.linkContainer}>
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text style={[styles.linkBold, { color: colors.primary }]}>Sign In</Text>
              </TouchableOpacity>
            </View>

            {/* Or With divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or sign up with</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Social Buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Google Login', 'Integration coming soon!')}
              >
                <AntDesign name="google" size={16} color="#4285F4" />
                <Text style={[styles.socialButtonText, { color: colors.text }]}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.socialButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Apple Login', 'Integration coming soon!')}
              >
                <FontAwesome name="apple" size={16} color={theme === 'dark' ? '#ffffff' : '#111111'} />
                <Text style={[styles.socialButtonText, { color: colors.text }]}>Apple</Text>
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
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: '#ffffff', // Clean white card
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    height: 56,
  },
  inputFocused: {
    borderColor: '#111111', // Black border highlight
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#111111',
    fontSize: 15,
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  button: {
    backgroundColor: '#111111', // Black capsule button
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#8E9AA6',
    fontWeight: '500',
  },
  linkBold: {
    fontSize: 14,
    color: '#111111',
    fontWeight: 'bold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#EAEBEF',
  },
  dividerText: {
    fontSize: 12,
    color: '#8E9AA6',
    paddingHorizontal: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 28,
    height: 56,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
});