import { useState } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupAPI } from '../services/api';
import { getUserId } from '../services/storage';
import { useTheme } from '../hooks/useTheme';

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  async function handleCreateGroup() {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setLoading(true);
    try {
      const userId = getUserId();
      await groupAPI.createGroup(groupName.trim(), userId);
      Alert.alert('Success', `Group "${groupName}" created!`, [
        { text: 'OK', onPress: () => router.replace("/(tabs)/groups") },
      ]);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardContainer, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Card container */}
        <View style={[styles.mainCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>Create a Group</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Give your group a name — like "KNUST Friends" or "Roommates"
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Group Name</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              inputFocused && { borderColor: colors.primary }
            ]}
            placeholder="Enter group name"
            placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
            value={groupName}
            onChangeText={setGroupName}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
            onPress={handleCreateGroup}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Create Group</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.neutralBg }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // Elevated white container card
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E9AA6',
    marginBottom: 24,
    lineHeight: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    color: '#111111',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    marginBottom: 24,
  },
  inputFocused: {
    borderColor: '#111111', // Black border highlight
  },
  button: {
    backgroundColor: '#111111', // Black rounded button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#8E9AA6',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
