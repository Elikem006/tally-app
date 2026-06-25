import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { router } from "expo-router";
import { currentUser } from "../(auth)/login";

export default function ProfileScreen() {
  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          // Clear the global user session
          currentUser.token = "";
          currentUser.userId = "";
          currentUser.userName = "";
          currentUser.email = "";
          // Navigate back to login
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {currentUser.userName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* User info */}
      <Text style={styles.name}>{currentUser.userName}</Text>
      <Text style={styles.subtitle}>Tally Member</Text>

      {/* Info cards */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Name</Text>
        <Text style={styles.cardValue}>{currentUser.userName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>User ID</Text>
        <Text style={styles.cardValue}>#{currentUser.userId}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Email</Text>
        <Text style={styles.cardValue}>{currentUser.email}</Text>
      </View>

      {/* Logout button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
    padding: 24,
    alignItems: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#00C896",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000000",
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#8890A0",
    marginBottom: 32,
  },
  card: {
    width: "100%",
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  cardLabel: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "500",
  },
  logoutButton: {
    width: "100%",
    backgroundColor: "#E05C5C20",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#E05C5C",
  },
  logoutText: {
    color: "#E05C5C",
    fontSize: 16,
    fontWeight: "bold",
  },
});
