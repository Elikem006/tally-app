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
import { authAPI } from '../../services/api';
import { Feather, AntDesign, FontAwesome } from '@expo/vector-icons';

// Global store for user session
export let currentUser = {
  token: '',
  userId: '1',
  userName: 'User',
  email: '',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const { token, userId, name, email: userEmail } = response.data;
      currentUser.token = token;
      currentUser.userId = String(userId);
      currentUser.userName = name;
      currentUser.email = userEmail ?? email;
      setLoading(false);
      router.replace('/(tabs)');
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Login Failed', String(error));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brandTitle}>💰 Tally</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to manage your budget</Text>

          <View style={styles.form}>
            {/* Email Field */}
            <Text style={styles.label}>Email Address</Text>
            <View
              style={[
                styles.inputContainer,
                emailFocused && styles.inputFocused,
              ]}
            >
              <Feather name="at-sign" size={18} color="#8E9AA6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#C8D2DC"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password Field */}
            <Text style={styles.label}>Password</Text>
            <View
              style={[
                styles.inputContainer,
                passwordFocused && styles.inputFocused,
              ]}
            >
              <Feather name="lock" size={18} color="#8E9AA6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#C8D2DC"
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
                  color="#8E9AA6"
                />
              </TouchableOpacity>
            </View>

            {/* Remember Me and Forgot Password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Feather name="check" size={10} color="#ffffff" />}
                </View>
                <Text style={styles.checkboxLabel}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => Alert.alert('Forgot Password', 'Feature coming soon!')}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Sign Up Link */}
            <View style={styles.linkContainer}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.linkBold}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            {/* Or With divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialButton}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Google Login', 'Integration coming soon!')}
              >
                <AntDesign name="google" size={16} color="#4285F4" />
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialButton}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Apple Login', 'Integration coming soon!')}
              >
                <FontAwesome name="apple" size={16} color="#111111" />
                <Text style={styles.socialButtonText}>Apple</Text>
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
    borderColor: '#111111', // Black border on active focus
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
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#F8F9FA',
  },
  checkboxChecked: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  forgotText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: 'bold',
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
