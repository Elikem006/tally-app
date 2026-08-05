import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { expenseAPI, authAPI } from '../services/api';
import { getUserId, safeStorage, currentUser, resetCurrentUser, clearRememberedUser, refreshRememberedUser, notifyUserChanged } from '../services/storage';
import Avatar from '../components/Avatar';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { useActionSheet } from '../hooks/useActionSheet';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Card, Button, Input, CategoryIcon, Skeleton } from '../components/ui';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode, theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avatarData, setAvatarData] = useState<string | null>(currentUser.avatarData || null);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || '');
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const [name, setName] = useState(currentUser.userName || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [editingField, setEditingField] = useState<'name' | 'email' | null>(null);
  const [savingField, setSavingField] = useState(false);
  // Only used for an email change — the server requires it there and nowhere else
  const [currentPassword, setCurrentPassword] = useState('');
  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();
  const { showActionSheet, ActionSheetComponent } = useActionSheet();

  useEffect(() => {
    loadProfileImage();
    fetchStats(true);
  }, []);

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
      showToast('Profile image updated!', 'success');
    } catch {
      showToast('Could not save profile image', 'error');
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

      const isSettlement = (e: any) => e.paymentMethod === 'SETTLEMENT';
      // Income is stored as a positive amount (MoMo vendor transfers are the
      // exception — money-out despite the positive sign); settlements are
      // money back, not spending or income. Neither belongs in "spent" stats.
      const isIncomeEntry = (e: any) => {
        const amt = parseFloat(e.amount || '0');
        return amt > 0 && e.paymentMethod !== 'MOMO_TRANSFER' && !isSettlement(e);
      };
      const isSpend = (e: any) => !isSettlement(e) && !isIncomeEntry(e);
      const totalExpenses = expenses.filter(isSpend).length;
      const totalSpent = expenses
        .filter(isSpend)
        .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);

      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const monthIncome = expenses
        .filter((e) => isIncomeEntry(e) && e.date?.startsWith(monthPrefix))
        .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);

      const dateSet = new Set(expenses.filter(isSpend).map((e) => e.date));
      const key = (dt: Date) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      let streak = 0;
      const cursor = new Date();
      if (!dateSet.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (dateSet.has(key(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      const daysThisMonth = [...dateSet].filter(
        (d) => typeof d === 'string' && (d as string).startsWith(monthPrefix),
      ).length;

      const perf: any[] = report.budgetPerformance || [];
      let personality = { label: '🌱 Getting Started', desc: 'Set budgets to unlock your spending personality' };
      if (perf.length > 0) {
        const onTrack = perf.filter((b) => (parseFloat(b.percentage) || 0) < 80).length;
        const ratio = onTrack / perf.length;
        personality =
          ratio >= 0.8
            ? { label: '🦉 The Saver', desc: 'You stay well within your budgets' }
            : ratio >= 0.5
              ? { label: '⚖️ The Balancer', desc: 'Mostly on budget, with the occasional splurge' }
              : { label: '🎢 The Spender', desc: 'Your budgets are working overtime' };
      }

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
        monthIncome,
        streak,
        daysThisMonth,
        personality,
      });
    } catch (err) {
      setError('Failed to load statistics. Pull down to refresh.');
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
    const cleaned = phoneNumber.trim().replace(/\s/g, '');
    if (cleaned.length !== 10) {
      showToast('Enter a valid 10-digit phone number', 'error');
      return;
    }
    setSavingPhone(true);
    try {
      await authAPI.updatePhone(getUserId(), cleaned);
      currentUser.phoneNumber = cleaned;
      setEditingPhone(false);
      showToast('Phone number saved!', 'success');
    } catch {
      showToast('Failed to save phone number', 'error');
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleSaveField(field: 'name' | 'email') {
    const value = (field === 'name' ? name : email).trim();

    if (!value) {
      showToast(field === 'name' ? 'Name cannot be empty' : 'Email cannot be empty', 'error');
      return;
    }
    // Same rule the server applies, so the common typo is caught without a round trip
    if (field === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    const previous = field === 'name' ? currentUser.userName : currentUser.email;
    if (value === previous) {
      setEditingField(null);
      setCurrentPassword('');
      return;
    }

    // Changing the email is a credential-level change: it's the password-reset
    // channel, so the server won't accept it without the account password.
    if (field === 'email' && !currentPassword) {
      showToast('Enter your current password to change your email', 'error');
      return;
    }

    setSavingField(true);
    try {
      await authAPI.updateProfile(getUserId(), {
        [field]: value,
        ...(field === 'email' ? { currentPassword } : {}),
      });
      if (field === 'name') {
        currentUser.userName = value;
      } else {
        currentUser.email = value;
        // The server un-verifies on change and sends a fresh link, so the
        // nudge should reappear rather than claim the new address is confirmed.
        currentUser.emailVerified = false;
      }
      // Keeps a "remember me" session from restoring the pre-edit values on
      // next launch. Guarded so it can't create one the user declined.
      await refreshRememberedUser();
      notifyUserChanged();
      setEditingField(null);
      setCurrentPassword('');
      showToast(
        field === 'name'
          ? 'Name updated!'
          : 'Email updated — check your inbox to confirm it',
        'success',
      );
    } catch (err: any) {
      showToast(err?.response?.data?.error || `Failed to update ${field}`, 'error');
    } finally {
      setSavingField(false);
    }
  }

  async function pickImageFromGallery() {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showToast('Media Library permission is required to select photos.', 'error');
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
      showToast('Failed to pick image from gallery.', 'error');
    }
  }

  async function takePhotoWithCamera() {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        showToast('Camera permission is required to take photos.', 'error');
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
      showToast('Failed to take photo with camera.', 'error');
    }
  }

  function handleLogout() {
    showConfirm({
      icon: 'log-out',
      title: 'Log Out',
      message: 'Are you sure you want to log out of Tally?',
      confirmText: 'Log Out',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        resetCurrentUser();
        await clearRememberedUser();
        router.replace('/(auth)/login');
      },
    });
  }

  function handleRemovePhone() {
    showConfirm({
      icon: 'smartphone',
      title: 'Remove MoMo Number',
      message: 'Are you sure you want to remove your MoMo number? You will need to re-enter it to make MoMo payments.',
      confirmText: 'Remove',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        try {
          await authAPI.updatePhone(getUserId(), '');
          currentUser.phoneNumber = '';
          setPhoneNumber('');
          showToast('MoMo number removed', 'info');
        } catch {
          showToast('Failed to remove phone number', 'error');
        }
      },
    });
  }

  function triggerImageOptions() {
    showActionSheet({
      title: 'Profile Photo / Avatar',
      message: 'Choose how you want to update your profile photo',
      options: [
        {
          label: 'Set Group Profile Photo',
          icon: <Feather name="user" size={18} color={colors.text} />,
          onPress: () => router.push('/avatar-builder'),
        },
        {
          label: 'Choose from Gallery',
          icon: <Feather name="image" size={18} color={colors.text} />,
          onPress: pickImageFromGallery,
        },
        {
          label: 'Take Photo',
          icon: <Feather name="camera" size={18} color={colors.text} />,
          onPress: takePhotoWithCamera,
        },
        {
          label: 'Paste Photo URL...',
          icon: <Feather name="link" size={18} color={colors.text} />,
          onPress: () => {
            setInputUrl(profileImage || '');
            setShowUrlModal(true);
          },
        },
        ...(profileImage
          ? [{
              label: 'Remove Custom Photo',
              icon: <Feather name="trash-2" size={18} color={colors.negative} />,
              destructive: true,
              onPress: async () => {
                try {
                  await safeStorage.removeItem(`profile_image_${currentUser.userId}`);
                  setProfileImage(null);
                  showToast('Profile image removed', 'info');
                } catch {
                  showToast('Could not remove photo', 'error');
                }
              },
            }]
          : []),
      ],
    });
  }

  function handleSaveUrl() {
    if (inputUrl && inputUrl.trim().startsWith('http')) {
      saveProfileImage(inputUrl.trim());
      setShowUrlModal(false);
    } else {
      showToast('Please enter a valid HTTP/HTTPS image link.', 'error');
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        <Card elevation="raised">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginRight: spacing.sm, padding: spacing.xs }}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[typography.display, { color: colors.text, flex: 1 }]} accessibilityRole="header">My Profile</Text>
          </View>

          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={triggerImageOptions}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarInnerWrapper}>
                  <Avatar userId={Number(currentUser.userId)} name={currentUser.userName} size={96} avatarData={avatarData} />
                </View>
              )}
              <View style={[styles.cameraIconContainer, { backgroundColor: colors.text, borderColor: colors.surfaceElevated }]}>
                <Feather name="camera" size={14} color={colors.background} />
              </View>
            </TouchableOpacity>

            <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>{currentUser.userName}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>Tally Member</Text>
          </View>

          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm + 2 }]}>Your Stats</Text>
          {loadingStats && !refreshing ? (
            // Shaped like the stats grid it stands in for. A small spinner
            // here occupied roughly 40px and was then replaced by a block
            // several hundred tall, shoving everything below it down the page.
            <View style={{ marginBottom: spacing.md, gap: spacing.sm + 2 }}>
              <View style={styles.statsRow}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={66} borderRadius={radius.lg} style={{ flex: 1 }} />
                ))}
              </View>
              <Skeleton height={72} borderRadius={radius.lg} />
              <Skeleton height={72} borderRadius={radius.lg} />
            </View>
          ) : error && !stats ? (
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.lg }]}>{error}</Text>
          ) : stats ? (
            <View style={{ marginBottom: spacing.md, gap: spacing.sm + 2 }}>
              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.title, { color: colors.text, marginBottom: 2 }]}>{stats.totalExpenses}</Text>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>Total Trx</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.title, { color: colors.text, marginBottom: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                    GHS {stats.totalSpent.toFixed(0)}
                  </Text>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>Total Spent</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[typography.title, { color: colors.text, marginBottom: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                    GHS {stats.thisMonthSpent.toFixed(0)}
                  </Text>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>This Month</Text>
                </View>
              </View>

              {stats.topCategory?.category && (
                <View style={[styles.topCategoryCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <CategoryIcon category={stats.topCategory.category} size={40} />
                  <View>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{stats.topCategory.category}</Text>
                    <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>Your most spent category</Text>
                  </View>
                </View>
              )}

              <View style={[styles.topCategoryCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={{ fontSize: 28 }}>⚖️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>Net This Month</Text>
                  <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>
                    <Text style={{ color: colors.positive, fontFamily: typography.bodyStrong.fontFamily }}>+GHS {(stats.monthIncome ?? 0).toFixed(2)}</Text>
                    {'  in  •  '}
                    <Text style={{ color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }}>-GHS {(stats.thisMonthSpent ?? 0).toFixed(2)}</Text>
                    {'  out'}
                  </Text>
                </View>
              </View>

              {stats.personality && (
                <View style={[styles.topCategoryCard, { backgroundColor: colors.primarySubtle, borderColor: `${colors.primary}30` }]}>
                  <Text style={{ fontSize: 28 }}>{stats.personality.label.split(' ')[0]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyStrong, { color: colors.primary }]}>
                      {stats.personality.label.split(' ').slice(1).join(' ')}
                    </Text>
                    <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>{stats.personality.desc}</Text>
                  </View>
                </View>
              )}

              <View style={[styles.topCategoryCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={{ fontSize: 28 }}>🔥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>
                    {stats.streak ?? 0} day streak of logging expenses
                  </Text>
                  <Text style={[typography.label, { color: colors.textSecondary, marginTop: 2 }]}>
                    ✅ {stats.daysThisMonth ?? 0} day{(stats.daysThisMonth ?? 0) === 1 ? '' : 's'} this month with logged expenses
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm + 2 }]}>Actions</Text>
          <TouchableOpacity style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => router.push('/reminders')} activeOpacity={0.8}>
            <View style={styles.actionLeft}>
              <Feather name="bell" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
              <Text style={[typography.labelStrong, { color: colors.text }]}>Bill Reminders</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => router.push('/report')} activeOpacity={0.8}>
            <View style={styles.actionLeft}>
              <Feather name="trending-up" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
              <Text style={[typography.labelStrong, { color: colors.text }]}>Financial Reports</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => router.push('/help')} activeOpacity={0.8}>
            <View style={styles.actionLeft}>
              <Feather name="help-circle" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
              <Text style={[typography.labelStrong, { color: colors.text }]}>Help & Support</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm + 2 }]}>Preferences</Text>
          <View style={[styles.themeSelectorCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>App Theme</Text>
            <View style={[styles.themeSelectorRow, { backgroundColor: colors.neutralBg }]}>
              {(['light', 'dark', 'system'] as const).map((mode) => {
                const isActive = themeMode === mode;
                const labelMap = { light: '☀️ Light', dark: '🌙 Dark', system: '⚙️ System' };
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.themeBtn, isActive && { backgroundColor: colors.surfaceElevated }]}
                    onPress={() => setThemeMode(mode)}
                    activeOpacity={0.8}
                  >
                    <Text style={[typography.caption, { color: isActive ? colors.text : colors.textSecondary, fontFamily: isActive ? typography.bodyStrong.fontFamily : typography.caption.fontFamily }]}>
                      {labelMap[mode]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm + 2 }]}>Profile Details</Text>

          {(['name', 'email'] as const).map((field) => {
            const isEditing = editingField === field;
            const label = field === 'name' ? 'Name' : 'Email';
            const stored = field === 'name' ? currentUser.userName : currentUser.email;
            const value = field === 'name' ? name : email;
            const setValue = field === 'name' ? setName : setEmail;
            return (
              <View
                key={field}
                style={[
                  styles.detailCapsule,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  isEditing && { height: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
                ]}
              >
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>{label}</Text>
                  {!isEditing && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginRight: spacing.sm }]} numberOfLines={1}>
                        {stored || 'Not set'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => { setValue(stored || ''); setCurrentPassword(''); setEditingField(field); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${label.toLowerCase()}`}
                      >
                        <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {/* Email needs a second input and a note, which don't fit the
                    single-line row the phone field uses — stack instead. */}
                {isEditing && (
                  <View style={[styles.phoneInputRow, field === 'email' && styles.stackedEditRow]}>
                    <TextInput
                      style={[typography.bodyStrong, styles.phoneInputSmall, field === 'email' && styles.stackedInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }]}
                      value={value}
                      onChangeText={setValue}
                      keyboardType={field === 'email' ? 'email-address' : 'default'}
                      autoCapitalize={field === 'email' ? 'none' : 'words'}
                      autoCorrect={false}
                      placeholder={field === 'email' ? 'you@example.com' : 'Your full name'}
                      placeholderTextColor={colors.textTertiary}
                      autoFocus
                    />
                    {field === 'email' && (
                      <>
                        <TextInput
                          style={[typography.bodyStrong, styles.phoneInputSmall, styles.stackedInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }]}
                          value={currentPassword}
                          onChangeText={setCurrentPassword}
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          placeholder="Current password"
                          placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={[typography.label, { color: colors.textSecondary }]}>
                          Your email is how you reset your password, so changing it needs your password.
                        </Text>
                      </>
                    )}
                    <View style={styles.phoneActions}>
                      <TouchableOpacity onPress={() => handleSaveField(field)} disabled={savingField} style={styles.phoneActionBtn}>
                        {savingField ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>Save</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingField(null); setValue(stored || ''); setCurrentPassword(''); }} style={styles.phoneActionBtn}>
                        <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>User ID</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>#{currentUser.userId}</Text>
          </View>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }, editingPhone && { height: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>MoMo Number</Text>
              {!editingPhone && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginRight: spacing.sm }]}>
                    {currentUser.phoneNumber || 'Not set'}
                  </Text>
                  <TouchableOpacity onPress={() => setEditingPhone(true)}>
                    <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>
                      {currentUser.phoneNumber ? 'Edit' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                  {!!currentUser.phoneNumber && (
                    <TouchableOpacity onPress={handleRemovePhone} style={{ marginLeft: spacing.sm + 2 }}>
                      <Text style={[typography.caption, { color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
            {editingPhone && (
              <View style={styles.phoneInputRow}>
                <TextInput
                  style={[typography.bodyStrong, styles.phoneInputSmall, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="e.g. 0241234567"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                />
                <View style={styles.phoneActions}>
                  <TouchableOpacity onPress={handleSavePhone} disabled={savingPhone} style={styles.phoneActionBtn}>
                    {savingPhone ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingPhone(false); setPhoneNumber(currentUser.phoneNumber || ''); }} style={styles.phoneActionBtn}>
                    <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.detailCapsule, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>Account Type</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Standard</Text>
          </View>

          <Button title="Log Out" onPress={handleLogout} variant="danger" style={{ marginTop: spacing.lg }} />
        </Card>

        <Modal animationType="fade" transparent visible={showUrlModal} onRequestClose={() => setShowUrlModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContentCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.headline, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]}>Paste Image URL</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }]}>Provide a link to your online profile photo:</Text>

              <Input
                label="Image URL"
                placeholder="https://example.com/avatar.jpg"
                value={inputUrl}
                onChangeText={setInputUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                containerStyle={{ marginBottom: spacing.lg }}
              />

              <View style={styles.modalBtnRow}>
                <Button title="Cancel" onPress={() => setShowUrlModal(false)} variant="secondary" style={{ flex: 1 }} />
                <Button title="Save" onPress={handleSaveUrl} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

      {ConfirmModalComponent}
      {ActionSheetComponent}
      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarWrapper: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 48,
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
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  topCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  themeSelectorCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  detailCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneInputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stackedEditRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  // phoneInputSmall carries flex: 1 for the single-line phone row; in a column
  // that would fight the fixed height, so pin it back off.
  stackedInput: {
    flex: 0,
    width: '100%',
  },
  phoneInputSmall: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    height: 40,
  },
  phoneActions: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  phoneActionBtn: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContentCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
});
