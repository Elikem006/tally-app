import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { currentUser } from "../(auth)/login";
import { expenseAPI, authAPI } from "../../services/api";
import Toast from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { getUserId } from "../../services/storage";
import Avatar from "../../components/Avatar";

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: "🍔",
  Transport: "🚗",
  Entertainment: "🎮",
  Utilities: "💡",
  Other: "📦",
};

export default function ProfileScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarData, setAvatarData] = useState<string | null>(currentUser.avatarData || null);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  // Refresh avatar state every time this screen comes into focus
  // (so photos saved in avatar-builder appear immediately)
  useFocusEffect(useCallback(() => {
    setAvatarData(currentUser.avatarData || null);
  }, []));

  async function fetchStats() {
    try {
      const userId = getUserId();
      const [reportRes, expensesRes] = await Promise.all([
        expenseAPI.getMonthlyReport(userId),
        expenseAPI.getUserExpenses(userId),
      ]);

      const expenses: any[] = expensesRes.data || [];
      const report = reportRes.data;

      const totalExpenses = expenses.length;
      const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

      // Most used category
      const categoryCounts: { [key: string]: number } = {};
      for (const e of expenses) {
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      }
      const mostUsedCategory = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

      setStats({
        totalExpenses,
        totalSpent,
        mostUsedCategory,
        thisMonthSpent: parseFloat(report.currentMonth) || 0,
        topCategory: report.highestCategory,
      });
      setError(null);
    } catch (err) {
      setError("Could not load data. Pull down to refresh.");
    } finally {
      setLoadingStats(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchStats();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSavePhone() {
    const cleaned = phoneNumber.trim().replace(/\s/g, "");
    if (!/^\d{10}$/.test(cleaned)) {
      setPhoneError("Phone number must be exactly 10 digits");
      return;
    }
    setPhoneError(null);
    setSavingPhone(true);
    try {
      await authAPI.updatePhone(getUserId(), cleaned);
      currentUser.phoneNumber = cleaned;
      setEditingPhone(false);
      showToast("Phone number saved!", "success");
    } catch {
      showToast("Failed to save phone number", "error");
    } finally {
      setSavingPhone(false);
    }
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          currentUser.token = "";
          currentUser.userId = "1";
          currentUser.userName = "";
          currentUser.email = "";
          currentUser.avatarType = "";
          currentUser.avatarData = "";
          currentUser.phoneNumber = "";
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.scroll}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={["#00C896"]} />}
    >
      {/* Avatar */}
      <Avatar
        userId={Number(currentUser.userId)}
        name={currentUser.userName}
        size={88}
        avatarData={avatarData}
        style={styles.avatarMargin}
      />
      <TouchableOpacity style={styles.editAvatarBtn} onPress={() => router.push("/avatar-builder")} activeOpacity={0.7}>
        <Text style={styles.editAvatarText}>✏️  Edit Avatar</Text>
      </TouchableOpacity>

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

      {/* MoMo phone number card */}
      {!editingPhone ? (
        <View style={[styles.card, styles.infoCard]}>
          <Text style={styles.infoLabel}>MoMo Number</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>
              {currentUser.phoneNumber || "Not set"}
            </Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditingPhone(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>
                {currentUser.phoneNumber ? "Edit" : "+ Add"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.card, styles.infoCard]}>
          <Text style={styles.infoLabel}>MoMo Number</Text>
          <TextInput
            style={[styles.phoneInput, phoneError ? styles.inputError : null]}
            value={phoneNumber}
            onChangeText={(text) => {
              setPhoneNumber(text);
              if (phoneError) setPhoneError(null);
            }}
            keyboardType="phone-pad"
            placeholder="e.g. 0241234567"
            placeholderTextColor="#8890A0"
            maxLength={10}
            autoFocus
          />
          {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
          <View style={styles.phoneButtonRow}>
            <TouchableOpacity
              style={styles.phoneSaveButton}
              onPress={handleSavePhone}
              disabled={savingPhone}
              activeOpacity={0.7}
            >
              {savingPhone ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text style={styles.phoneSaveText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.phoneCancelButton}
              onPress={() => {
                setEditingPhone(false);
                setPhoneNumber(currentUser.phoneNumber || "");
                setPhoneError(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.phoneCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Stats section */}
      <Text style={styles.sectionTitle}>Your Stats</Text>

      {loadingStats ? (
        <ActivityIndicator size="small" color="#00C896" style={{ marginVertical: 16 }} />
      ) : error && !stats ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : stats ? (
        <>
          {/* 3-card stat row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalExpenses}</Text>
              <Text style={styles.statLabel}>Total Expenses</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit>
                GHS {stats.totalSpent.toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit>
                GHS {stats.thisMonthSpent.toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>This Month</Text>
            </View>
          </View>

          {/* Top category card */}
          {stats.topCategory?.category && (
            <View style={styles.topCategoryCard}>
              <Text style={{ fontSize: 32 }}>
                {CATEGORY_ICONS[stats.topCategory.category] || "📦"}
              </Text>
              <View>
                <Text style={styles.topCatName}>{stats.topCategory.category}</Text>
                <Text style={styles.topCatSub}>Your most spent category</Text>
              </View>
            </View>
          )}
        </>
      ) : null}

      {/* Help & Support */}
      <TouchableOpacity style={styles.helpButton} onPress={() => router.push("/help")} activeOpacity={0.7}>
        <Text style={styles.helpButtonIcon}>❓</Text>
        <Text style={styles.helpButtonText}>Help & Support</Text>
        <Text style={styles.helpButtonArrow}>›</Text>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  container: {
    padding: 24,
    alignItems: "center",
  },
  avatarMargin: {
    marginTop: 40,
    marginBottom: 10,
  },
  editAvatarBtn: {
    backgroundColor: "#1A1F2E",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  editAvatarText: {
    fontSize: 13,
    color: "#8890A0",
    fontWeight: "500",
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    alignSelf: "flex-start",
    marginTop: 24,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00C896",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "#8890A0",
    textAlign: "center",
  },
  topCategoryCard: {
    width: "100%",
    backgroundColor: "#1A1F2E",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#ffffff10",
    marginBottom: 10,
  },
  topCatName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  topCatSub: {
    fontSize: 12,
    color: "#8890A0",
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
    marginVertical: 16,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffffff10",
    gap: 12,
  },
  helpButtonIcon: { fontSize: 20 },
  helpButtonText: { flex: 1, color: "#ffffff", fontSize: 15, fontWeight: "500" },
  helpButtonArrow: { color: "#8890A0", fontSize: 20 },
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
  infoCard: {
    borderColor: "#00C89618",
  },
  infoLabel: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoValue: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "500",
  },
  editButton: {
    backgroundColor: "#00C89620",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#00C896",
  },
  editButtonText: {
    color: "#00C896",
  },
  phoneInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 14,
    color: "#ffffff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ffffff20",
    marginBottom: 10,
  },
  inputError: {
    borderColor: "#E05C5C",
    marginBottom: 4,
  },
  fieldError: {
    color: "#E05C5C",
    fontSize: 12,
    marginBottom: 10,
  },
  phoneButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  phoneSaveButton: {
    flex: 1,
    backgroundColor: "#00C896",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  phoneSaveText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 14,
  },
  phoneCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ffffff30",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  phoneCancelText: {
    color: "#8890A0",
    fontSize: 14,
  },
});
