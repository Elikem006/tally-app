import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

export default function BudgetScreen() {
  const [limits, setLimits] = useState<{ [key: string]: string }>({
    Food: '',
    Transport: '',
    Entertainment: '',
    Utilities: '',
    Other: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  useEffect(() => {
    loadExistingBudgets();
  }, []);

  async function loadExistingBudgets() {
    try {
      const userId = getUserId();
      const response = await budgetAPI.getUserBudgets(userId);
      const existing: { [key: string]: string } = {};
      response.data.forEach((budget: any) => {
        existing[budget.category] = String(budget.monthlyLimit);
      });
      setLimits({
        Food: '',
        Transport: '',
        Entertainment: '',
        Utilities: '',
        Other: '',
        ...existing,
      });
      setError(null);
    } catch (err) {
      setError('Could not load data. Pull down to refresh.');
    } finally {
      setFetching(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadExistingBudgets();
    setRefreshing(false);
  }

  function clearCategory(category: string) {
    setLimits((prev) => ({ ...prev, [category]: '' }));
  }

  function resetAll() {
    Alert.alert('Reset All Budgets', 'Clear all budget limits?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          // Clear local state immediately — this always works regardless of backend
          setLimits({ Food: '', Transport: '', Entertainment: '', Utilities: '', Other: '' });
          // Sync to backend best-effort (requires backend restart if DELETE endpoint is new)
          const userId = getUserId();
          for (const category of CATEGORIES) {
            try { await budgetAPI.deleteBudget(userId, category); } catch {}
          }
        },
      },
    ]);
  }

  async function handleSave() {
    // Validate: every non-empty limit must be a positive number
    const errors: { [key: string]: string } = {};
    for (const category of CATEGORIES) {
      const value = limits[category];
      if (value && value.trim() !== '') {
        const parsed = parseFloat(value);
        if (isNaN(parsed) || parsed <= 0) {
          errors[category] = 'Enter a number greater than 0';
        }
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const userId = getUserId();
    setLoading(true);
    try {
      for (const category of CATEGORIES) {
        const value = limits[category];
        if (value && value !== '0') {
          await budgetAPI.setBudget(userId, category, value);
        } else {
          // Best-effort delete — don't let a failed delete block saving other categories
          try { await budgetAPI.deleteBudget(userId, category); } catch {}
        }
      }
      showToast('Your budgets have been saved!', 'success');
      await loadExistingBudgets();
    } catch (error: any) {
      showToast('Failed to save budgets. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={['#00C896']} />}
      >
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" colors={['#00C896']} />}
      >
        <Text style={styles.title}>Monthly Budgets</Text>
        <Text style={styles.subtitle}>
          Set how much you want to spend per category this month
        </Text>

        {CATEGORIES.map((category) => (
          <View key={category}>
            <View style={[styles.categoryRow, fieldErrors[category] ? styles.categoryRowError : null]}>
              <View style={styles.categoryLeft}>
                <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
                <Text style={styles.categoryName}>{category}</Text>
              </View>
              <View style={styles.rowRight}>
                <View style={styles.inputContainer}>
                  <Text style={styles.currency}>GHS</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor="#8890A0"
                    value={limits[category]}
                    onChangeText={(text) => {
                      setLimits((prev) => ({ ...prev, [category]: text }));
                      if (fieldErrors[category]) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next[category];
                          return next;
                        });
                      }
                    }}
                    keyboardType="decimal-pad"
                  />
                </View>
                {limits[category] !== '' && (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => clearCategory(category)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {fieldErrors[category] && (
              <Text style={styles.fieldError}>{fieldErrors[category]}</Text>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.resetButton} onPress={resetAll} activeOpacity={0.7}>
          <Text style={styles.resetButtonText}>Reset All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.buttonText}>Save Budgets</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#E05C5C',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8890A0',
    marginBottom: 28,
    lineHeight: 20,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1F2E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ffffff10',
  },
  categoryRowError: {
    borderColor: '#E05C5C',
    marginBottom: 4,
  },
  fieldError: {
    color: '#E05C5C',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 4,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ffffff20',
  },
  currency: {
    fontSize: 13,
    color: '#8890A0',
    marginRight: 4,
  },
  input: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    width: 80,
    paddingVertical: 8,
    textAlign: 'right',
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E05C5C20',
    borderWidth: 1,
    borderColor: '#E05C5C60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: '#E05C5C',
    fontSize: 11,
    fontWeight: 'bold',
  },
  resetButton: {
    borderWidth: 1,
    borderColor: '#E05C5C',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#E05C5C10',
  },
  resetButtonText: {
    color: '#E05C5C',
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#00C896',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
