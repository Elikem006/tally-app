import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { categoriesAPI } from "../services/api";
import { getUserId } from "../services/storage";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";
import { useConfirmModal } from "../hooks/useConfirmModal";

type CustomCategory = { id: number; name: string; emoji: string };

export default function ManageCategoriesScreen() {
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [creating, setCreating] = useState(false);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
    }, []),
  );

  async function fetchCategories() {
    try {
      setLoading(true);
      const res = await categoriesAPI.getUserCategories(getUserId());
      setCategories(res.data || []);
    } catch {
      showToast("Could not load categories", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newEmoji.trim() || !newName.trim()) {
      showToast("Please enter both emoji and category name", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await categoriesAPI.createCategory(getUserId(), newName.trim(), newEmoji.trim());
      setCategories((prev) => [...prev, res.data]);
      setNewName("");
      setNewEmoji("");
      setShowAddModal(false);
      showToast("Category created!", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to create category", "error");
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
      confirmColor: '#E05C5C',
      onConfirm: async () => {
        try {
          await categoriesAPI.deleteCategory(String(cat.id), getUserId());
          setCategories((prev) => prev.filter((c) => c.id !== cat.id));
          showToast("Category deleted", "success");
        } catch {
          showToast("Failed to delete category", "error");
        }
      },
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.flex}>
        <View style={styles.header}>
          <Text style={styles.title}>My Categories</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          The 5 default categories (Food, Transport, Entertainment, Utilities, Other) cannot be deleted.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#00C896" style={{ marginTop: 40 }} />
        ) : categories.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={styles.emptyTitle}>No custom categories yet</Text>
            <Text style={styles.emptySubtitle}>Tap "+ Add" to create your first one</Text>
          </View>
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.categoryRow}>
                <Text style={styles.emoji}>{item.emoji}</Text>
                <Text style={styles.name}>{item.name}</Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        {/* Add Category Modal */}
        <Modal
          visible={showAddModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddModal(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              onPress={() => setShowAddModal(false)}
              activeOpacity={1}
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Category</Text>

              <Text style={styles.modalLabel}>Emoji</Text>
              <TextInput
                style={styles.modalInput}
                value={newEmoji}
                onChangeText={setNewEmoji}
                placeholder="e.g. 🎓"
                placeholderTextColor="#8890A0"
                maxLength={4}
              />

              <Text style={styles.modalLabel}>Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Education"
                placeholderTextColor="#8890A0"
                maxLength={30}
                autoFocus
              />

              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreate}
                disabled={creating}
                activeOpacity={0.7}
              >
                {creating ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  setNewName("");
                  setNewEmoji("");
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
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
  flex: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
  },
  addBtn: {
    backgroundColor: "#00C896",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    color: "#8890A0",
    paddingHorizontal: 24,
    marginBottom: 16,
    lineHeight: 18,
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  emoji: {
    fontSize: 26,
    marginRight: 12,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#ffffff",
  },
  deleteBtn: {
    backgroundColor: "#E05C5C20",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E05C5C",
  },
  deleteBtnText: {
    color: "#E05C5C",
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#8890A0",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000080",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1A1F2E",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "#ffffff15",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 20,
    textAlign: "center",
  },
  modalLabel: {
    fontSize: 13,
    color: "#8890A0",
    marginBottom: 6,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: "#0F1117",
    borderRadius: 12,
    padding: 14,
    color: "#ffffff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ffffff20",
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: "#00C896",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  createButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#ffffff20",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#8890A0",
    fontSize: 15,
  },
});
