import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { budgetAPI } from '../../services/api';
import { getUserId } from '../../services/storage';

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

  useFocusEffect(
    useCallback(() => {
      loadExistingBudgets();
    }, []),
  );

  async function loadExistingBudgets() {
    try {
      const userId = getUserId();
      const response = await budgetAPI.getUserBudgets(userId);
      const existing: { [key: string]: string } = {};
      response.data.forEach((budget: any) => {
        existing[budget.category] = String(budget.monthlyLimit);
      });
      setLimits(prev => ({ ...prev, ...existing }));
    } catch (error) {
      console.log('Error loading budgets:', error);
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    const userId = getUserId();
    setLoading(true);
    try {
      for (const category of CATEGORIES) {
        if (limits[category] && limits[category] !== '0') {
          await budgetAPI.setBudget(userId, category, limits[category]);
        }
      }
      Alert.alert('Success', 'Your budgets have been saved!');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save budgets. Please try again.');
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Monthly Budgets</Text>
      <Text style={styles.subtitle}>
        Set how much you want to spend per category this month
      </Text>

      {CATEGORIES.map((category) => (
        <View key={category} style={styles.categoryRow}>
          <View style={styles.categoryLeft}>
            <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
            <Text style={styles.categoryName}>{category}</Text>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.currency}>GHS</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#8890A0"
              value={limits[category]}
              onChangeText={(text) =>
                setLimits((prev) => ({ ...prev, [category]: text }))
              }
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text style={styles.buttonText}>Save Budgets</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  button: {
    backgroundColor: '#00C896',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
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