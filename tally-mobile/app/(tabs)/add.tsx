import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Feather from '@expo/vector-icons/Feather';
import { expenseAPI, budgetAPI, categoriesAPI, momoAPI } from '../../services/api';
import { getUserId, currentUser, safeStorage } from '../../services/storage';
import { addHistoryItem } from '../../services/notificationHistory';
import { signalMomoRefresh } from '../../services/momoRefresh';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button, Input, Chip } from '../../components/ui';

const CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'];

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
};

// Smart categorization — keyword → category suggestions (frontend only)
const CATEGORY_KEYWORDS: { [category: string]: string[] } = {
  Food: ['lunch', 'dinner', 'breakfast', 'food', 'restaurant', 'cafe', 'eat', 'waakye', 'jollof', 'chop'],
  Transport: ['uber', 'taxi', 'bus', 'fuel', 'petrol', 'trotro', 'bolt', 'yango'],
  Entertainment: ['netflix', 'cinema', 'movie', 'game', 'spotify', 'concert'],
  Utilities: ['electricity', 'water', 'internet', 'rent', 'light bill', 'wifi', 'data bundle'],
};

function suggestCategory(description: string): string | null {
  const desc = description.toLowerCase();
  if (!desc.trim()) return null;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (desc.includes(keyword)) return category;
    }
  }
  return null;
}

type MomoStatus = 'idle' | 'sending' | 'confirming' | 'done';

// Session-scoped "last used" defaults live on currentUser (see services/storage.ts)

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(currentUser.lastCategory || 'Food');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOMO'>(
    currentUser.lastPaymentMethod === 'MOMO' ? 'MOMO' : 'CASH',
  );

  // Dynamic monthly totals and budget limits
  const [spent, setSpent] = useState<{ [key: string]: number }>({});
  const [limits, setLimits] = useState<{ [key: string]: number }>({});

  // Tag list state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showHint, setShowHint] = useState(true);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  // Custom categories
  const [customCategories, setCustomCategories] = useState<{ id: string; name: string; emoji: string }[]>([]);

  // Quick expense templates (stored in AsyncStorage)
  type ExpenseTemplate = {
    name: string;
    emoji: string;
    amount: string;
    category: string;
    description: string;
    paymentMethod?: 'CASH' | 'MOMO';
  };
  // Namespaced by userId — a global key would leak one account's saved
  // templates into whichever account is next logged in on the same device.
  const TEMPLATES_KEY = `tallyExpenseTemplates:${getUserId()}`;
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    setTemplates([]); // don't show the previous key's templates while loading
    safeStorage.getItem(TEMPLATES_KEY)
      .then((saved) => setTemplates(saved ? JSON.parse(saved) : []))
      .catch(() => {});
  }, [TEMPLATES_KEY]);

  function applyTemplate(t: ExpenseTemplate) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTransactionType('expense');
    setAmount(t.amount);
    handleCategorySelect(t.category);
    setDescription(t.description);
    setPaymentMethod(t.paymentMethod === 'MOMO' ? 'MOMO' : 'CASH');
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      showToast('Give the template a name (e.g. "Morning Coffee")', 'error');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast('Enter a valid amount before saving a template', 'error');
      return;
    }
    const emoji = CATEGORY_ICONS[selectedCategory]
      || customCategories.find((c) => c.name === selectedCategory)?.emoji
      || '📦';
    const next = [
      ...templates.filter((t) => t.name !== templateName.trim()),
      {
        name: templateName.trim(),
        emoji,
        amount: parseFloat(amount).toFixed(2),
        category: selectedCategory,
        description: description.trim(),
        paymentMethod,
      },
    ].slice(-8); // keep at most 8 templates
    setTemplates(next);
    try {
      await safeStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    } catch {
      // Non-critical
    }
    setShowSaveTemplate(false);
    setTemplateName('');
    showToast('Template saved — one-tap adds from now on!', 'success');
  }

  async function removeTemplate(name: string) {
    const next = templates.filter((t) => t.name !== name);
    setTemplates(next);
    try {
      await safeStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    } catch {
      // Non-critical
    }
  }

  // Smart category suggestion (500ms debounce on description typing)
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const suggestion = suggestCategory(description);
      setSuggestedCategory(suggestion && suggestion !== selectedCategory ? suggestion : null);
    }, 500);
    return () => clearTimeout(timer);
  }, [description, selectedCategory]);

  // MoMo payment modal (kept for potential income receive flow)
  const [showMomoModal, setShowMomoModal] = useState(false);
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || '');
  const [momoStatus, setMomoStatus] = useState<MomoStatus>('idle');
  const [momoLoading, setMomoLoading] = useState(false);

  // Auto-hide the "remembered" hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Reload custom categories every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchCustomCategories();
    }, [])
  );

  async function fetchCustomCategories() {
    try {
      const userId = getUserId();
      const res = await categoriesAPI.getUserCategories(userId);
      setCustomCategories(res.data || []);
    } catch {
      // Non-critical — the default categories remain available
    }
  }

  async function loadData() {
    setFetching(true);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes] = await Promise.all([
        expenseAPI.getUserExpenses(userId),
        budgetAPI.getUserBudgets(userId)
      ]);

      const totals: { [key: string]: number } = {};
      expensesRes.data.forEach((expense: any) => {
        const cat = expense.category || 'Other';
        totals[cat] = (totals[cat] || 0) + parseFloat(expense.amount || '0');
      });
      setSpent(totals);

      const budgetMap: { [key: string]: number } = {};
      budgetsRes.data.forEach((budget: any) => {
        budgetMap[budget.category] = parseFloat(budget.monthlyLimit) || 0;
      });
      setLimits(budgetMap);
    } catch {
      // Non-critical — category cards show without spend/limit metrics
    } finally {
      setFetching(false);
    }
  }

  function handleCategorySelect(cat: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCategory(cat);
    setShowHint(false);
    currentUser.lastCategory = cat;
  }

  function handlePaymentMethodSelect(method: 'CASH' | 'MOMO') {
    setPaymentMethod(method);
    currentUser.lastPaymentMethod = method;
  }

  function handleAddTag() {
    const raw = tagInput.trim();
    if (!raw) return;
    if (tags.length >= 5) {
      showToast('You can add up to 5 tags.', 'warning');
      return;
    }
    const tag = raw.startsWith('#') ? raw : `#${raw}`;
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleAddExpense() {
    if (!amount) {
      showToast('Please enter an amount', 'error');
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount greater than zero', 'error');
      return;
    }

    // MoMo → navigate to Pay Vendor screen to handle the MoMo payment flow
    if (paymentMethod === 'MOMO') {
      router.push({
        pathname: '/pay-vendor',
        params: {
          amount: amount,
          description: description.trim(),
          category: selectedCategory,
          fromAddExpense: 'true',
          transactionType: transactionType,
        },
      });
      return;
    }

    // Cash flow
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = getUserId();
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(' ');
      // Normalize to exactly 2 decimal places before sending
      const finalAmtStr = (transactionType === 'income'
        ? Math.abs(parseFloat(amount))
        : -Math.abs(parseFloat(amount))).toFixed(2);
      await expenseAPI.createExpense(userId, finalAmtStr, selectedCategory, fullDescription, today, 'CASH');

      const parsed = parseFloat(amount);
      await addHistoryItem({
        type: transactionType === 'income' ? 'income_added' : 'expense_added',
        title: transactionType === 'income' ? 'Income recorded' : 'Expense recorded',
        body: `${transactionType === 'income' ? '+' : '-'}GHS ${parsed.toFixed(2)} added to ${selectedCategory}${description ? ` — ${description}` : ''}.`,
        data: { screen: 'history' },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(transactionType === 'income' ? 'Income added successfully!' : 'Expense added successfully!', 'success');

      // Update spent values locally for responsive UI feedback
      if (transactionType === 'expense') {
        const addedAmt = parseFloat(amount) || 0;
        setSpent(prev => ({
          ...prev,
          // Expenses are stored as negative (money out); match that sign so the
          // optimistic value agrees with what a re-fetch returns.
          [selectedCategory]: (prev[selectedCategory] || 0) - addedAmt
        }));
      }

      setAmount('');
      setDescription('');
      setTags([]);
      setTagInput('');
    } catch (error: any) {
      const message = error.response?.data?.error || (transactionType === 'income' ? 'Failed to add income.' : 'Failed to add expense.');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleMomoPayment() {
    // Strip ALL non-numeric characters (spaces, dashes, etc.)
    const phone = momoPhone.replace(/\D/g, '');
    if (phone.length < 10) {
      showToast('Enter a valid 10-digit MoMo number', 'error');
      return;
    }

    setMomoLoading(true);
    setMomoStatus('sending');

    try {
      const userId = getUserId();
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(' ');

      // Request payment from MTN MoMo sandbox
      const payRes = await momoAPI.requestPayment(
        '',       // no groupId for personal expenses
        userId,
        phone,
        amount,
        fullDescription || selectedCategory,
      );

      const referenceId: string =
        payRes.data?.referenceId ?? payRes.data?.externalId ?? '';

      // Wait 3s, then check payment status
      setMomoStatus('confirming');
      await new Promise((r) => setTimeout(r, 3000));

      let paymentStatus = 'PENDING';
      if (referenceId) {
        try {
          const statusRes = await momoAPI.checkStatus(referenceId);
          paymentStatus = statusRes.data?.status ?? 'PENDING';
        } catch {
          // If status check fails, treat as PENDING and record the expense
          paymentStatus = 'PENDING';
        }
      }

      if (paymentStatus === 'FAILED') {
        showToast('Payment failed. Please try again.', 'error');
        setMomoStatus('idle');
        setMomoLoading(false);
        return;
      }

      // SUCCESSFUL or PENDING — record the transaction
      const today = new Date().toISOString().split('T')[0];
      const parsed = parseFloat(amount);
      const finalAmtStr = (transactionType === 'income' ? Math.abs(parsed) : -Math.abs(parsed)).toFixed(2);
      await expenseAPI.createExpense(
        userId,
        finalAmtStr,
        selectedCategory,
        fullDescription,
        today,
        'MOMO',
      );

      await addHistoryItem({
        type: transactionType === 'income' ? 'income_added' : 'expense_added',
        title: transactionType === 'income' ? 'MoMo deposit recorded' : 'MoMo payment recorded',
        body: `${transactionType === 'income' ? '+' : '-'}GHS ${parsed.toFixed(2)} via MoMo for ${selectedCategory}${description ? ` — ${description}` : ''}.`,
        data: { screen: 'history' },
      });

      // Update spent values locally for responsive UI feedback
      if (transactionType === 'expense') {
        const addedAmt = parseFloat(amount) || 0;
        setSpent(prev => ({
          ...prev,
          // Expenses are stored as negative (money out); match that sign so the
          // optimistic value agrees with what a re-fetch returns.
          [selectedCategory]: (prev[selectedCategory] || 0) - addedAmt
        }));
      }

      setMomoStatus('done');
      // Tell Home screen to re-fetch wallet balance on next focus
      signalMomoRefresh();

      // Brief pause so user sees "confirmed" state, then close
      setTimeout(() => {
        setShowMomoModal(false);
        setMomoStatus('idle');
        setMomoLoading(false);
        showToast('Payment successful! Expense recorded.', 'success');
        setAmount('');
        setDescription('');
        setTags([]);
        setTagInput('');
        setMomoPhone('');
      }, 1200);
    } catch (err: any) {
      const msg =
        err.response?.data?.error || 'Payment request failed. Please try again.';
      showToast(msg, 'error');
      setMomoStatus('idle');
      setMomoLoading(false);
    }
  }

  function closeMomoModal() {
    if (momoLoading) return; // block dismissal while in-flight
    setShowMomoModal(false);
    setMomoStatus('idle');
  }

  if (fetching) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        <View style={[styles.mainCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <Text style={[typography.display, { color: colors.text, marginBottom: spacing.lg }]}>
            {transactionType === 'income' ? 'Add Income' : 'Add Expense'}
          </Text>

          {/* Segmented Control for Expense vs Income */}
          <View style={[styles.typeSelectorRow, { backgroundColor: colors.neutralBg }]}>
            <TouchableOpacity
              style={[styles.typeBtn, transactionType === 'expense' && { backgroundColor: colors.negative }]}
              onPress={() => setTransactionType('expense')}
              activeOpacity={0.7}
            >
              <Text style={[typography.bodyStrong, { color: transactionType === 'expense' ? '#FFFFFF' : colors.textSecondary }]}>
                💸 Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, transactionType === 'income' && { backgroundColor: colors.positive }]}
              onPress={() => setTransactionType('income')}
              activeOpacity={0.7}
            >
              <Text style={[typography.bodyStrong, { color: transactionType === 'income' ? '#FFFFFF' : colors.textSecondary }]}>
                💰 Income
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Add — one-tap expense templates */}
          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Quick Add</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.lg }}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}
          >
            {templates.map((template) => (
              <TouchableOpacity
                key={template.name}
                style={[styles.templateChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => applyTemplate(template)}
                onLongPress={() => removeTemplate(template.name)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 20 }}>{template.emoji}</Text>
                <View>
                  <Text style={[typography.bodyStrong, { color: colors.text, fontSize: 13 }]} numberOfLines={1}>{template.name}</Text>
                  <Text style={[typography.label, { color: colors.textSecondary }]}>GHS {template.amount}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.addTemplateChip, { borderColor: colors.primarySubtle }]}
              onPress={() => {
                if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                  showToast('Fill in amount, category and description first', 'info');
                  return;
                }
                setShowSaveTemplate(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={[typography.bodyStrong, { color: colors.primary, fontSize: 13 }]}>+ Save Template</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Amount */}
          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Amount (GHS)</Text>
          <View style={[styles.amountBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[typography.bodyStrong, { color: colors.text, marginRight: spacing.sm }]}>GHS</Text>
            <TextInput
              style={[typography.display, { flex: 1, color: colors.text, padding: 0 }]}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Categories */}
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
            Select Category
          </Text>
          <View style={{ marginBottom: spacing.md }}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryCapsule,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  selectedCategory === cat && { borderColor: colors.primary, borderWidth: 1.5 },
                ]}
                onPress={() => handleCategorySelect(cat)}
                activeOpacity={0.8}
              >
                <View style={styles.categoryLeft}>
                  <Text style={{ fontSize: 20 }}>{CATEGORY_ICONS[cat]}</Text>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{cat}</Text>
                </View>
                <Text style={[typography.bodyStrong, { color: colors.textSecondary, fontSize: 13 }]}>
                  GHS {Math.abs(spent[cat] || 0).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}

            {customCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCapsule,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  selectedCategory === cat.name && { borderColor: colors.primary, borderWidth: 1.5 },
                ]}
                onPress={() => handleCategorySelect(cat.name)}
                activeOpacity={0.8}
              >
                <View style={styles.categoryLeft}>
                  <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{cat.name}</Text>
                </View>
                <Text style={[typography.bodyStrong, { color: colors.textSecondary, fontSize: 13 }]}>
                  GHS {Math.abs(spent[cat.name] || 0).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.addCategoryBtn, { borderColor: colors.border }]}
              onPress={() => router.push('/manage-categories')}
              activeOpacity={0.7}
            >
              <Text style={[typography.bodyStrong, { color: colors.textSecondary, fontSize: 14 }]}>+ New Category</Text>
            </TouchableOpacity>
          </View>

          {showHint && (
            <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: -4, marginBottom: spacing.md }]}>
              ↩ Remembered from last {transactionType === 'income' ? 'income' : 'expense'}
            </Text>
          )}

          {/* Inline budget warning (YNAB-style: warn BEFORE overspending) */}
          {transactionType === 'expense' && (limits[selectedCategory] || 0) > 0 && (() => {
            const limit = limits[selectedCategory] || 0;
            const used = spent[selectedCategory] || 0;
            const left = limit - used;
            const pending = parseFloat(amount) || 0;
            if (left <= 0) {
              return (
                <View style={[styles.warnBanner, { backgroundColor: `${colors.negative}12`, borderColor: `${colors.negative}35` }]}>
                  <Text style={[typography.caption, { color: colors.negative, fontFamily: typography.bodyStrong.fontFamily }]}>
                    🚨 You've already used your entire {selectedCategory} budget (GHS {limit.toFixed(0)}) this month.
                  </Text>
                </View>
              );
            }
            if (pending > left || left <= limit * 0.2) {
              return (
                <View style={[styles.warnBanner, { backgroundColor: colors.warningSubtle, borderColor: `${colors.warning}40` }]}>
                  <Text style={[typography.caption, { color: colors.warning, fontFamily: typography.bodyStrong.fontFamily }]}>
                    ⚠️ You have only GHS {left.toFixed(2)} left in your {selectedCategory} budget this month{pending > left ? ' — this expense will exceed it' : ''}.
                  </Text>
                </View>
              );
            }
            return null;
          })()}

          {/* Payment Method Selector */}
          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Payment Method</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <Chip
              label="Cash"
              icon={<Text style={{ fontSize: 16 }}>💵</Text>}
              selected={paymentMethod === 'CASH'}
              onPress={() => handlePaymentMethodSelect('CASH')}
              style={{ flex: 1, justifyContent: 'center' }}
            />
            <Chip
              label="MoMo"
              icon={<Text style={{ fontSize: 16 }}>📱</Text>}
              selected={paymentMethod === 'MOMO'}
              onPress={() => handlePaymentMethodSelect('MOMO')}
              style={[{ flex: 1, justifyContent: 'center' }, paymentMethod === 'MOMO' && { backgroundColor: colors.accent }]}
            />
          </View>

          {/* Description */}
          <Input
            label="Description (optional)"
            placeholder="What was this for?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={{ height: 70, textAlignVertical: 'top' }}
            containerStyle={{ marginBottom: spacing.sm }}
          />

          {/* Smart category suggestion chip */}
          {suggestedCategory && (
            <TouchableOpacity
              style={[styles.suggestionChip, { backgroundColor: colors.primarySubtle, borderColor: `${colors.primary}40` }]}
              onPress={() => {
                setSelectedCategory(suggestedCategory);
                setSuggestedCategory(null);
              }}
              activeOpacity={0.75}
            >
              <Text style={[typography.caption, { color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }]}>
                💡 Suggested: {suggestedCategory} — tap to apply
              </Text>
            </TouchableOpacity>
          )}

          {/* Tags */}
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>
            Tags (optional)
          </Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[typography.body, styles.tagInputField, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="Add a tag e.g. #work #food"
              placeholderTextColor={colors.textTertiary}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
            />
            <TouchableOpacity style={[styles.tagAddButton, { backgroundColor: colors.text }]} onPress={handleAddTag}>
              <Text style={[typography.bodyStrong, { color: colors.background, fontSize: 14 }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.map((tag) => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: colors.neutralBg }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{tag}</Text>
                  <TouchableOpacity onPress={() => handleRemoveTag(tag)} hitSlop={6}>
                    <Feather name="x" size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Button
            title={
              paymentMethod === 'MOMO'
                ? (transactionType === 'income' ? 'Receive via MoMo →' : 'Pay with MoMo →')
                : (transactionType === 'income' ? '⊕ Add Income' : '⊕ Add Expense')
            }
            onPress={handleAddExpense}
            loading={loading}
            style={paymentMethod === 'MOMO' ? { backgroundColor: colors.accent } : undefined}
          />
        </View>
      </ScrollView>

      {/* ── Save as Template Modal ── */}
      <Modal visible={showSaveTemplate} transparent animationType="fade" onRequestClose={() => setShowSaveTemplate(false)}>
        <View style={styles.templateModalOverlay}>
          <View style={[styles.templateModalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
            <Text style={[typography.headline, { color: colors.text, textAlign: 'center', marginBottom: spacing.xs }]}>
              Save as Template
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }]}>
              {CATEGORY_ICONS[selectedCategory] || customCategories.find((c) => c.name === selectedCategory)?.emoji || '📦'}
              {'  '}{selectedCategory} • GHS {parseFloat(amount || '0').toFixed(2)}
              {description.trim() ? ` • ${description.trim()}` : ''}
            </Text>
            <Input
              label="Template name"
              placeholder='e.g. "Morning Coffee"'
              value={templateName}
              onChangeText={setTemplateName}
              maxLength={24}
              autoFocus
              containerStyle={{ marginBottom: spacing.lg }}
            />
            <Button title="Save Template" onPress={saveTemplate} />
            <TouchableOpacity style={styles.templateModalCancel} onPress={() => setShowSaveTemplate(false)} activeOpacity={0.7}>
              <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MoMo Payment Modal ── */}
      <Modal visible={showMomoModal} transparent animationType="slide" onRequestClose={closeMomoModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeMomoModal} />
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[typography.headline, { color: colors.text }]}>
                {transactionType === 'income' ? 'Receive with MoMo 📱' : 'Pay with MoMo 📱'}
              </Text>
              {!momoLoading && (
                <TouchableOpacity onPress={closeMomoModal} hitSlop={12}>
                  <Feather name="x" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.momoAmountBox, { backgroundColor: colors.neutralBg, borderColor: `${colors.accent}1a` }]}>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                {transactionType === 'income' ? 'You are receiving' : 'You are paying'}
              </Text>
              <Text style={[typography.displayLarge, { color: colors.accent, marginBottom: spacing.xs }]}>
                GHS {parseFloat(amount || '0').toFixed(2)}
              </Text>
              {(description || selectedCategory) && (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{description || selectedCategory}</Text>
              )}
            </View>

            {momoStatus === 'idle' && (
              <Input
                label="MoMo Number"
                placeholder="e.g. 0241234567"
                value={momoPhone}
                onChangeText={setMomoPhone}
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
                containerStyle={{ marginBottom: spacing.lg }}
              />
            )}

            {momoStatus !== 'idle' && (
              <View style={styles.momoStatusBox}>
                {momoStatus !== 'done' && <ActivityIndicator color={colors.accent} size="large" style={{ marginBottom: spacing.md }} />}
                {momoStatus === 'done' && <Text style={{ fontSize: 48, marginBottom: spacing.md }}>✅</Text>}
                <Text style={[typography.bodyStrong, { color: colors.accent, textAlign: 'center' }]}>
                  {momoStatus === 'sending' && (transactionType === 'income' ? 'Sending request to your MoMo number...' : 'Sending payment request to your MoMo number...')}
                  {momoStatus === 'confirming' && 'Confirming transaction...'}
                  {momoStatus === 'done' && (transactionType === 'income' ? 'Funds received confirmed!' : 'Payment confirmed!')}
                </Text>
              </View>
            )}

            {momoStatus === 'idle' && (
              <View style={styles.modalButtons}>
                <Button title="Cancel" onPress={closeMomoModal} variant="secondary" style={{ flex: 1 }} />
                <Button
                  title={transactionType === 'income' ? 'Request Money' : 'Pay Now'}
                  onPress={handleMomoPayment}
                  style={{ flex: 2, backgroundColor: colors.accent }}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  mainCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 190,
  },
  addTemplateChip: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  categoryCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addCategoryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  warnBanner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  suggestionChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    marginBottom: spacing.md,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tagInputField: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  tagAddButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
  },
  templateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  templateModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  templateModalCancel: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  momoAmountBox: {
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
  },
  momoStatusBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
