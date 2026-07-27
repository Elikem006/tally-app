import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { categoriesAPI } from '../services/api';
import { getUserId } from '../services/storage';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Button, Input, EmptyState, Skeleton } from '../components/ui';

type CustomCategory = { id: number; name: string; emoji: string };

export default function ManageCategoriesScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [creating, setCreating] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  // First load only — returning from the add-category modal re-focuses this
  // screen, and without the guard the list it just updated blinked away.
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      fetchCategories(!hasLoadedOnce.current);
    }, []),
  );

  async function fetchCategories(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      setLoading(true);
      const res = await categoriesAPI.getUserCategories(getUserId());
      setCategories(res.data || []);
    } catch {
      showToast('Could not load categories', 'error');
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newEmoji.trim() || !newName.trim()) {
      showToast('Please enter both emoji and category name', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await categoriesAPI.createCategory(getUserId(), newName.trim(), newEmoji.trim());
      setCategories((prev) => [...prev, res.data]);
      setNewName('');
      setNewEmoji('');
      setShowAddModal(false);
      showToast('Category created!', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to create category', 'error');
    } finally {
      setCreating(false);
    }
  }

  function confirmDelete(cat: CustomCategory) {
    showConfirm({
      icon: '📦',
      title: 'Delete Category',
      message: `Are you sure you want to delete the "${cat.name}" category? Existing expenses with this category will keep their category name.`,
      confirmText: 'Delete',
      confirmColor: colors.negative,
      onConfirm: async () => {
        try {
          await categoriesAPI.deleteCategory(String(cat.id), getUserId());
          setCategories((prev) => prev.filter((c) => c.id !== cat.id));
          showToast('Category deleted', 'success');
        } catch {
          showToast('Failed to delete category', 'error');
        }
      },
    });
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.flex}>
        <View style={styles.header}>
          <Text style={[typography.display, { color: colors.text }]} accessibilityRole="header">My Categories</Text>
          <Button title="+ Add" onPress={() => setShowAddModal(true)} size="sm" fullWidth={false} />
        </View>

        <Text style={[typography.caption, { color: colors.textSecondary, paddingHorizontal: spacing.xl, marginBottom: spacing.lg, lineHeight: 18 }]}>
          The 5 default categories (Food, Transport, Entertainment, Utilities, Other) cannot be deleted.
        </Text>

        {loading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={62} borderRadius={radius.lg} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : categories.length === 0 ? (
          <EmptyState icon="tag" title="No custom categories yet" body='Tap "+ Add" to create your first one' />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.categoryRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                <Text style={{ fontSize: 26, marginRight: spacing.md }}>{item.emoji}</Text>
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>{item.name}</Text>
                <TouchableOpacity
                  style={[styles.deleteBtn, { backgroundColor: `${colors.negative}20`, borderColor: colors.negative }]}
                  onPress={() => confirmDelete(item)}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <Text style={[typography.caption, { color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowAddModal(false)} activeOpacity={1} />
            <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
              <Text style={[typography.headline, { color: colors.text, textAlign: 'center', marginBottom: spacing.lg }]}>New Category</Text>

              <Input label="Emoji" value={newEmoji} onChangeText={setNewEmoji} placeholder="e.g. 🎓" maxLength={4} containerStyle={{ marginBottom: spacing.md }} />
              <Input label="Name" value={newName} onChangeText={setNewName} placeholder="e.g. Education" maxLength={30} autoFocus containerStyle={{ marginBottom: spacing.lg }} />

              <Button title="Create" onPress={handleCreate} loading={creating} style={{ marginBottom: spacing.sm }} />
              <Button
                title="Cancel"
                onPress={() => {
                  setShowAddModal(false);
                  setNewName('');
                  setNewEmoji('');
                }}
                variant="secondary"
              />
            </View>
          </View>
        </Modal>

        {ConfirmModalComponent}
        <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  deleteBtn: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    borderWidth: 1,
  },
});
