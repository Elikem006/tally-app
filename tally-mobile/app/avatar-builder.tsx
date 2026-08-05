import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { authAPI } from '../services/api';
import { getUserId, currentUser } from '../services/storage';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Button } from '../components/ui';

export default function AvatarBuilderScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [photoUri, setPhotoUri] = useState<string | null>(
    currentUser.avatarType === 'photo' && currentUser.avatarData ? currentUser.avatarData : null
  );
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();

  /**
   * Resize to max 300×300 and compress to 60% JPEG before base64 encoding —
   * shrinks avatars from multiple MB to under ~100KB so API responses stay small.
   */
  async function compressImage(uri: string): Promise<string> {
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
      );
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return 'data:image/jpeg;base64,' + base64;
    } catch (error) {
      throw new Error('Failed to compress image');
    }
  }

  async function pickImage(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          showToast('Camera access is required.', 'error');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          showToast('Gallery access is required.', 'error');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Data = await compressImage(asset.uri);
        setPhotoUri(asset.uri);
        setPhotoBase64(base64Data);
      }
    } catch {
      showToast('Failed to pick image.', 'error');
    }
  }

  async function handleSave() {
    const dataToSave = photoBase64 ?? photoUri;
    if (!dataToSave || !dataToSave.startsWith('data:image')) {
      showToast('Please take or choose a photo first.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await authAPI.updateAvatar(getUserId(), 'photo', dataToSave);
      currentUser.avatarType = 'photo';
      currentUser.avatarData = dataToSave;
      showToast('Profile photo updated.', 'success');
      setTimeout(() => router.back(), 1500);
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const displayUri = photoBase64 ?? (photoUri?.startsWith('data:image') ? photoUri : null);
  const hasPhoto = !!displayUri;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.display, { color: colors.text, marginTop: 40, marginBottom: spacing.xs }]} accessibilityRole="header">Profile Photo</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxl, textAlign: 'center' }]}>
        Choose a photo to represent you in groups
      </Text>

      <View style={{ marginBottom: spacing.xxl }}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={styles.photo} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
            <Feather name="camera" size={28} color={colors.textSecondary} />
            <Text style={[typography.label, { color: colors.textSecondary }]}>No photo yet</Text>
          </View>
        )}
      </View>

      <View style={styles.pickerRow}>
        <TouchableOpacity style={[styles.pickerBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]} onPress={() => pickImage(true)}>
          <Text style={[typography.bodyCompact, { color: colors.text, textAlign: 'center' }]}>📷 Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.pickerBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]} onPress={() => pickImage(false)}>
          <Text style={[typography.bodyCompact, { color: colors.text, textAlign: 'center' }]}>🖼️ Choose from Gallery</Text>
        </TouchableOpacity>
      </View>

      <Button title="Save Photo" onPress={handleSave} loading={saving} disabled={!hasPhoto} style={{ marginTop: spacing.xl }} />

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, alignItems: 'center' },
  photo: { width: 120, height: 120, borderRadius: 60 },
  placeholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    gap: spacing.xs,
  },
  pickerRow: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  pickerBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtn: { padding: spacing.sm + 2, alignItems: 'center', marginTop: spacing.xs },
});
