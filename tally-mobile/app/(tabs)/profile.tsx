import { useState, useEffect } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { currentUser } from '../(auth)/login';

export default function ProfileScreen() {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  useEffect(() => {
    loadProfileImage();
  }, []);

  async function loadProfileImage() {
    try {
      const saved = await AsyncStorage.getItem(`profile_image_${currentUser.userId}`);
      if (saved) {
        setProfileImage(saved);
      }
    } catch (e) {
      console.log('Error loading profile image:', e);
    }
  }

  async function saveProfileImage(uri: string) {
    try {
      await AsyncStorage.setItem(`profile_image_${currentUser.userId}`, uri);
      setProfileImage(uri);
    } catch (e) {
      console.log('Error saving profile image:', e);
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
    } catch (err) {
      console.log('Error selecting photo:', err);
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
    } catch (err) {
      console.log('Error taking photo:', err);
      Alert.alert('Error', 'Failed to take photo with camera.');
    }
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          // Clear global user session
          currentUser.token = '';
          currentUser.userId = '';
          currentUser.userName = '';
          currentUser.email = '';
          // Navigate back to login
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  function triggerImageOptions() {
    Alert.alert(
      'Profile Photo',
      'Upload a profile picture from your device or links:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose from Gallery / Files 📁',
          onPress: pickImageFromGallery,
        },
        {
          text: 'Take Photo 📸',
          onPress: takePhotoWithCamera,
        },
        {
          text: 'Enter Image URL...',
          onPress: () => {
            setInputUrl(profileImage || '');
            setShowUrlModal(true);
          },
        },
        profileImage
          ? {
              text: 'Remove Photo',
              style: 'destructive',
              onPress: async () => {
                try {
                  await AsyncStorage.removeItem(`profile_image_${currentUser.userId}`);
                  setProfileImage(null);
                } catch (e) {
                  console.log('Error removing photo:', e);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light card container */}
      <View style={styles.mainCard}>
        <Text style={styles.cardHeaderTitle}>My Profile</Text>

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
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {currentUser.userName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cameraIconContainer}>
              <Feather name="camera" size={14} color="#ffffff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{currentUser.userName}</Text>
          <Text style={styles.subtitle}>Tally Member</Text>
        </View>

        {/* Profile Details Capsules */}
        <Text style={styles.label}>Profile Details</Text>

        <View style={styles.detailCapsule}>
          <Text style={styles.detailLabel}>Name</Text>
          <Text style={styles.detailValue}>{currentUser.userName}</Text>
        </View>

        <View style={styles.detailCapsule}>
          <Text style={styles.detailLabel}>Email</Text>
          <Text style={styles.detailValue}>{currentUser.email || 'N/A'}</Text>
        </View>

        <View style={styles.detailCapsule}>
          <Text style={styles.detailLabel}>User ID</Text>
          <Text style={styles.detailValue}>#{currentUser.userId}</Text>
        </View>

        <View style={styles.detailCapsule}>
          <Text style={styles.detailLabel}>Account Type</Text>
          <Text style={styles.detailValue}>Standard</Text>
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
          <View style={styles.modalContentCard}>
            <Text style={styles.modalTitle}>Paste Image URL</Text>
            <Text style={styles.modalSubtitle}>Provide a link to your online profile photo:</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="https://example.com/avatar.jpg"
              placeholderTextColor="#8E9AA6"
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowUrlModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSaveUrl}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // White wrapper card
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
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#EAEBEF',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111111',
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
    marginTop: 8,
  },
  detailCapsule: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  detailLabel: {
    fontSize: 14,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#FF3B3012',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 26, 0.4)', // Soft overlay dims outer screens
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContentCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    color: '#111111',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#F2F4F7',
  },
  modalBtnCancelText: {
    color: '#8E9AA6',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalBtnSave: {
    backgroundColor: '#111111',
  },
  modalBtnSaveText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
