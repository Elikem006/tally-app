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
} from "react-native";
import { router } from "expo-router";
import { authAPI } from "../../services/api";

// Global store for user session
export let currentUser = {
  token: "",
  userId: "1",
  userName: "",
  email: "",
  avatarType: "",
  avatarData: "",
  phoneNumber: "",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      next.email = "Email is required";
    } else {
      const atIndex = trimmedEmail.indexOf("@");
      if (atIndex < 1 || trimmedEmail.indexOf(".", atIndex) < 0) {
        next.email = "Enter a valid email address";
      }
    }
    if (!password) {
      next.password = "Password is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const { token, userId, name, email: userEmail, avatarType, avatarData, phoneNumber } = response.data;
      currentUser.token = token;
      currentUser.userId = String(userId);
      currentUser.userName = name;
      currentUser.email = userEmail ?? "";
      currentUser.avatarType = avatarType ?? "";
      currentUser.avatarData = avatarData ?? "";
      currentUser.phoneNumber = phoneNumber ?? "";
      setLoading(false);
      router.replace("/(tabs)");
    } catch (error: any) {
      setLoading(false);
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        (error.message === "Network Error"
          ? "Cannot reach server. Check that the backend is running and the IP in api.ts is correct."
          : error.message || "Something went wrong");
      Alert.alert("Login Failed", message);
    }
  }
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Tally 💰</Text>
        <Text style={styles.tagline}>
          Track your money. Split with friends.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            placeholder="you@example.com"
            placeholderTextColor="#8890A0"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, errors.password ? styles.inputError : null]}
            placeholder="Enter your password"
            placeholderTextColor="#8890A0"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            secureTextEntry
          />
          {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(auth)/register")} activeOpacity={0.7}>
            <Text style={styles.link}>
              Don't have an account?{" "}
              <Text style={styles.linkBold}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  logo: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#00C896",
    textAlign: "center",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
    marginBottom: 48,
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ffffff15",
    marginBottom: 16,
  },
  inputError: {
    borderColor: "#E05C5C",
    marginBottom: 4,
  },
  fieldError: {
    color: "#E05C5C",
    fontSize: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  link: {
    color: "#8890A0",
    textAlign: "center",
    fontSize: 14,
  },
  linkBold: {
    color: "#00C896",
    fontWeight: "bold",
  },
});
