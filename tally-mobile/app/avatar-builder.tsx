import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { authAPI } from "../services/api";
import { getUserId, currentUser } from "../services/storage";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import { useTheme } from '../hooks/useTheme';

export default function AvatarBuilderScreen() {
  const { colors, theme } = useTheme();
  const [photoUri,    setPhotoUri]    = useState<string | null>(
    currentUser.avatarType === "photo" && currentUser.avatarData ? currentUser.avatarData : null
  );
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

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
      return "data:image/jpeg;base64," + base64;
    } catch (error) {
      throw new Error("Failed to compress image");
    }
  }

  async function pickImage(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Camera access is required.");
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
          Alert.alert("Permission needed", "Gallery access is required.");
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
        // Compress BEFORE base64 conversion (300×300 @ 60% JPEG)
        const base64Data = await compressImage(asset.uri);
        setPhotoUri(asset.uri);
        setPhotoBase64(base64Data);
      }
    } catch {
      showToast("Failed to pick image.", "error");
    }
  }

  async function handleSave() {
    const dataToSave = photoBase64 ?? photoUri;
    if (!dataToSave || !dataToSave.startsWith("data:image")) {
      showToast("Please take or choose a photo first.", "warning");
      return;
    }
    setSaving(true);
    try {
      await authAPI.updateAvatar(getUserId(), "photo", dataToSave);
      currentUser.avatarType = "photo";
      currentUser.avatarData = dataToSave;
      showToast("Profile photo updated.", "success");
      setTimeout(() => router.back(), 1500);
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || "Failed to save.", "error");
    } finally {
      setSaving(false);
    }
  }

  const displayUri = photoBase64 ?? (photoUri?.startsWith("data:image") ? photoUri : null);
  const hasPhoto = !!displayUri;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Profile Photo</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose a photo to represent you in groups
      </Text>

      {/* Photo preview circle */}
      <View style={styles.previewContainer}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={styles.photo} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>No photo yet</Text>
          </View>
        )}
      </View>

      {/* Picker buttons — side by side */}
      <View style={styles.pickerRow}>
        <TouchableOpacity style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => pickImage(true)}>
          <Text style={[styles.pickerBtnText, { color: colors.text }]}>📷 Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => pickImage(false)}>
          <Text style={[styles.pickerBtnText, { color: colors.text }]}>🖼️ Choose from Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Save — green, disabled until a photo is selected */}
      <TouchableOpacity
        style={[styles.saveBtn, (saving || !hasPhoto) && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={saving || !hasPhoto}
      >
        {saving
          ? <ActivityIndicator color="#000000" />
          : <Text style={styles.saveBtnText}>Save Photo</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.neutralBg }]} onPress={() => router.back()}>
        <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#0F1117", padding: 24, alignItems: "center" },
  title:           { fontSize: 24, fontWeight: "bold", color: "#ffffff", marginTop: 40, marginBottom: 6 },
  subtitle:        { fontSize: 14, color: "#8890A0", marginBottom: 28, textAlign: "center" },

  previewContainer:{ marginBottom: 32 },
  photo:           { width: 120, height: 120, borderRadius: 60 },
  placeholder:     {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "#1A1F2E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#ffffff15", gap: 6,
  },
  cameraIcon:      { fontSize: 38 },
  placeholderText: { fontSize: 12, color: "#8890A0" },

  pickerRow:       { flexDirection: "row", gap: 12, width: "100%" },
  pickerBtn:       {
    flex: 1, backgroundColor: "#1A1F2E",
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 8,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#ffffff15",
  },
  pickerBtnText:   { fontSize: 14, color: "#ffffff", fontWeight: "500", textAlign: "center" },

  saveBtn:         { width: "100%", backgroundColor: "#00C896", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24 },
  saveBtnText:     { color: "#000000", fontSize: 16, fontWeight: "bold" },
  cancelBtn:       { padding: 14, alignItems: "center", marginTop: 4 },
  cancelBtnText:   { color: "#8890A0", fontSize: 14 },
});
