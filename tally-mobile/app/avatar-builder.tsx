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
import { authAPI } from "../services/api";
import { getUserId } from "../services/storage";
import { currentUser } from "./(auth)/login";

export default function AvatarBuilderScreen() {
  const [photoUri,    setPhotoUri]    = useState<string | null>(
    currentUser.avatarType === "photo" && currentUser.avatarData ? currentUser.avatarData : null
  );
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

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
          quality: 0.5,
          base64: true,
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
          quality: 0.5,
          base64: true,
          allowsEditing: true,
          aspect: [1, 1],
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const b64 = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : null;
        setPhotoUri(asset.uri);
        setPhotoBase64(b64);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  }

  async function handleSave() {
    const dataToSave = photoBase64 ?? photoUri;
    if (!dataToSave || !dataToSave.startsWith("data:image")) {
      Alert.alert("No photo", "Please take or choose a photo first.");
      return;
    }
    setSaving(true);
    try {
      await authAPI.updateAvatar(getUserId(), "photo", dataToSave);
      currentUser.avatarType = "photo";
      currentUser.avatarData = dataToSave;
      Alert.alert("Saved!", "Profile photo updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error || e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const displayUri = photoBase64 ?? (photoUri?.startsWith("data:image") ? photoUri : null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Edit Profile Photo</Text>

      {/* Photo preview circle */}
      <View style={styles.previewContainer}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={styles.photo} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.placeholderText}>No photo yet</Text>
          </View>
        )}
      </View>

      {/* Picker buttons */}
      <TouchableOpacity style={styles.pickerBtn} onPress={() => pickImage(true)}>
        <Text style={styles.pickerBtnText}>📷  Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pickerBtn} onPress={() => pickImage(false)}>
        <Text style={styles.pickerBtnText}>🖼️  Choose from Gallery</Text>
      </TouchableOpacity>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.saveBtnText}>Save Photo</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#0F1117", padding: 24, alignItems: "center" },
  title:           { fontSize: 24, fontWeight: "bold", color: "#ffffff", marginTop: 40, marginBottom: 32 },

  previewContainer:{ marginBottom: 32 },
  photo:           { width: 140, height: 140, borderRadius: 70 },
  placeholder:     {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#1A1F2E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#ffffff15", gap: 8,
  },
  cameraIcon:      { fontSize: 44 },
  placeholderText: { fontSize: 12, color: "#8890A0" },

  pickerBtn:       {
    width: "100%", backgroundColor: "#1A1F2E",
    borderRadius: 12, padding: 16, alignItems: "center",
    marginBottom: 12, borderWidth: 1, borderColor: "#ffffff15",
  },
  pickerBtnText:   { fontSize: 15, color: "#ffffff", fontWeight: "500" },

  saveBtn:         { width: "100%", backgroundColor: "#00C896", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16 },
  saveBtnText:     { color: "#000000", fontSize: 16, fontWeight: "bold" },
  cancelBtn:       { padding: 14, alignItems: "center", marginTop: 4 },
  cancelBtnText:   { color: "#8890A0", fontSize: 14 },
});
