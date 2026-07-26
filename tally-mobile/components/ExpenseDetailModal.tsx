import { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing } from '../theme';
import { CategoryIcon, Button } from './ui';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;

function parseTagsFromDescription(description: string | null | undefined): {
  cleanDescription: string;
  tags: string[];
} {
  if (!description) return { cleanDescription: '', tags: [] };
  const words = description.split(' ');
  const tags = words.filter((w) => w.startsWith('#'));
  const cleanDescription = words.filter((w) => !w.startsWith('#')).join(' ').trim();
  return { cleanDescription, tags };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getPaymentLabel(paymentMethod: string): string {
  switch ((paymentMethod || '').toUpperCase()) {
    case 'MOMO': return 'MoMo 📱';
    case 'SETTLEMENT': return 'Settlement 💚';
    case 'MOMO_TRANSFER': return 'MoMo Transfer 📤';
    case 'CARD': return 'Card 💳';
    default: return 'Cash 💵';
  }
}

interface ExpenseDetailModalProps {
  visible: boolean;
  expense: any | null;
  onClose: () => void;
  onDelete: (expenseId: string | number) => void;
  customCategories: any[];
}

export default function ExpenseDetailModal({
  visible,
  expense,
  onClose,
  onDelete,
  customCategories,
}: ExpenseDetailModalProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const overlayOpacity = useSharedValue(0);
  const translateY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = 0;
      translateY.value = SHEET_HEIGHT;
      overlayOpacity.value = withTiming(1, { duration: duration.base, easing: easing.standard });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    }
  }, [visible]);

  function handleClose() {
    overlayOpacity.value = withTiming(0, { duration: duration.fast, easing: easing.standard });
    translateY.value = withTiming(SHEET_HEIGHT, { duration: duration.fast, easing: easing.standard }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!expense) return null;

  const isSettlement = expense.paymentMethod === 'SETTLEMENT' || expense.type === 'income';
  const isShared = expense.isShared || expense.type === 'shared';
  const amount = Math.abs(parseFloat(expense.amount || '0'));
  const amountStr = `${isSettlement ? '+' : '-'}GHS ${amount.toFixed(2)}`;
  const amountColor = isSettlement ? colors.positive : colors.negative;

  const { cleanDescription, tags } = parseTagsFromDescription(expense.description);

  const categoryName = expense.category || 'Other';
  const customEmoji = customCategories.find((c: any) => c.name === categoryName)?.emoji;

  const isRecurring = expense.isRecurring === true || expense.isRecurring === 'true';
  const recurrenceTypeStr = expense.recurrenceType
    ? expense.recurrenceType.charAt(0) + expense.recurrenceType.slice(1).toLowerCase()
    : '';
  const recurringLabel = isRecurring ? `Yes — ${recurrenceTypeStr || 'Recurring'}` : 'No';

  const paymentLabel = getPaymentLabel(expense.paymentMethod);

  let typeLabel = 'Personal';
  if (isSettlement) typeLabel = 'Settlement';
  else if (isShared) {
    typeLabel = expense.groupName ? `Shared (${expense.groupName})` : 'Shared';
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { backgroundColor: colors.surfaceHigh }, sheetStyle]}>
        <View style={[styles.handleBar, { backgroundColor: colors.borderSubtle }]} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} bounces={false}>
          <CategoryIcon category={categoryName} customEmoji={customEmoji} size={80} style={{ marginBottom: spacing.lg }} />

          <Text style={[typography.displayLarge, { color: amountColor, textAlign: 'center', marginBottom: spacing.sm }]}>
            {amountStr}
          </Text>

          {!!cleanDescription && (
            <Text style={[typography.body, { color: colors.text, textAlign: 'center', marginBottom: spacing.lg, paddingHorizontal: spacing.md }]}>
              {cleanDescription}
            </Text>
          )}

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.detailRows}>
            <DetailRow label="📅 Date" value={formatDate(expense.date)} colors={colors} />
            <DetailRow label="🏷️ Category" value={categoryName} colors={colors} />
            <DetailRow label="💳 Payment" value={paymentLabel} colors={colors} />
            {expense.isRecurring !== undefined && <DetailRow label="🔄 Recurring" value={recurringLabel} colors={colors} />}
            <DetailRow label="👥 Type" value={typeLabel} colors={colors} />
          </View>

          {tags.length > 0 && (
            <View style={{ width: '100%', marginBottom: spacing.lg }}>
              <Text style={[typography.bodyStrong, { color: colors.textSecondary, marginBottom: spacing.sm, fontSize: 13 }]}>🏷️ Tags</Text>
              <View style={styles.tagsRow}>
                {tags.map((tag) => (
                  <View key={tag} style={[styles.tagPill, { backgroundColor: `${colors.positive}15`, borderColor: `${colors.positive}40` }]}>
                    <Text style={[typography.caption, { color: colors.positive, fontFamily: typography.bodyStrong.fontFamily }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actions}>
            {isSettlement ? (
              <Button title="Close" onPress={handleClose} variant="secondary" />
            ) : isShared ? (
              <>
                {!!expense.groupId && (
                  <Button
                    title="👥 View Group"
                    onPress={() => {
                      handleClose();
                      setTimeout(() => {
                        router.push({
                          pathname: '/group-detail',
                          params: { groupId: String(expense.groupId), groupName: expense.groupName || '' },
                        });
                      }, 250);
                    }}
                    variant="secondary"
                  />
                )}
                <Button title="Close" onPress={handleClose} variant="secondary" />
              </>
            ) : (
              <>
                <Button title="🗑️  Delete Expense" onPress={() => onDelete(expense.id)} variant="danger" />
                <Button title="Close" onPress={handleClose} variant="secondary" />
              </>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof getExtendedColors> }) {
  return (
    <View style={[styles.detailRow, { backgroundColor: colors.inputBg }]}>
      <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[typography.bodyStrong, { color: colors.text, maxWidth: '55%', textAlign: 'right', fontSize: 14 }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  divider: {
    width: '100%',
    height: 1,
    marginBottom: spacing.lg,
  },
  detailRows: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  actions: {
    width: '100%',
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
  },
});
