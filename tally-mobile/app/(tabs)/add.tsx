import { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { expenseAPI, budgetAPI, categoriesAPI, momoAPI } from '../../services/api';
import { getUserId, currentUser, safeStorage } from '../../services/storage';
import { addHistoryItem } from '../../services/notificationHistory';
import { signalMomoRefresh } from '../../services/momoRefresh';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../hooks/useTheme';

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

type MomoStatus = "idle" | "sending" | "confirming" | "done";

// Session-scoped "last used" defaults live on currentUser (see services/storage.ts)

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(currentUser.lastCategory || "Food");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOMO">(
    currentUser.lastPaymentMethod === "MOMO" ? "MOMO" : "CASH",
  );

  // Dynamic monthly totals and budget limits
  const [spent, setSpent] = useState<{ [key: string]: number }>({});
  const [limits, setLimits] = useState<{ [key: string]: number }>({});

  // Input focus status for outline treatments
  const [amountFocused, setAmountFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [tagFocused, setTagFocused] = useState(false);

  // Tag list state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
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
  const TEMPLATES_KEY = 'tallyExpenseTemplates';
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    safeStorage.getItem(TEMPLATES_KEY)
      .then((saved) => saved && setTemplates(JSON.parse(saved)))
      .catch(() => {});
  }, []);

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
  const [momoPhone, setMomoPhone] = useState(currentUser.phoneNumber || "");
  const [momoStatus, setMomoStatus] = useState<MomoStatus>("idle");
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

  function handlePaymentMethodSelect(method: "CASH" | "MOMO") {
    setPaymentMethod(method);
    currentUser.lastPaymentMethod = method;
  }

  function handleAddTag() {
    const raw = tagInput.trim();
    if (!raw) return;
    if (tags.length >= 5) {
      showToast("You can add up to 5 tags.", "warning");
      return;
    }
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleAddExpense() {
    if (!amount) {
      showToast("Please enter an amount", "error");
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      showToast("Please enter a valid amount greater than zero", "error");
      return;
    }

    // MoMo → navigate to Pay Vendor screen to handle the MoMo payment flow
    if (paymentMethod === "MOMO") {
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
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(" ");
      // Normalize to exactly 2 decimal places before sending
      const finalAmtStr = (transactionType === 'income'
        ? Math.abs(parseFloat(amount))
        : -Math.abs(parseFloat(amount))).toFixed(2);
      await expenseAPI.createExpense(userId, finalAmtStr, selectedCategory, fullDescription, today, "CASH");
      
      const parsed = parseFloat(amount);
      await addHistoryItem({
        type: transactionType === 'income' ? "income_added" : "expense_added",
        title: transactionType === 'income' ? "Income recorded" : "Expense recorded",
        body: `${transactionType === 'income' ? '+' : '-'}GHS ${parsed.toFixed(2)} added to ${selectedCategory}${description ? ` — ${description}` : ""}.`,
        data: { screen: "history" },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(transactionType === 'income' ? "Income added successfully!" : "Expense added successfully!", "success");

      // Update spent values locally for responsive UI feedback
      if (transactionType === 'expense') {
        const addedAmt = parseFloat(amount) || 0;
        setSpent(prev => ({
          ...prev,
          [selectedCategory]: (prev[selectedCategory] || 0) + addedAmt
        }));
      }

      setAmount('');
      setDescription('');
      setTags([]);
      setTagInput("");
    } catch (error: any) {
      const message = error.response?.data?.error || (transactionType === 'income' ? 'Failed to add income.' : 'Failed to add expense.');
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMomoPayment() {
    // Strip ALL non-numeric characters (spaces, dashes, etc.)
    const phone = momoPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      showToast("Enter a valid 10-digit MoMo number", "error");
      return;
    }

    setMomoLoading(true);
    setMomoStatus("sending");

    try {
      const userId = getUserId();
      const fullDescription = [description.trim(), ...tags].filter(Boolean).join(" ");

      // Request payment from MTN MoMo sandbox
      const payRes = await momoAPI.requestPayment(
        "",       // no groupId for personal expenses
        userId,
        phone,
        amount,
        fullDescription || selectedCategory,
      );

      const referenceId: string =
        payRes.data?.referenceId ?? payRes.data?.externalId ?? "";

      // Wait 3s, then check payment status
      setMomoStatus("confirming");
      await new Promise((r) => setTimeout(r, 3000));

      let paymentStatus = "PENDING";
      if (referenceId) {
        try {
          const statusRes = await momoAPI.checkStatus(referenceId);
          paymentStatus = statusRes.data?.status ?? "PENDING";
        } catch {
          // If status check fails, treat as PENDING and record the expense
          paymentStatus = "PENDING";
        }
      }

      if (paymentStatus === "FAILED") {
        showToast("Payment failed. Please try again.", "error");
        setMomoStatus("idle");
        setMomoLoading(false);
        return;
      }

      // SUCCESSFUL or PENDING — record the transaction
      const today = new Date().toISOString().split("T")[0];
      const parsed = parseFloat(amount);
      const finalAmtStr = (transactionType === 'income' ? Math.abs(parsed) : -Math.abs(parsed)).toFixed(2);
      await expenseAPI.createExpense(
        userId,
        finalAmtStr,
        selectedCategory,
        fullDescription,
        today,
        "MOMO",
      );

      await addHistoryItem({
        type: transactionType === 'income' ? "income_added" : "expense_added",
        title: transactionType === 'income' ? "MoMo deposit recorded" : "MoMo payment recorded",
        body: `${transactionType === 'income' ? '+' : '-'}GHS ${parsed.toFixed(2)} via MoMo for ${selectedCategory}${description ? ` — ${description}` : ""}.`,
        data: { screen: "history" },
      });

      // Update spent values locally for responsive UI feedback
      if (transactionType === 'expense') {
        const addedAmt = parseFloat(amount) || 0;
        setSpent(prev => ({
          ...prev,
          [selectedCategory]: (prev[selectedCategory] || 0) + addedAmt
        }));
      }

      setMomoStatus("done");
      // Tell Home screen to re-fetch wallet balance on next focus
      signalMomoRefresh();

      // Brief pause so user sees "confirmed" state, then close
      setTimeout(() => {
        setShowMomoModal(false);
        setMomoStatus("idle");
        setMomoLoading(false);
        showToast("Payment successful! Expense recorded.", "success");
        setAmount("");
        setDescription("");
        setTags([]);
        setTagInput("");
        setMomoPhone("");
      }, 1200);
    } catch (err: any) {
      const msg =
        err.response?.data?.error || "Payment request failed. Please try again.";
      showToast(msg, "error");
      setMomoStatus("idle");
      setMomoLoading(false);
    }
  }

  function closeMomoModal() {
    if (momoLoading) return; // block dismissal while in-flight
    setShowMomoModal(false);
    setMomoStatus("idle");
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        {/* Card container */}
        <View style={[styles.mainCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>
            {transactionType === 'income' ? 'Add Income' : 'Add Expense'}
          </Text>

          {/* Segmented Control for Expense vs Income */}
          <View style={[styles.typeSelectorRow, { backgroundColor: colors.neutralBg }]}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                transactionType === 'expense' && { backgroundColor: colors.negative },
              ]}
              onPress={() => setTransactionType('expense')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.typeBtnText,
                { color: colors.textSecondary },
                transactionType === 'expense' && { color: '#ffffff' },
              ]}>
                💸 Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                transactionType === 'income' && { backgroundColor: colors.positive },
              ]}
              onPress={() => setTransactionType('income')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.typeBtnText,
                { color: colors.textSecondary },
                transactionType === 'income' && { color: '#ffffff' },
              ]}>
                💰 Income
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Add — one-tap expense templates */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Quick Add</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.templateScroll}
            contentContainerStyle={styles.templateRow}
          >
            {templates.map((template) => (
              <TouchableOpacity
                key={template.name}
                style={[styles.templateChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => applyTemplate(template)}
                onLongPress={() => removeTemplate(template.name)}
                activeOpacity={0.75}
              >
                <Text style={styles.templateEmoji}>{template.emoji}</Text>
                <View>
                  <Text style={[styles.templateName, { color: colors.text }]} numberOfLines={1}>{template.name}</Text>
                  <Text style={[styles.templateAmount, { color: colors.textSecondary }]}>GHS {template.amount}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.addTemplateChip, { borderColor: colors.primary + '50' }]}
              onPress={() => {
                if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                  showToast('Fill in amount, category and description first', 'info');
                  return;
                }
                setShowSaveTemplate(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.addTemplateText, { color: colors.primary }]}>+ Save Template</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Enter Amount box styled for the theme */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Amount (GHS)</Text>
          <View style={[
            styles.amountBox,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
            amountFocused && { borderColor: colors.primary }
          ]}>
            <Text style={[styles.amountPrefix, { color: colors.text }]}>GHS</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={theme === 'dark' ? '#4B5563' : '#C8D2DC'}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
            />
          </View>

          {/* Categories capsule selection list */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Select Category</Text>
          <View style={styles.categoryList}>
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
                  <Text style={styles.categoryEmoji}>{CATEGORY_ICONS[cat]}</Text>
                  <Text style={[styles.categoryNameText, { color: colors.text }]}>{cat}</Text>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={[styles.categoryAmountText, { color: colors.textSecondary }]}>
                    GHS {(spent[cat] || 0).toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Custom categories */}
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
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.categoryNameText, { color: colors.text }]}>{cat.name}</Text>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={[styles.categoryAmountText, { color: colors.textSecondary }]}>
                    GHS {(spent[cat.name] || 0).toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Add New Category button */}
            <TouchableOpacity
              style={[styles.addCategoryBtn, { borderColor: colors.border }]}
              onPress={() => router.push('/manage-categories')}
              activeOpacity={0.7}
            >
              <Text style={[styles.addCategoryBtnText, { color: colors.textSecondary }]}>
                + New Category
              </Text>
            </TouchableOpacity>
          </View>
          {showHint && (
            <Text style={[styles.lastUsedHint, { color: colors.textSecondary }]}>
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
                <View style={[styles.budgetWarn, { backgroundColor: colors.negative + '12', borderColor: colors.negative + '35' }]}>
                  <Text style={[styles.budgetWarnText, { color: colors.negative }]}>
                    🚨 You've already used your entire {selectedCategory} budget (GHS {limit.toFixed(0)}) this month.
                  </Text>
                </View>
              );
            }
            if (pending > left || left <= limit * 0.2) {
              return (
                <View style={[styles.budgetWarn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
                  <Text style={[styles.budgetWarnText, { color: '#D97706' }]}>
                    ⚠️ You have only GHS {left.toFixed(2)} left in your {selectedCategory} budget this month{pending > left ? ' — this expense will exceed it' : ''}.
                  </Text>
                </View>
              );
            }
            return null;
          })()}

          {/* Payment Method Selector */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Payment Method</Text>
          <View style={styles.paymentMethodRow}>
            <TouchableOpacity
              style={[
                styles.paymentChip,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                paymentMethod === "CASH" && { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderWidth: 1.5 }
              ]}
              onPress={() => handlePaymentMethodSelect("CASH")}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentChipIcon}>💵</Text>
              <Text style={[
                styles.paymentChipText,
                { color: colors.textSecondary },
                paymentMethod === "CASH" && { color: colors.primary, fontWeight: 'bold' }
              ]}>
                Cash
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paymentChip,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                paymentMethod === "MOMO" && { backgroundColor: colors.accent + '15', borderColor: colors.accent, borderWidth: 1.5 }
              ]}
              onPress={() => handlePaymentMethodSelect("MOMO")}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentChipIcon}>📱</Text>
              <Text style={[
                styles.paymentChipText,
                { color: colors.textSecondary },
                paymentMethod === "MOMO" && { color: colors.accent, fontWeight: 'bold' }
              ]}>
                MoMo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Description box */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Description (optional)</Text>
          <TextInput
            style={[
              styles.descriptionBox,
              styles.textArea,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              descFocused && { borderColor: colors.primary }
            ]}
            placeholder="What was this for?"
            placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
            value={description}
            onChangeText={setDescription}
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
            multiline
            numberOfLines={3}
          />

          {/* Smart category suggestion chip */}
          {suggestedCategory && (
            <TouchableOpacity
              style={[styles.suggestionChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
              onPress={() => {
                setSelectedCategory(suggestedCategory);
                setSuggestedCategory(null);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.suggestionChipText, { color: colors.primary }]}>
                💡 Suggested: {suggestedCategory} — tap to apply
              </Text>
            </TouchableOpacity>
          )}

          {/* Tags Section */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tags (optional)</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[
                styles.tagInputField,
                { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
                tagFocused && { borderColor: colors.primary }
              ]}
              placeholder="Add a tag e.g. #work #food"
              placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
              value={tagInput}
              onChangeText={setTagInput}
              onFocus={() => setTagFocused(true)}
              onBlur={() => setTagFocused(false)}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
            />
            <TouchableOpacity style={[styles.tagAddButton, { backgroundColor: colors.neutralBg }]} onPress={handleAddTag}>
              <Text style={[styles.tagAddText, { color: colors.text }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.map((tag) => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: colors.neutralBg }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                  <TouchableOpacity onPress={() => handleRemoveTag(tag)}>
                    <Text style={[styles.tagRemove, { color: colors.textSecondary }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Black capsule action button */}
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: paymentMethod === "MOMO" ? "#D97706" : colors.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={handleAddExpense}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                {paymentMethod === "MOMO" 
                  ? (transactionType === 'income' ? "Receive via MoMo →" : "Pay with MoMo →") 
                  : (transactionType === 'income' ? "⊕ Add Income" : "⊕ Add Expense")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Save as Template Modal ── */}
      <Modal
        visible={showSaveTemplate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSaveTemplate(false)}
      >
        <View style={styles.templateModalOverlay}>
          <View style={[styles.templateModalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.templateModalTitle, { color: colors.text }]}>Save as Template</Text>
            <Text style={[styles.templateModalSub, { color: colors.textSecondary }]}>
              {CATEGORY_ICONS[selectedCategory] || customCategories.find((c) => c.name === selectedCategory)?.emoji || '📦'}
              {'  '}{selectedCategory} • GHS {parseFloat(amount || '0').toFixed(2)}
              {description.trim() ? ` • ${description.trim()}` : ''}
            </Text>
            <TextInput
              style={[styles.templateModalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder='Template name (e.g. "Morning Coffee")'
              placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
              value={templateName}
              onChangeText={setTemplateName}
              maxLength={24}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.templateModalSave, { backgroundColor: colors.primary }]}
              onPress={saveTemplate}
              activeOpacity={0.85}
            >
              <Text style={styles.templateModalSaveText}>Save Template</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.templateModalCancel}
              onPress={() => setShowSaveTemplate(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.templateModalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MoMo Payment Modal (Redesigned for Premium Light Capsule Theme) ── */}
      <Modal
        visible={showMomoModal}
        transparent
        animationType="slide"
        onRequestClose={closeMomoModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeMomoModal}
          />
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {transactionType === 'income' ? 'Receive with MoMo 📱' : 'Pay with MoMo 📱'}
              </Text>
              {!momoLoading && (
                <TouchableOpacity onPress={closeMomoModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={[styles.modalClose, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount box */}
            <View style={[styles.momoAmountBox, { backgroundColor: colors.neutralBg }]}>
              <Text style={[styles.momoAmountLabel, { color: colors.textSecondary }]}>
                {transactionType === 'income' ? 'You are receiving' : 'You are paying'}
              </Text>
              <Text style={[styles.momoAmountValue, { color: colors.text }]}>
                GHS {parseFloat(amount || "0").toFixed(2)}
              </Text>
              {(description || selectedCategory) && (
                <Text style={[styles.momoAmountDesc, { color: colors.textSecondary }]}>
                  {description || selectedCategory}
                </Text>
              )}
            </View>

            {/* Phone input — only shown while idle */}
            {momoStatus === "idle" && (
              <>
                <Text style={[styles.momoPhoneLabel, { color: colors.textSecondary }]}>MoMo Number</Text>
                <TextInput
                  style={[styles.momoPhoneInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g. 0241234567"
                  placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
                  value={momoPhone}
                  onChangeText={setMomoPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </>
            )}

            {/* Status feedback while processing */}
            {momoStatus !== "idle" && (
              <View style={styles.momoStatusBox}>
                {momoStatus !== "done" && (
                  <ActivityIndicator
                    color="#D97706"
                    size="large"
                    style={{ marginBottom: 12 }}
                  />
                )}
                {momoStatus === "done" && (
                  <Text style={styles.momoStatusIcon}>✅</Text>
                )}
                <Text style={[styles.momoStatusText, { color: colors.text }]}>
                  {momoStatus === "sending" && (transactionType === 'income' ? "Sending request to your MoMo number..." : "Sending payment request to your MoMo number...")}
                  {momoStatus === "confirming" && "Confirming transaction..."}
                  {momoStatus === "done" && (transactionType === 'income' ? "Funds received confirmed!" : "Payment confirmed!")}
                </Text>
              </View>
            )}

            {/* Buttons — hidden while processing */}
            {momoStatus === "idle" && (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { backgroundColor: colors.neutralBg }]}
                  onPress={closeMomoModal}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalPayBtn, { backgroundColor: '#D97706' }]}
                  onPress={handleMomoPayment}
                >
                  <Text style={styles.modalPayText}>
                    {transactionType === 'income' ? "Request Money" : "Pay Now"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Toast
        message={toastMessage}
        type={toastType}
        visible={toastVisible}
        onHide={hideToast}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7', // Soft light gray backdrop
  },
  centered: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: '#ffffff', // Card wrapper
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
  typeSelectorRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  amountBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountBoxFocused: {
    borderColor: '#111111', // Black border on focus
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111111',
    padding: 0,
  },
  categoryList: {
    marginBottom: 16,
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addCategoryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryCapsuleActive: {
    borderColor: '#111111', // Rounded black outline on selection
    borderWidth: 1.5,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryEmoji: {
    fontSize: 20,
  },
  categoryNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    marginLeft: 4,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryAmountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginRight: 6,
  },

  descriptionBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    color: '#111111',
    fontSize: 15,
    marginBottom: 16,
  },
  descriptionBoxFocused: {
    borderColor: '#111111',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  lastUsedHint: {
    fontSize: 11,
    color: "#8890A0",
    textAlign: "center",
    marginTop: -8,
    marginBottom: 12,
  },
  paymentMethodRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  paymentChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#EAEBEF",
  },
  paymentChipActive: {
    borderColor: "#111111",
    backgroundColor: "#11111105",
  },
  paymentChipActiveMomo: {
    borderColor: "#F59E0B",
    backgroundColor: "#F59E0B0a",
  },
  paymentChipIcon: {
    fontSize: 18,
  },
  paymentChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E9AA6",
  },
  paymentChipTextActive: {
    color: "#111111",
  },
  paymentChipTextMomo: {
    color: "#D97706",
  },
  button: {
    backgroundColor: '#111111', // Black background button
    borderRadius: 28,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonMomo: {
    backgroundColor: "#D97706",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  tagInputField: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    color: '#111111',
    fontSize: 15,
  },
  tagInputFieldFocused: {
    borderColor: '#111111',
  },
  tagAddButton: {
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // Quick-add templates
  templateScroll: {
    marginBottom: 16,
  },
  templateRow: {
    gap: 10,
    paddingRight: 8,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 190,
  },
  templateEmoji: {
    fontSize: 20,
  },
  templateName: {
    fontSize: 13,
    fontWeight: '700',
  },
  templateAmount: {
    fontSize: 11,
    fontWeight: '600',
  },
  addTemplateChip: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addTemplateText: {
    fontSize: 13,
    fontWeight: '700',
  },
  templateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  templateModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  templateModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  templateModalSub: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 19,
  },
  templateModalInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  templateModalSave: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  templateModalSaveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  templateModalCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  templateModalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },

  budgetWarn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  budgetWarnText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  suggestionChip: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: -6,
    marginBottom: 14,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '500',
  },
  tagRemove: {
    fontSize: 12,
    color: '#8E9AA6',
    fontWeight: 'bold',
  },
  // MoMo modal (Light Redesign)
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#EAEBEF",
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111111",
  },
  modalClose: {
    fontSize: 18,
    color: "#8E9AA6",
    padding: 4,
  },
  momoAmountBox: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F59E0B1a",
  },
  momoAmountLabel: {
    fontSize: 12,
    color: "#8E9AA6",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  momoAmountValue: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#D97706",
    marginBottom: 4,
  },
  momoAmountDesc: {
    fontSize: 13,
    color: "#8E9AA6",
  },
  momoPhoneLabel: {
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
    marginBottom: 8,
  },
  momoPhoneInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    color: "#111111",
    fontSize: 18,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#EAEBEF",
    marginBottom: 20,
    letterSpacing: 1,
  },
  momoStatusBox: {
    alignItems: "center",
    paddingVertical: 24,
  },
  momoStatusIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  momoStatusText: {
    fontSize: 15,
    color: "#D97706",
    fontWeight: "600",
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEBEF",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  modalCancelText: {
    fontSize: 15,
    color: "#8E9AA6",
    fontWeight: "600",
  },
  modalPayBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
  },
  modalPayText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
