import { useState, useCallback, useMemo } from 'react';
import ExpenseDetailModal from '../../components/ExpenseDetailModal';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { expenseAPI, budgetAPI, categoriesAPI } from '../../services/api';
import SkeletonItem, { SkeletonExpenseItem } from '../../components/SkeletonItem';
import { getUserId, currentUser } from '../../services/storage';
import { useConfirmModal } from '../../hooks/useConfirmModal';
import { useTheme } from '../../hooks/useTheme';

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
  Shared: '👥',
  Settlement: '💚',
};

// Helper for timezone-independent date parsing
const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length < 3) return new Date(dateStr);
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

// Helper for three-quarter circle progress gauges (from 135 deg to 405 deg)
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

function parseTagsFromDescription(description: string | null | undefined): {
  cleanDescription: string;
  tags: string[];
} {
  if (!description) return { cleanDescription: "", tags: [] };
  const words = description.split(" ");
  const tags = words.filter((w) => w.startsWith("#"));
  const cleanDescription = words.filter((w) => !w.startsWith("#")).join(" ").trim();
  return { cleanDescription, tags };
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<any[]>([]);

  // Emoji for default categories first, then user-created custom categories
  function getCategoryIcon(categoryName: string): string {
    if (CATEGORY_ICONS[categoryName]) return CATEGORY_ICONS[categoryName];
    const custom = customCategories.find((c: any) => c.name === categoryName);
    if (custom?.emoji) return custom.emoji;
    return '📦';
  }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Redesigned interactive states
  const [activeTimeFilter, setActiveTimeFilter] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [momoOnly, setMomoOnly] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData(true);
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
        // Settlements first within the same date
        const aSettle = a.paymentMethod === 'SETTLEMENT' ? 1 : 0;
        const bSettle = b.paymentMethod === 'SETTLEMENT' ? 1 : 0;
        return bSettle - aSettle;
      });
      setExpenses(sorted);
      setBudgets(budgetsRes.data || []);
    } catch (err: any) {
      setError('Failed to load history data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  }

  // ── Expense detail modal ────────────────────────────────────────────────────
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

  // ── Export (CSV via backend + expo-sharing, PDF via expo-print) ────────────

  const { showConfirm, ConfirmModalComponent } = useConfirmModal();
  const [exporting, setExporting] = useState(false);

  function handleExportPress() {
    Alert.alert('Export Expenses', 'Choose a format', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Export CSV', onPress: exportCsv },
      { text: 'Export PDF', onPress: exportPdf },
    ]);
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await expenseAPI.exportExpenses(getUserId(), 'csv');
      const csv = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      const fileUri = `${FileSystem.cacheDirectory}tally-expenses.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Tally expenses' });
      } else {
        Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.response?.data?.error || 'Could not export CSV. Please try again.');
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
      .filter((e) => e.type !== 'income')
      .reduce((sum, e) => sum + Math.abs(parseFloat(e.amount || '0')), 0);

    const rows = [...expenses]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((e) => {
        const amt = parseFloat(e.amount || '0');
        const sign = e.type === 'income' ? '+' : '-';
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
        Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
      }
    } catch {
      Alert.alert('Export failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // ── Recurring (long-press menu) ─────────────────────────────────────────────

  function handleLongPress(item: any) {
    if (item.isShared || item.type === 'shared') {
      Alert.alert('Shared Expense', 'Shared expenses can only be managed from the group screen.');
      return;
    }
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' },
      item.isRecurring
        ? { text: 'Remove recurring', onPress: () => setRecurring(item, false) }
        : { text: 'Mark as recurring', onPress: () => pickRecurrence(item) },
      { text: 'Delete expense', style: 'destructive', onPress: () => handleDelete(item) },
    ];
    Alert.alert('Expense options', item.description || item.category, options);
  }

  function pickRecurrence(item: any) {
    Alert.alert('Repeat how often?', 'This expense will repeat automatically', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Daily', onPress: () => setRecurring(item, true, 'DAILY') },
      { text: 'Weekly', onPress: () => setRecurring(item, true, 'WEEKLY') },
      { text: 'Monthly', onPress: () => setRecurring(item, true, 'MONTHLY') },
    ]);
  }

  async function setRecurring(item: any, isRecurring: boolean, recurrenceType = '') {
    try {
      await expenseAPI.updateRecurring(String(item.id), isRecurring, recurrenceType);
      await fetchData(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not update recurring setting.');
    }
  }

  function handleDelete(item: any) {
    if (item.isShared || item.type === 'shared') {
      Alert.alert('Shared Expense', 'Shared expenses can only be deleted from the group screen.');
      return;
    }
    showConfirm({
      icon: '🗑️',
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense? This cannot be undone.',
      confirmText: 'Delete',
      confirmColor: '#E05C5C',
      onConfirm: async () => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          await expenseAPI.deleteExpense(String(item.id), getUserId());
          // Only personal expenses reach here — match on id AND type so a
          // shared entry with the same numeric id isn't removed too
          setExpenses((prev) =>
            prev.filter((e) => !(e.id === item.id && !(e.isShared || e.type === 'shared'))),
          );
        } catch {
          Alert.alert('Error', 'Failed to delete expense');
        }
      },
    });
  }

  // Filter based on Time, Search Query and MoMo status (Timezone independent local dates)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;

      // 1. Time filtering
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

      // 2. Search query filtering — matches description, category, tags,
      // amount ("50" finds GHS 50.00) and month name ("june" finds June)
      const { cleanDescription, tags } = parseTagsFromDescription(e.description);
      const desc = (cleanDescription || '').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      const tagsStr = tags.join(' ').toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      const amountStr = Math.abs(parseFloat(e.amount || '0')).toFixed(2);
      const MONTH_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const monthIdx = e.date ? parseInt(e.date.split('-')[1], 10) - 1 : -1;
      const monthName = monthIdx >= 0 && monthIdx < 12 ? MONTH_FULL[monthIdx] : '';
      const matchesSearch = !query
        || desc.includes(query)
        || cat.includes(query)
        || tagsStr.includes(query)
        || amountStr.includes(query)
        || monthName.startsWith(query);

      // 3. MoMo filter
      const matchesMomo = !momoOnly || e.paymentMethod === "MOMO" || e.paymentMethod === "MOMO_TRANSFER";

      return matchesTime && matchesSearch && matchesMomo;
    });
  }, [expenses, activeTimeFilter, searchQuery, momoOnly]);

  // Sum of limits of all user budgets
  const totalBudget = useMemo(() => {
    return budgets.reduce((sum, b) => sum + parseFloat(b.monthlyLimit || '0'), 0);
  }, [budgets]);

  // Dynamically scale budget based on selected time filter (for Total Spend comparison)
  const scaledBudget = useMemo(() => {
    const baseBudget = totalBudget;
    if (activeTimeFilter === 'today') {
      return parseFloat((baseBudget / 30).toFixed(2));
    }
    if (activeTimeFilter === 'week') {
      return parseFloat((baseBudget * 7 / 30).toFixed(2));
    }
    if (activeTimeFilter === 'month') {
      return baseBudget;
    }
    return baseBudget * 12;
  }, [totalBudget, activeTimeFilter]);

  // Total spent = every non-income transaction (personal AND shared), regardless
  // of stored sign — expenses are always money going out. Income and
  // settlements are money coming IN, so they are excluded entirely (not
  // subtracted) — "Total Spent" only ever reflects money going out and never
  // goes negative.
  const totalSpent = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => {
      if (e.type === 'income' || e.paymentMethod === 'SETTLEMENT') return sum;
      return sum + Math.abs(parseFloat(e.amount || '0'));
    }, 0);
  }, [filteredExpenses]);

  // Progress values for gauges (safe division)
  const spendProgress = useMemo(() => {
    return scaledBudget > 0 ? Math.min(totalSpent / scaledBudget, 1.0) : 0;
  }, [totalSpent, scaledBudget]);

  const balanceProgress = 1.0;

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
        } catch (_) {}
      }

      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(e);
    });

    return Object.entries(groups).map(([date, items]) => ({
      date,
      items,
    }));
  };

  const groupedExpenses = groupExpensesByDate(filteredExpenses);

  if (loading && !refreshing) {
    // Skeleton loading — placeholder cards instead of a bare spinner
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 60 }]}>
        <SkeletonItem width="55%" height={28} borderRadius={12} style={{ marginBottom: 20 }} />
        <SkeletonItem height={48} borderRadius={24} style={{ marginBottom: 16 }} />
        {[...Array(6)].map((_, i) => (
          <SkeletonExpenseItem key={i} />
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
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => fetchData(true)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 30) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>Analytics & History</Text>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }, exporting && { opacity: 0.5 }]}
          onPress={handleExportPress}
          disabled={exporting}
          activeOpacity={0.8}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={[styles.exportBtnText, { color: colors.text }]}>📤 Export</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={[styles.timeFilterContainer, { backgroundColor: colors.neutralBg }]}>
        {(['today', 'week', 'month', 'year'] as const).map((filter) => {
          const labelMap = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' };
          const isActive = activeTimeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.timeFilterBtn, isActive && { backgroundColor: colors.cardBg }]}
              onPress={() => setActiveTimeFilter(filter)}
              activeOpacity={0.8}
            >
              <Text style={[styles.timeFilterText, { color: colors.textSecondary }, isActive && { color: colors.text, fontWeight: 'bold' }]}>
                {labelMap[filter]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 2. Side-by-side Gauges: Total Spend and Balance */}
      <View style={styles.gaugesRow}>
        {/* Total Spending Gauge */}
        <View style={[styles.gaugeCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.gaugeWrapper}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke={colors.border} strokeWidth="5.5" strokeLinecap="round" />
              {totalSpent > 0 && scaledBudget > 0 && (
                <Path
                  d={getGaugePath(36, 36, 28, spendProgress)}
                  fill="none"
                  stroke="#FF9500"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
              )}
            </Svg>
            <View style={styles.gaugeIconContainer}>
              <Feather name="upload" size={14} color="#FF9500" />
            </View>
          </View>
          <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>Total Spent</Text>
          <Text style={[styles.gaugeValue, { color: colors.text }]}>GHS {totalSpent.toFixed(0)}</Text>
        </View>

        {/* Balance Gauge */}
        <View style={[styles.gaugeCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.gaugeWrapper}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Path d={getGaugePath(36, 36, 28, 1.0)} fill="none" stroke={colors.border} strokeWidth="5.5" strokeLinecap="round" />
              {totalBudget > 0 && (
                <Path
                  d={getGaugePath(36, 36, 28, balanceProgress)}
                  fill="none"
                  stroke="#34C759"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
              )}
            </Svg>
            <View style={styles.gaugeIconContainer}>
              <Feather name="pie-chart" size={14} color="#34C759" />
            </View>
          </View>
          <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>Balance</Text>
          <Text style={[styles.gaugeValue, { color: colors.text }]}>GHS {totalBudget.toFixed(0)}</Text>
        </View>
      </View>

      {/* 3. Search Bar */}
      <View style={[
        styles.searchContainer,
        { backgroundColor: colors.inputBg, borderColor: colors.border },
        searchFocused && { borderColor: colors.primary }
      ]}>
        <Feather name="search" size={18} color="#8E9AA6" style={styles.searchIcon} />
        <TextInput
          style={[styles.searchBar, { color: colors.text }]}
          placeholder="Search filtered list..."
          placeholderTextColor={theme === 'dark' ? '#4B5563' : '#8E9AA6'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7} style={styles.clearButton}>
            <Feather name="x" size={16} color="#8E9AA6" />
          </TouchableOpacity>
        )}
      </View>
      {/* 3.5 Standalone Filters */}
      <View style={styles.filterOptionsRow}>
        <TouchableOpacity
          style={[
            styles.momoFilterBtn,
            { backgroundColor: colors.neutralBg, borderColor: colors.border },
            momoOnly && { backgroundColor: colors.accent + '20', borderColor: colors.accent }
          ]}
          onPress={() => setMomoOnly(!momoOnly)}
          activeOpacity={0.8}
        >
          <Text style={[
            styles.momoFilterBtnText,
            { color: colors.textSecondary },
            momoOnly && { color: colors.accent, fontWeight: 'bold' }
          ]}>
            📱 MoMo Only
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. List of Transactions */}
      {groupedExpenses.map((group) => (
        <View key={group.date} style={styles.dateGroup}>
          <Text style={[styles.dateHeader, { color: colors.textSecondary }]}>{group.date}</Text>
          {group.items.map((item) => {
            const isShared = item.isShared || item.type === "shared";
            const isMomo = item.paymentMethod === "MOMO";
            const isMomoTransfer = item.paymentMethod === "MOMO_TRANSFER";
            const isSettlement = item.paymentMethod === "SETTLEMENT";
            const { cleanDescription, tags } = parseTagsFromDescription(item.description);
            return (
              <TouchableOpacity
                // type+id — personal and shared entries can share numeric ids
                key={`${item.type ?? (isShared ? "shared" : "personal")}-${item.id}`}
                style={[
                  styles.expenseCard,
                  { backgroundColor: colors.cardBg, borderColor: colors.border },
                  isShared && { borderColor: colors.primary, borderWidth: 1.5 }
                ]}
                onPress={() => openDetail(item)}
                onLongPress={() => handleLongPress(item)}
                activeOpacity={0.9}
              >
                <View style={styles.expenseLeft}>
                  <View style={[styles.iconBox, { backgroundColor: colors.neutralBg }]}>
                    <Text style={styles.icon}>{isShared ? '👥' : getCategoryIcon(item.category)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.descRow}>
                      <Text style={[styles.expenseDescription, { color: colors.text }]} numberOfLines={1}>
                        {cleanDescription || item.category}
                      </Text>
                    </View>
                    <Text style={[styles.expenseCategory, { color: colors.textSecondary }]}>{item.category}</Text>
                    
                    <View style={styles.badgeRow}>
                      {isSettlement && (
                        <View style={[styles.sharedBadge, { backgroundColor: colors.positive + '15', borderColor: colors.positive + '30' }]}>
                          <Text style={[styles.sharedBadgeText, { color: colors.positive }]}>💚 Settlement</Text>
                        </View>
                      )}
                      {isShared && (
                        <View style={[styles.sharedBadge, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.sharedBadgeText, { color: colors.primary }]}>👥 Shared</Text>
                        </View>
                      )}
                      {isShared && item.settled && (
                        <View style={[styles.sharedBadge, { backgroundColor: colors.positive + '15', borderColor: colors.positive + '30' }]}>
                          <Text style={[styles.sharedBadgeText, { color: colors.positive }]}>Settled ✓</Text>
                        </View>
                      )}
                      {item.status === 'PENDING' && (
                        <View style={[styles.sharedBadge, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B40' }]}>
                          <Text style={[styles.sharedBadgeText, { color: '#D97706' }]}>⏳ Pending</Text>
                        </View>
                      )}
                      {item.status === 'FAILED' && (
                        <View style={[styles.sharedBadge, { backgroundColor: colors.negative + '15', borderColor: colors.negative + '30' }]}>
                          <Text style={[styles.sharedBadgeText, { color: colors.negative }]}>✕ Failed</Text>
                        </View>
                      )}
                      {!isSettlement && (
                        <View style={[styles.paymentBadge, { backgroundColor: isMomoTransfer ? colors.accent + '15' : colors.neutralBg }]}>
                          <Text style={[styles.paymentBadgeText, { color: isMomoTransfer ? colors.accent : colors.textSecondary }]}>
                            {isMomoTransfer ? "📤 Transfer" : isMomo ? "📱 MoMo" : "💵 Cash"}
                          </Text>
                        </View>
                      )}
                      {item.isRecurring && (
                        <View style={[styles.paymentBadge, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.paymentBadgeText, { color: colors.primary }]}>
                            🔄 {item.recurrenceType
                              ? item.recurrenceType.charAt(0) + item.recurrenceType.slice(1).toLowerCase()
                              : 'Recurring'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {tags.length > 0 && (
                      <View style={styles.tagsContainer}>
                        {tags.map((tag) => (
                          <View key={tag} style={[styles.tagPill, { backgroundColor: colors.neutralBg }]}>
                            <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.expenseRight}>
                  {/* Money going OUT unless explicitly income or a settlement received */}
                  <Text style={[
                    styles.expenseAmount,
                    { color: (item.type === 'income' || isSettlement) ? colors.positive : colors.negative }
                  ]}>
                    {(item.type === 'income' || isSettlement)
                      ? `+GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`
                      : `-GHS ${Math.abs(parseFloat(item.amount || '0')).toFixed(2)}`}
                  </Text>
                  <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {filteredExpenses.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>No transactions found</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Try changing your filter settings or search query</Text>
        </View>
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>Tip: You can also long press a transaction to delete it</Text>
    </ScrollView>
    {ConfirmModalComponent}
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
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
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
  cardHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 20,
    paddingLeft: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exportBtn: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
    minWidth: 92,
    alignItems: 'center',
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Time filters styles (aligned with budget.tsx theme)
  timeFilterContainer: {
    flexDirection: 'row',
    backgroundColor: '#EAEBEF',
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E4E8',
  },
  timeFilterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  timeFilterBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  timeFilterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E9AA6',
  },
  timeFilterTextActive: {
    color: '#111111',
  },
  // Gauges row styles
  gaugesRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  gaugeWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  gaugeIconContainer: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gaugeValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  // Search bar styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  searchContainerFocused: {
    borderColor: '#111111',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchBar: {
    flex: 1,
    color: '#111111',
    fontSize: 15,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
  // Standalone MoMo filter row
  filterOptionsRow: {
    flexDirection: 'row',
    marginHorizontal: 4,
    marginBottom: 20,
  },
  momoFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  momoFilterBtnActive: {
    backgroundColor: '#F59E0B0a',
    borderColor: '#F59E0B',
  },
  momoFilterBtnText: {
    color: '#8E9AA6',
    fontSize: 13,
    fontWeight: 'bold',
  },
  momoFilterBtnTextActive: {
    color: '#D97706',
  },
  // Date group list styles
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingLeft: 4,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  sharedCard: {
    borderColor: '#8B5CF640',
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  icon: {
    fontSize: 20,
  },
  descRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  expenseCategory: {
    fontSize: 11,
    color: '#8E9AA6',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  sharedBadge: {
    backgroundColor: '#8B5CF610',
    borderWidth: 1,
    borderColor: '#8B5CF625',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  sharedBadgeText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  paymentBadge: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EAEBEF',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  paymentBadgeText: {
    color: '#8E9AA6',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  momoBadge: {
    backgroundColor: '#F59E0B10',
    borderColor: '#F59E0B25',
  },
  momoBadgeText: {
    color: '#D97706',
  },
  expenseRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 6,
  },
  deleteBtn: {
    padding: 4,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginTop: 4,
    opacity: 0.5,
  },
  // Tags styles
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagPill: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  tagText: {
    fontSize: 10,
    color: '#8E9AA6',
    fontWeight: '500',
  },
  // Empty & Hint states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#8E9AA6',
  },
  hint: {
    fontSize: 11,
    color: '#8E9AA6',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#8E9AA6',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
