import { useState, useCallback, useMemo, useRef } from 'react';
import ExpenseDetailModal from '../../components/ExpenseDetailModal';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { expenseAPI, budgetAPI, categoriesAPI } from '../../services/api';
import { getUserId, currentUser } from '../../services/storage';
import { useConfirmModal } from '../../hooks/useConfirmModal';
import { useActionSheet } from '../../hooks/useActionSheet';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button, CategoryIcon, EmptyState, Skeleton, SkeletonRow } from '../../components/ui';
import { TransactionRow } from '../../components/home/TransactionRow';
import Toast from '../../components/Toast';

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length < 3) return new Date(dateStr);
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

const getGaugePath = (cx: number, cy: number, r: number, progress: number) => {
  if (progress <= 0) return '';
  const startDeg = 135;
  const totalDeg = 270;
  const endDeg = startDeg + progress * totalDeg;

  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const largeArcFlag = progress * totalDeg > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
};

function parseTagsFromDescription(description: string | null | undefined): { cleanDescription: string; tags: string[] } {
  if (!description) return { cleanDescription: '', tags: [] };
  const words = description.split(' ');
  const tags = words.filter((w) => w.startsWith('#'));
  const cleanDescription = words.filter((w) => !w.startsWith('#')).join(' ').trim();
  return { cleanDescription, tags };
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<any[]>([]);

  function getCustomEmoji(categoryName: string): string | undefined {
    return customCategories.find((c: any) => c.name === categoryName)?.emoji;
  }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTimeFilter, setActiveTimeFilter] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [momoOnly, setMomoOnly] = useState(false);

  const { showToast, toastMessage, toastType, toastVisible, toastNonce, hideToast } = useToast();
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();
  const { showActionSheet, ActionSheetComponent } = useActionSheet();

  // Skeleton on the first load only. This screen refetches on every focus, so
  // without the guard the skeleton replaced the whole list every time the tab
  // was re-entered — a flash on content the user had already seen.
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      fetchData(!hasLoadedOnce.current);
    }, [])
  );

  async function fetchData(showLoading = true) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const userId = getUserId();
      const [expensesRes, budgetsRes, categoriesRes] = await Promise.all([
        expenseAPI.getCombinedHistory(userId),
        budgetAPI.getUserBudgets(userId),
        categoriesAPI.getUserCategories(userId).catch(() => ({ data: [] })),
      ]);
      setCustomCategories(categoriesRes.data || []);

      const sorted = [...(expensesRes.data || [])].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const aSettle = a.paymentMethod === 'SETTLEMENT' ? 1 : 0;
        const bSettle = b.paymentMethod === 'SETTLEMENT' ? 1 : 0;
        return bSettle - aSettle;
      });
      setExpenses(sorted);
      setBudgets(budgetsRes.data || []);
    } catch (err: any) {
      setError('Failed to load history data. Please check your connection.');
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  }

  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);

  function openDetail(item: any) {
    setSelectedExpense(item);
    setShowExpenseDetail(true);
  }

  function closeDetail() {
    setShowExpenseDetail(false);
    setSelectedExpense(null);
  }

  const [exporting, setExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  function handleDropdownExport(type: 'csv' | 'pdf') {
    setShowDropdown(false);
    if (type === 'csv') {
      exportCsv();
    } else {
      exportPdf();
    }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      let csvContent = '';
      try {
        const res = await expenseAPI.exportExpenses(getUserId(), 'csv');
        csvContent = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } catch {
        const header = 'Date,Category,Description,Amount,Payment Method\n';
        const rows = expenses
          .map((e) => {
            const cleanDesc = (e.description || '').replace(/"/g, '""');
            const amt = (e.type === 'income' || e.paymentMethod === 'SETTLEMENT') ? `+${Math.abs(parseFloat(e.amount || '0')).toFixed(2)}` : `-${Math.abs(parseFloat(e.amount || '0')).toFixed(2)}`;
            return `"${e.date || ''}","${e.category || ''}","${cleanDesc}","${amt}","${e.paymentMethod || 'CASH'}"`;
          })
          .join('\n');
        csvContent = header + rows;
      }

      const fileUri = `${FileSystem.cacheDirectory}tally-expenses.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Tally expenses' });
      } else {
        showToast('Sharing is not supported on this device.', 'error');
      }
    } catch (e: any) {
      showToast('Could not export CSV. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  function htmlEscape(v: string): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildPdfHtml(): string {
    const list = [...expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const from = list.length > 0 ? list[0].date : '—';
    const to = list.length > 0 ? list[list.length - 1].date : '—';
    const totalSpentAbs = expenses
      .filter((e) => e.type !== 'income' && e.paymentMethod !== 'SETTLEMENT')
      .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);

    const rows = [...expenses]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((e) => {
        const amt = parseFloat(e.amount || '0');
        const sign = (e.type === 'income' || e.paymentMethod === 'SETTLEMENT') ? '+' : '-';
        return `<tr>
          <td>${htmlEscape(e.date)}</td>
          <td>${htmlEscape(e.category)}</td>
          <td>${htmlEscape(e.description || '')}</td>
          <td style="text-align:right">${sign}GHS ${Math.abs(amt).toFixed(2)}</td>
          <td>${htmlEscape(e.paymentMethod || 'CASH')}</td>
        </tr>`;
      })
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Helvetica,Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:22px;margin-bottom:2px}
      .sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#111;color:#fff;text-align:left;padding:8px}
      td{padding:7px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#fafafa}
      .total{margin-top:14px;font-size:14px;font-weight:bold;text-align:right}
    </style></head><body>
      <h1>💰 Tally</h1>
      <div class="sub">${htmlEscape(currentUser.userName || 'User')} • ${htmlEscape(String(from))} to ${htmlEscape(String(to))} • ${expenses.length} transactions</div>
      <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="total">Total spent: GHS ${totalSpentAbs.toFixed(2)}</div>
    </body></html>`;
  }

  async function exportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildPdfHtml() });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Tally expenses' });
      } else {
        showToast('Sharing is not supported on this device.', 'error');
      }
    } catch {
      showToast('Could not generate the PDF. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  function handleLongPress(item: any) {
    if (item.isShared || item.type === 'shared') {
      showToast('Shared expenses can only be managed from the group screen.', 'info');
      return;
    }
    showActionSheet({
      title: 'Expense Options',
      message: item.description || item.category,
      options: [
        item.isRecurring
          ? { label: 'Remove recurring', icon: <Feather name="repeat" size={18} color={colors.text} />, onPress: () => setRecurring(item, false) }
          : { label: 'Mark as recurring', icon: <Feather name="repeat" size={18} color={colors.text} />, onPress: () => pickRecurrence(item) },
        { label: 'Delete expense', icon: <Feather name="trash-2" size={18} color={colors.negative} />, destructive: true, onPress: () => handleDelete(item) },
      ],
    });
  }

  function pickRecurrence(item: any) {
    showActionSheet({
      title: 'Repeat how often?',
      message: 'This expense will repeat automatically',
      options: [
        { label: 'Daily', onPress: () => setRecurring(item, true, 'DAILY') },
        { label: 'Weekly', onPress: () => setRecurring(item, true, 'WEEKLY') },
        { label: 'Monthly', onPress: () => setRecurring(item, true, 'MONTHLY') },
      ],
    });
  }

  async function setRecurring(item: any, isRecurring: boolean, recurrenceType = '') {
    try {
      await expenseAPI.updateRecurring(String(item.id), isRecurring, recurrenceType);
      await fetchData(false);
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Could not update recurring setting.', 'error');
    }
  }

  function handleDelete(item: any) {
    if (item.isShared || item.type === 'shared') {
      showToast('Shared expenses can only be deleted from the group screen.', 'info');
      return;
    }
    showConfirm({
      icon: 'trash-2',
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense? This cannot be undone.',
      confirmText: 'Delete',
      confirmColor: colors.negative,
      destructive: true,
      onConfirm: async () => {
        try {
          // Heavy haptic now comes from ConfirmModal via `destructive` — this
          // fired on top of its Medium, so a delete buzzed twice.
          await expenseAPI.deleteExpense(String(item.id), getUserId());
          setExpenses((prev) => prev.filter((e) => !(e.id === item.id && !(e.isShared || e.type === 'shared'))));
        } catch {
          showToast('Failed to delete expense', 'error');
        }
      },
    });
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;

      const expenseDate = parseLocalDate(e.date);
      expenseDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      let matchesTime = false;
      if (activeTimeFilter === 'today') {
        matchesTime = e.date === todayStr;
      } else if (activeTimeFilter === 'week') {
        const currentDay = today.getDay();
        const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() + distanceToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        matchesTime = expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      } else if (activeTimeFilter === 'month') {
        const currentYearMonth = `${year}-${month}`;
        matchesTime = e.date.startsWith(currentYearMonth);
      } else if (activeTimeFilter === 'year') {
        const currentYear = year.toString();
        matchesTime = e.date.startsWith(currentYear);
      }

      const { cleanDescription, tags } = parseTagsFromDescription(e.description);
      const desc = (cleanDescription || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const tagsStr = tags.join(' ').toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      const amountStr = Math.abs(parseFloat(e.amount || '0')).toFixed(2);
      const MONTH_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const monthIdx = e.date ? parseInt(e.date.split('-')[1], 10) - 1 : -1;
      const monthName = monthIdx >= 0 && monthIdx < 12 ? MONTH_FULL[monthIdx] : '';
      const matchesSearch = !query
        || desc.includes(query)
        || cat.includes(query)
        || tagsStr.includes(query)
        || amountStr.includes(query)
        || monthName.startsWith(query);

      const matchesMomo = !momoOnly || e.paymentMethod === 'MOMO' || e.paymentMethod === 'MOMO_TRANSFER';

      return matchesTime && matchesSearch && matchesMomo;
    });
  }, [expenses, activeTimeFilter, searchQuery, momoOnly]);

  const totalBudget = useMemo(() => {
    return budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  }, [budgets]);

  const scaledBudget = useMemo(() => {
    const baseBudget = totalBudget;
    if (activeTimeFilter === 'today') return parseFloat((baseBudget / 30).toFixed(2));
    if (activeTimeFilter === 'week') return parseFloat((baseBudget * 7 / 30).toFixed(2));
    if (activeTimeFilter === 'month') return baseBudget;
    return baseBudget * 12;
  }, [totalBudget, activeTimeFilter]);

  const totalSpent = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => {
      if (e.type === 'income' || e.paymentMethod === 'SETTLEMENT') return sum;
      return sum + Math.abs(parseFloat(e.amount || '0'));
    }, 0);
  }, [filteredExpenses]);

  // Total expenses spent
  const allSpent = useMemo(() => {
    return expenses.reduce((sum, e) => {
      if (e.type === 'income' || e.paymentMethod === 'SETTLEMENT') return sum;
      return sum + Math.abs(parseFloat(e.amount || '0'));
    }, 0);
  }, [expenses]);

  const remainingBalance = useMemo(() => {
    return totalBudget - allSpent;
  }, [totalBudget, allSpent]);

  const spendProgress = useMemo(() => {
    return scaledBudget > 0 ? Math.min(totalSpent / scaledBudget, 1.0) : 0;
  }, [totalSpent, scaledBudget]);

  const balanceProgress = useMemo(() => {
    return totalBudget > 0 ? Math.max(0, Math.min(remainingBalance / totalBudget, 1.0)) : 0;
  }, [remainingBalance, totalBudget]);

  const groupExpensesByDate = (list: any[]) => {
    const groups: { [key: string]: any[] } = {};
    list.forEach((e) => {
      if (!e.date) return;
      const dateStr = e.date;
      const todayStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let header = dateStr;
      if (dateStr === todayStr) {
        header = 'Today';
      } else if (dateStr === yesterdayStr) {
        header = 'Yesterday';
      } else {
        try {
          const d = new Date(dateStr);
          header = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch (_) { }
      }

      if (!groups[header]) groups[header] = [];
      groups[header].push(e);
    });

    return Object.entries(groups).map(([date, items]) => ({ date, items }));
  };

  const groupedExpenses = groupExpensesByDate(filteredExpenses);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: 60 }]}>
        <Skeleton width="55%" height={28} borderRadius={radius.sm} style={{ marginBottom: spacing.xl }} />
        <Skeleton height={48} borderRadius={radius.xl} style={{ marginBottom: spacing.lg }} />
        {[...Array(6)].map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.centered, { backgroundColor: colors.background }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Feather name="alert-triangle" size={40} color={colors.textSecondary} style={{ marginBottom: spacing.lg }} />
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>{error}</Text>
        <Button title="Retry" onPress={() => fetchData(true)} fullWidth={false} />
      </ScrollView>
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, spacing.xl) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.headerRow, { zIndex: 100 }]}>
            <View style={{ width: 40 }} />
            <Text style={[typography.title, { fontSize: 25, lineHeight: 30, color: colors.text, textAlign: 'center', flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">Analytics & History</Text>
            <View style={{ position: 'relative', width: 40, alignItems: 'flex-end' }}>
              <TouchableOpacity
                style={[styles.moreBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }, exporting && { opacity: 0.5 }]}
                onPress={() => setShowDropdown(!showDropdown)}
                disabled={exporting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Options menu"
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Feather name="more-vertical" size={20} color={colors.text} />
                )}
              </TouchableOpacity>

              {showDropdown && (
                <View style={[styles.dropdownMenu, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleDropdownExport('csv')}
                    activeOpacity={0.7}
                  >
                    <Feather name="file-text" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>Export CSV</Text>
                  </TouchableOpacity>

                  <View style={[styles.dropdownDivider, { backgroundColor: colors.borderSubtle }]} />

                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleDropdownExport('pdf')}
                    activeOpacity={0.7}
                  >
                    <Feather name="file" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>Export PDF</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.timeFilterContainer, { backgroundColor: colors.neutralBg }]}>
            {(['today', 'week', 'month', 'year'] as const).map((filter) => {
              const labelMap = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' };
              const isActive = activeTimeFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.timeFilterBtn, isActive && { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => setActiveTimeFilter(filter)}
                  activeOpacity={0.8}
                >
                  <Text style={[typography.labelStrong, { color: isActive ? colors.text : colors.textSecondary }]}>{labelMap[filter]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.gaugesRow}>
            <View style={[styles.gaugeCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <View style={styles.gaugeWrapper}>
                <Svg width={72} height={72} viewBox="0 0 72 72">
                  <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke={colors.border} strokeWidth="5.5" strokeLinecap="round" />
                  {totalSpent > 0 && scaledBudget > 0 && (
                    <Path d={getGaugePath(36, 36, 28, spendProgress)} fill="none" stroke={spendProgress >= 1 ? colors.negative : colors.warning} strokeWidth="5.5" strokeLinecap="round" />
                  )}
                </Svg>
                <View style={[styles.gaugeIconContainer, { backgroundColor: colors.neutralBg }]}>
                  <Feather name="upload" size={14} color={spendProgress >= 1 ? colors.negative : colors.warning} />
                </View>
              </View>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Total Spent</Text>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>GHS {totalSpent.toFixed(2)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {activeTimeFilter === 'today' ? 'Today' : activeTimeFilter === 'week' ? 'This Week' : activeTimeFilter === 'month' ? 'This Month' : 'This Year'}
              </Text>
            </View>

            <View style={[styles.gaugeCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
              <View style={styles.gaugeWrapper}>
                <Svg width={72} height={72} viewBox="0 0 72 72">
                  <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke={colors.border} strokeWidth="5.5" strokeLinecap="round" />
                  {totalBudget > 0 && (
                    <Path d={getGaugePath(36, 36, 28, balanceProgress)} fill="none" stroke={remainingBalance < 0 ? colors.negative : colors.positive} strokeWidth="5.5" strokeLinecap="round" />
                  )}
                </Svg>
                <View style={[styles.gaugeIconContainer, { backgroundColor: colors.neutralBg }]}>
                  <Feather name="pie-chart" size={14} color={remainingBalance < 0 ? colors.negative : colors.positive} />
                </View>
              </View>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Remaining Budget</Text>
              <Text style={[typography.bodyStrong, { color: remainingBalance < 0 ? colors.negative : colors.text }]}>
                {remainingBalance >= 0 ? `GHS ${remainingBalance.toFixed(2)}` : `-GHS ${Math.abs(remainingBalance).toFixed(2)}`}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                of GHS {totalBudget.toFixed(0)} budget
              </Text>
            </View>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm + 2 }} />
            <TextInput
              style={[typography.body, { flex: 1, color: colors.text, height: '100%' }]}
              placeholder="Search filtered list..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                activeOpacity={0.7}
                style={{ padding: spacing.xs }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Feather name="x" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterOptionsRow}>
            <TouchableOpacity
              style={[
                styles.momoFilterBtn,
                { backgroundColor: colors.neutralBg, borderColor: colors.border },
                momoOnly && { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
              ]}
              onPress={() => setMomoOnly(!momoOnly)}
              activeOpacity={0.8}
            >
              <Text style={[typography.labelStrong, { color: momoOnly ? colors.accent : colors.textSecondary }]}>📱 MoMo Only</Text>
            </TouchableOpacity>
          </View>

          {groupedExpenses.map((group) => (
            <View key={group.date} style={styles.dateGroup}>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm + 2 }]}>{group.date}</Text>
              {group.items.map((item, idx) => {
                const isShared = item.isShared || item.type === 'shared';
                const isMomo = item.paymentMethod === 'MOMO';
                const isMomoTransfer = item.paymentMethod === 'MOMO_TRANSFER';
                const isSettlement = item.paymentMethod === 'SETTLEMENT';
                const { cleanDescription, tags } = parseTagsFromDescription(item.description);

                return (
                  <TransactionRow
                    key={`${item.type ?? (isShared ? 'shared' : 'personal')}-${item.id}`}
                    index={idx}
                    leading={
                      <CategoryIcon
                        category={isShared ? 'Shared' : item.category}
                        customEmoji={isShared ? undefined : getCustomEmoji(item.category)}
                        size={44}
                      />
                    }
                    title={cleanDescription || item.category}
                    subtitle={item.category}
                    accentBorder={isShared}
                    tags={tags}
                    badges={
                      <View style={styles.badgeRow}>
                        {isSettlement && (
                          <View style={[styles.badgePill, { backgroundColor: `${colors.positive}15`, borderColor: `${colors.positive}30` }]}>
                            <Text style={[typography.label, { color: colors.positive }]}>💚 Settlement</Text>
                          </View>
                        )}
                        {isShared && (
                          <View style={[styles.badgePill, { backgroundColor: colors.primarySubtle }]}>
                            <Text style={[typography.label, { color: colors.primary }]}>👥 Shared</Text>
                          </View>
                        )}
                        {isShared && item.settled && (
                          <View style={[styles.badgePill, { backgroundColor: `${colors.positive}15`, borderColor: `${colors.positive}30` }]}>
                            <Text style={[typography.label, { color: colors.positive }]}>Settled ✓</Text>
                          </View>
                        )}
                        {item.status === 'PENDING' && (
                          <View style={[styles.badgePill, { backgroundColor: colors.accentSubtle, borderColor: `${colors.accent}40` }]}>
                            <Text style={[typography.label, { color: colors.accent }]}>⏳ Pending</Text>
                          </View>
                        )}
                        {item.status === 'FAILED' && (
                          <View style={[styles.badgePill, { backgroundColor: `${colors.negative}15`, borderColor: `${colors.negative}30` }]}>
                            <Text style={[typography.label, { color: colors.negative }]}>✕ Failed</Text>
                          </View>
                        )}
                        {!isSettlement && (
                          <View style={[styles.badgePill, { backgroundColor: isMomoTransfer ? colors.accentSubtle : colors.neutralBg }]}>
                            <Text style={[typography.label, { color: isMomoTransfer ? colors.accent : colors.textSecondary }]}>
                              {isMomoTransfer ? '📤 Transfer' : isMomo ? '📱 MoMo' : '💵 Cash'}
                            </Text>
                          </View>
                        )}
                        {item.isRecurring && (
                          <View style={[styles.badgePill, { backgroundColor: colors.primarySubtle }]}>
                            <Text style={[typography.label, { color: colors.primary }]}>
                              🔄 {item.recurrenceType ? item.recurrenceType.charAt(0) + item.recurrenceType.slice(1).toLowerCase() : 'Recurring'}
                            </Text>
                          </View>
                        )}
                      </View>
                    }
                    amount={
                      (item.type === 'income' || isSettlement)
                        ? `+GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`
                        : `-GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`
                    }
                    amountColor={(item.type === 'income' || isSettlement) ? colors.positive : colors.negative}
                    onPress={() => openDetail(item)}
                    onLongPress={() => handleLongPress(item)}
                  />
                );
              })}
            </View>
          ))}

          {filteredExpenses.length === 0 && (
            <EmptyState icon="search" title="No transactions found" body="Try changing your filter settings or search query" />
          )}

          <Text style={[typography.label, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, fontStyle: 'italic' }]}>
            Tip: You can also long press a transaction to delete it
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {ConfirmModalComponent}
      {ActionSheetComponent}
      <Toast message={toastMessage} type={toastType} visible={toastVisible} nonce={toastNonce} onHide={hideToast} />
      <ExpenseDetailModal
        visible={showExpenseDetail}
        expense={selectedExpense}
        onClose={closeDetail}
        onDelete={(expenseId) => {
          closeDetail();
          const item = expenses.find((e) => String(e.id) === String(expenseId));
          if (item) handleDelete(item);
        }}
        customCategories={customCategories}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 46,
    right: 0,
    minWidth: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  dropdownDivider: {
    height: 1,
    marginVertical: 2,
  },
  timeFilterContainer: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    padding: 4,
    marginBottom: spacing.xl,
  },
  timeFilterBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  gaugesRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  gaugeCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  gaugeWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 2,
  },
  gaugeIconContainer: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.sm + 2,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  momoFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dateGroup: {
    marginBottom: spacing.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    flexWrap: 'wrap',
  },
  badgePill: {
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
});
