import { useState } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { authAPI } from "../../services/api";
import { Feather, AntDesign, FontAwesome } from "@expo/vector-icons";

// Global store for user session
export let currentUser = {
  token: "",
  userId: "1",
  userName: "User",
  email: "",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const { token, userId, name, email: userEmail } = response.data;
      currentUser.token = token;
      currentUser.userId = String(userId);
      currentUser.userName = name;
      currentUser.email = userEmail ?? "";
      setLoading(false);
      router.replace("/(tabs)");
    } catch (error: any) {
      setLoading(false);
      Alert.alert("Login Failed", String(error));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Header spacer or welcome info could go here */}

          <View style={styles.form}>
            {/* Email Field */}
            <Text style={styles.label}>Email</Text>
            <View
              style={[
                styles.inputContainer,
                emailFocused && styles.inputFocused,
              ]}
            >
              <Feather name="at-sign" size={20} color="#8890A0" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your Email"
                placeholderTextColor="#8890A0"
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
              <Feather name="lock" size={20} color="#8890A0" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your Password"
                placeholderTextColor="#8890A0"
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
                  name={showPassword ? "eye" : "eye-off"}
                  size={20}
                  color="#8890A0"
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
                  {rememberMe && <Feather name="check" size={12} color="#000000" />}
                </View>
                <Text style={styles.checkboxLabel}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => Alert.alert("Forgot Password", "Feature coming soon!")}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Sign Up Link */}
            <View style={styles.linkContainer}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
                <Text style={styles.linkBold}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            {/* Or With divider */}
            <Text style={styles.dividerText}>Or With</Text>

            {/* Social Buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialButton}
                activeOpacity={0.7}
                onPress={() => Alert.alert("Google Login", "Integration coming soon!")}
              >
                <AntDesign name="google" size={18} color="#EA4335" />
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialButton}
                activeOpacity={0.7}
                onPress={() => Alert.alert("Apple Login", "Integration coming soon!")}
              >
                <FontAwesome name="apple" size={18} color="#ffffff" />
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
    backgroundColor: "#0F1117",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff15",
    borderRadius: 14,
    backgroundColor: "#0F1117",
    paddingHorizontal: 14,
    height: 56,
  },
  inputFocused: {
    borderColor: "#00C896",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    height: "100%",
  },
  eyeIcon: {
    padding: 4,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ffffff30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "#0F1117",
  },
  checkboxChecked: {
    backgroundColor: "#00C896",
    borderColor: "#00C896",
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#8890A0",
    fontWeight: "500",
  },
  forgotText: {
    fontSize: 14,
    color: "#00C896",
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#00C896",
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  linkContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  linkText: {
    fontSize: 14,
    color: "#8890A0",
    fontWeight: "500",
  },
  linkBold: {
    fontSize: 14,
    color: "#00C896",
    fontWeight: "700",
  },
  dividerText: {
    textAlign: "center",
    fontSize: 14,
    color: "#8890A0",
    fontWeight: "500",
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: "row",
    gap: 12,
  },
  socialButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff15",
    borderRadius: 14,
    height: 56,
    backgroundColor: "#0F1117",
    gap: 8,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
});

