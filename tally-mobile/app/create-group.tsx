import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { groupAPI } from "../services/api";
import { getUserId } from "../services/storage";

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateGroup() {
    if (!groupName.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }

    setLoading(true);
    try {
      const userId = getUserId();
      await groupAPI.createGroup(groupName.trim(), userId);
      Alert.alert("Success", `Group "${groupName}" created!`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", "Failed to create group. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <View style={styles.inner}>
      <Text style={styles.title}>Create a Group</Text>
      <Text style={styles.subtitle}>
        Give your group a name — like "KNUST Friends" or "Roommates"
      </Text>

      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter group name"
        placeholderTextColor="#8890A0"
        value={groupName}
        onChangeText={setGroupName}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCreateGroup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text style={styles.buttonText}>Create Group</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
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
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 32,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ffffff15",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    padding: 16,
    alignItems: "center",
  },
  cancelText: {
    color: "#8890A0",
    fontSize: 15,
  },
});
