import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { expenseAPI, authAPI } from '../../services/api';
import { getUserId, safeStorage, currentUser, resetCurrentUser, clearRememberedUser } from '../../services/storage';
import Avatar from '../../components/Avatar';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../hooks/useTheme';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode, colors, theme } = useTheme();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  // Stats States
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar + Phone from main branch
  const [avatarData, setAvatarData] = useState<string | null>(currentUser.avatarData || null);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  useEffect(() => {
    loadProfileImage();
    fetchStats(true);
  }, []);

  // Refresh avatar state every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setAvatarData(currentUser.avatarData || null);
    }, [])
  );

  async function loadProfileImage() {
    try {
      const saved = await safeStorage.getItem(`profile_image_${currentUser.userId}`);
      if (saved) {
        setProfileImage(saved);
      } else {
        setProfileImage(null);
      }
    } catch {
      // Non-critical — the generated avatar renders instead
    }
  }

  async function saveProfileImage(uri: string) {
    try {
      await safeStorage.setItem(`profile_image_${currentUser.userId}`, uri);
      setProfileImage(uri);
      showToast("Profile image updated!", "success");
    } catch {
      showToast("Could not save profile image", "error");
    }
  }

  async function fetchStats(showLoading = true) {
    if (showLoading) setLoadingStats(true);
    setError(null);
    try {
      const userId = getUserId();
      const [reportRes, expensesRes] = await Promise.all([
        expenseAPI.getMonthlyReport(userId),
        expenseAPI.getUserExpenses(userId),
      ]);

      const expenses: any[] = expensesRes.data || [];
      const report = reportRes.data || {};

      const totalExpenses = expenses.length;
      const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);

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
    } catch (err) {
      setError("Failed to load statistics. Pull down to refresh.");
    } finally {
      setLoadingStats(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchStats(false);
    await loadProfileImage();
    setRefreshing(false);
  }

  async function handleSavePhone() {
    const cleaned = phoneNumber.trim().replace(/\s/g, "");
    if (cleaned.length !== 10) {
      showToast("Enter a valid 10-digit phone number", "error");
      return;
    }
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

  async function pickImageFromGallery() {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Media Library permission is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        saveProfileImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image from gallery.');
    }
  }

  async function takePhotoWithCamera() {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        saveProfileImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Failed to take photo with camera.');
    }
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          resetCurrentUser();
          // Forget the persisted session so the app doesn't auto-login again
          await clearRememberedUser();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  function triggerImageOptions() {
    Alert.alert(
      'Profile Photo / Avatar',
      'Choose how you want to update your profile photo:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Design Custom Avatar (Presets) 🎨',
          onPress: () => router.push("/avatar-builder"),
        },
        {
          text: 'Choose from Gallery 📁',
          onPress: pickImageFromGallery,
        },
        {
          text: 'Take Photo 📸',
          onPress: takePhotoWithCamera,
        },
        {
          text: 'Paste Photo URL...',
          onPress: () => {
            setInputUrl(profileImage || '');
            setShowUrlModal(true);
          },
        },
        profileImage
          ? {
              text: 'Remove Custom Photo',
              style: 'destructive',
              onPress: async () => {
                try {
                  await safeStorage.removeItem(`profile_image_${currentUser.userId}`);
                  setProfileImage(null);
                  showToast("Profile image removed", "info");
                } catch {
                  showToast("Could not remove photo", "error");
                }
              },
            }
          : null,
      ].filter(Boolean) as any
    );
  }

  function handleSaveUrl() {
    if (inputUrl && inputUrl.trim().startsWith('http')) {
      saveProfileImage(inputUrl.trim());
      setShowUrlModal(false);
    } else {
      Alert.alert('Error', 'Please enter a valid HTTP/HTTPS image link.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Card container */}
        <View style={[styles.mainCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>My Profile</Text>

          {/* Avatar View with edit indicator */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={triggerImageOptions}
              activeOpacity={0.8}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarInnerWrapper}>
                  <Avatar
                    userId={Number(currentUser.userId)}
                    name={currentUser.userName}
                    size={96}
                    avatarData={avatarData}
                  />
                </View>
              )}
              <View style={styles.cameraIconContainer}>
                <Feather name="camera" size={14} color="#ffffff" />
              </View>
            </TouchableOpacity>

            <Text style={[styles.name, { color: colors.text }]}>{currentUser.userName}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tally Member</Text>
          </View>

          {/* Stats section */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Your Stats</Text>
          {loadingStats && !refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
          ) : error && !stats ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : stats ? (
            <View style={{ marginBottom: 16 }}>
              {/* 3-card stat row */}
              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.text }]}>{stats.totalExpenses}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Trx</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    GHS {stats.totalSpent.toFixed(0)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Spent</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    GHS {stats.thisMonthSpent.toFixed(0)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>This Month</Text>
                </View>
              </View>

              {/* Top category card */}
              {stats.topCategory?.category && (
                <View style={[styles.topCategoryCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 28 }}>
                    {CATEGORY_ICONS[stats.topCategory.category] || "📦"}
                  </Text>
                  <View>
                    <Text style={[styles.topCatName, { color: colors.text }]}>{stats.topCategory.category}</Text>
                    <Text style={[styles.topCatSub, { color: colors.textSecondary }]}>Your most spent category</Text>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {/* Navigation Action Links */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Actions</Text>
          <TouchableOpacity
            style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
            onPress={() => router.push('/(tabs)/reminders')}
            activeOpacity={0.8}
          >
            <View style={styles.actionLeft}>
              <Feather name="bell" size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Bill Reminders</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
            onPress={() => router.push('/(tabs)/report')}
            activeOpacity={0.8}
          >
            <View style={styles.actionLeft}>
              <Feather name="trending-up" size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Financial Reports</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
            onPress={() => router.push('/help')}
            activeOpacity={0.8}
          >
            <View style={styles.actionLeft}>
              <Feather name="help-circle" size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Help & Support</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Preferences / Theme Selector */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Preferences</Text>
          <View style={[styles.themeSelectorCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.themeSelectorTitle, { color: colors.text }]}>App Theme</Text>
            <View style={[styles.themeSelectorRow, { backgroundColor: colors.neutralBg }]}>
              {(['light', 'dark', 'system'] as const).map((mode) => {
                const isActive = themeMode === mode;
                const labelMap = { light: '☀️ Light', dark: '🌙 Dark', system: '⚙️ System' };
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.themeBtn,
                      isActive && { backgroundColor: colors.cardBg }
                    ]}
                    onPress={() => setThemeMode(mode)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.themeBtnText,
                      { color: colors.textSecondary },
                      isActive && { color: colors.text, fontWeight: 'bold' }
                    ]}>
                      {labelMap[mode]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Profile Details Capsules */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Profile Details</Text>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.text }]}>Name</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{currentUser.userName}</Text>
          </View>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.text }]}>Email</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>{currentUser.email || 'N/A'}</Text>
          </View>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.text }]}>User ID</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>#{currentUser.userId}</Text>
          </View>

          {/* MoMo number capsule */}
          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }, editingPhone && { height: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.detailLabel, { color: colors.text }]}>MoMo Number</Text>
              {!editingPhone && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.detailValue, { marginRight: 8, color: colors.textSecondary }]}>
                    {currentUser.phoneNumber || 'Not set'}
                  </Text>
                  <TouchableOpacity onPress={() => setEditingPhone(true)}>
                    <Text style={[styles.editLinkText, { color: colors.primary }]}>
                      {currentUser.phoneNumber ? 'Edit' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {editingPhone && (
              <View style={styles.phoneInputRow}>
                <TextInput
                  style={[styles.phoneInputSmall, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="e.g. 0241234567"
                  placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                  autoFocus
                />
                <View style={styles.phoneActions}>
                  <TouchableOpacity onPress={handleSavePhone} disabled={savingPhone} style={styles.phoneActionBtn}>
                    {savingPhone ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.phoneActionBtnText, { color: colors.primary }]}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingPhone(false); setPhoneNumber(currentUser.phoneNumber || ""); }} style={styles.phoneActionBtn}>
                    <Text style={styles.phoneActionBtnCancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.text }]}>Account Type</Text>
            <Text style={[styles.detailValue, { color: colors.textSecondary }]}>Standard</Text>
          </View>

          {/* Logout button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Cross-platform Modal for entering Image URL */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={showUrlModal}
          onRequestClose={() => setShowUrlModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContentCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Paste Image URL</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Provide a link to your online profile photo:</Text>

              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                value={inputUrl}
                onChangeText={setInputUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.neutralBg }]}
                  onPress={() => setShowUrlModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalBtnCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveUrl}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalBtnSaveText, { color: '#ffffff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  themeSelectorCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  themeSelectorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  themeBtnActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  themeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  themeBtnTextActive: {
    fontWeight: 'bold',
  },
  flex: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F8F9FA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  avatarInnerWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    overflow: 'hidden',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111111',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111111',
    marginTop: 14,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 16,
  },
  
  // Stats row styles
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  topCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 20,
    padding: 16,
  },
  topCatName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  topCatSub: {
    fontSize: 11,
    color: '#8E9AA6',
    marginTop: 2,
  },

  // Detail capsules & Actions
  detailCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  detailLabel: {
    fontSize: 13,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '700',
  },
  editLinkText: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: 'bold',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '700',
  },

  // Phone input row styles
  phoneInputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  phoneInputSmall: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    color: '#111111',
    fontSize: 14,
    fontWeight: 'bold',
  },
  phoneActions: {
    flexDirection: 'row',
    gap: 6,
  },
  phoneActionBtn: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  phoneActionBtnText: {
    color: '#8B5CF6',
    fontWeight: 'bold',
    fontSize: 13,
  },
  phoneActionBtnCancel: {
    color: '#8E9AA6',
    fontWeight: '600',
    fontSize: 13,
  },

  // Logout button styles
  logoutButton: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#FF3B3010',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Modal URL styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    color: '#111111',
    fontSize: 14,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    borderWidth: 1,
    borderColor: '#EAEBEF',
    backgroundColor: '#ffffff',
  },
  modalBtnCancelText: {
    color: '#8E9AA6',
    fontWeight: '600',
    fontSize: 14,
  },
  modalBtnSave: {
    backgroundColor: '#111111',
  },
  modalBtnSaveText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  // General
  errorText: {
    fontSize: 14,
    color: '#8E9AA6',
    textAlign: 'center',
    marginVertical: 16,
  },
});
