import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { groupAPI } from '../services/api';
import { getUserId } from '../services/storage';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing } from '../theme';
import { Screen, Card, Input, Button } from '../components/ui';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

export default function CreateGroupScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();

  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  async function handleCreateGroup() {
    if (!groupName.trim()) {
      showToast('Please enter a group name', 'error');
      return;
    }

    setLoading(true);
    try {
      const userId = getUserId();
      await groupAPI.createGroup(groupName.trim(), userId);
      setSuccessVisible(true);
    } catch (error: any) {
      showToast('Failed to create group. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen keyboardAvoiding contentStyle={styles.scrollContent}>
      <Card elevation="raised">
        <Text style={[typography.display, { color: colors.text, marginBottom: spacing.xs }]} accessibilityRole="header">Create a Group</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
          Give your group a name — like "KNUST Friends" or "Roommates"
        </Text>

        <Input
          label="Group Name"
          placeholder="Enter group name"
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
          containerStyle={{ marginBottom: spacing.xl }}
        />

        <Button title="Create Group" onPress={handleCreateGroup} loading={loading} style={{ marginBottom: spacing.sm }} />
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" />
      </Card>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />

      <ConfirmModal
        visible={successVisible}
        title="Success"
        message={`Group "${groupName}" created!`}
        confirmText="OK"
        confirmColor={colors.positive}
        hideCancel
        onConfirm={() => {
          setSuccessVisible(false);
          router.replace('/(tabs)/groups');
        }}
        onCancel={() => {
          setSuccessVisible(false);
          router.replace('/(tabs)/groups');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
