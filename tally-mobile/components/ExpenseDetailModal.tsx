import { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;

const CATEGORY_COLORS: { [key: string]: string } = {
  Food: '#FF6B6B',
  Transport: '#4ECDC4',
  Entertainment: '#A855F7',
  Utilities: '#F59E0B',
  Other: '#6B7280',
  Settlement: '#00C896',
  Shared: '#8B5CF6',
};

const CATEGORY_ICONS: { [key: string]: string } = {
  Food: '🍔',
  Transport: '🚗',
  Entertainment: '🎮',
  Utilities: '💡',
  Other: '📦',
  Shared: '👥',
  Settlement: '💚',
};

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
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      slideAnim.setValue(SHEET_HEIGHT);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]).start();
    }
  }, [visible]);

  function handleClose() {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }

  if (!expense) return null;

  const isSettlement =
    expense.paymentMethod === 'SETTLEMENT' || expense.type === 'income';
  const isShared = expense.isShared || expense.type === 'shared';
  const amount = Math.abs(parseFloat(expense.amount || '0'));
  const amountStr = `${isSettlement ? '+' : '-'}GHS ${amount.toFixed(2)}`;
  const amountColor = isSettlement ? '#00C896' : '#E05C5C';

  const { cleanDescription, tags } = parseTagsFromDescription(expense.description);

  // Category info
  const categoryName = expense.category || 'Other';
  const catColor = CATEGORY_COLORS[categoryName] || '#6B7280';
  let catEmoji = CATEGORY_ICONS[categoryName];
  if (!catEmoji) {
    const custom = customCategories.find((c: any) => c.name === categoryName);
    catEmoji = custom?.emoji || '📦';
  }

  // Recurring
  const isRecurring =
    expense.isRecurring === true || expense.isRecurring === 'true';
  const recurrenceTypeStr = expense.recurrenceType
    ? expense.recurrenceType.charAt(0) + expense.recurrenceType.slice(1).toLowerCase()
    : '';
  const recurringLabel = isRecurring
    ? `Yes — ${recurrenceTypeStr || 'Recurring'}`
    : 'No';

  // Payment
  const paymentLabel = getPaymentLabel(expense.paymentMethod);

  // Type label
  let typeLabel = 'Personal';
  if (isSettlement) typeLabel = 'Settlement';
  else if (isShared) {
    typeLabel = expense.groupName ? `Shared (${expense.groupName})` : 'Shared';
  }

  // Theme-aware colours
  const cardBg = isDark ? '#1A1F2E' : '#FFFFFF';
  const dividerColor = isDark ? '#ffffff15' : '#EAEBEF';
  const rowBg = isDark ? '#0F1117' : '#F3F4F6';
  const labelColor = isDark ? '#8890A0' : '#6B7280';
  const valueColor = isDark ? '#FFFFFF' : '#111111';
  const handleColor = isDark ? '#ffffff30' : '#00000020';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Dimmed overlay — tap to close */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: cardBg, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={[styles.handleBar, { backgroundColor: handleColor }]} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {/* Category circle */}
          <View
            style={[
              styles.categoryCircle,
              {
                backgroundColor: catColor + '25',
                borderColor: catColor + '60',
              },
            ]}
          >
            <Text style={styles.categoryEmoji}>{catEmoji}</Text>
          </View>

          {/* Amount */}
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountStr}
          </Text>

          {/* Description */}
          {!!cleanDescription && (
            <Text style={[styles.description, { color: valueColor }]}>
              {cleanDescription}
            </Text>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Detail rows */}
          <View style={styles.detailRows}>
            <DetailRow
              label="📅 Date"
              value={formatDate(expense.date)}
              labelColor={labelColor}
              valueColor={valueColor}
              rowBg={rowBg}
            />
            <DetailRow
              label="🏷️ Category"
              value={`${catEmoji} ${categoryName}`}
              labelColor={labelColor}
              valueColor={valueColor}
              rowBg={rowBg}
            />
            <DetailRow
              label="💳 Payment"
              value={paymentLabel}
              labelColor={labelColor}
              valueColor={valueColor}
              rowBg={rowBg}
            />
            {expense.isRecurring !== undefined && (
              <DetailRow
                label="🔄 Recurring"
                value={recurringLabel}
                labelColor={labelColor}
                valueColor={valueColor}
                rowBg={rowBg}
              />
            )}
            <DetailRow
              label="👥 Type"
              value={typeLabel}
              labelColor={labelColor}
              valueColor={valueColor}
              rowBg={rowBg}
            />
          </View>

          {/* Tags */}
          {tags.length > 0 && (
            <View style={[styles.tagsSection, { width: '100%' }]}>
              <Text style={[styles.tagsLabel, { color: labelColor }]}>
                🏷️ Tags
              </Text>
              <View style={styles.tagsRow}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tagPill}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {isSettlement ? (
              // Settlement: no delete, just close
              <TouchableOpacity
                style={[styles.closeBtn, { borderColor: dividerColor }]}
                onPress={handleClose}
                activeOpacity={0.8}
              >
                <Text style={[styles.closeBtnText, { color: valueColor }]}>
                  Close
                </Text>
              </TouchableOpacity>
            ) : isShared ? (
              // Shared: view group (if groupId available) + close
              <>
                {!!expense.groupId && (
                  <TouchableOpacity
                    style={[
                      styles.viewGroupBtn,
                      {
                        backgroundColor: colors.neutralBg,
                        borderColor: dividerColor,
                      },
                    ]}
                    onPress={() => {
                      handleClose();
                      setTimeout(() => {
                        router.push({
                          pathname: '/group-detail',
                          params: {
                            groupId: String(expense.groupId),
                            groupName: expense.groupName || '',
                          },
                        });
                      }, 250);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.viewGroupBtnText, { color: valueColor }]}
                    >
                      👥 View Group
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.closeBtn, { borderColor: dividerColor }]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.closeBtnText, { color: valueColor }]}>
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              // Personal: delete + close
              <>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => onDelete(expense.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteBtnText}>🗑️  Delete Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.closeBtn, { borderColor: dividerColor }]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.closeBtnText, { color: valueColor }]}>
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  labelColor,
  valueColor,
  rowBg,
}: {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
  rowBg: string;
}) {
  return (
    <View style={[styles.detailRow, { backgroundColor: rowBg }]}>
      <Text style={[styles.detailLabel, { color: labelColor }]}>{label}</Text>
      <Text
        style={[styles.detailValue, { color: valueColor }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 0,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  categoryCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  categoryEmoji: {
    fontSize: 36,
  },
  amount: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  divider: {
    width: '100%',
    height: 1,
    marginBottom: 16,
  },
  detailRows: {
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  tagsSection: {
    marginBottom: 20,
  },
  tagsLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: '#00C89615',
    borderWidth: 1,
    borderColor: '#00C89640',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tagText: {
    fontSize: 13,
    color: '#00C896',
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  deleteBtn: {
    backgroundColor: '#E05C5C',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  viewGroupBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  viewGroupBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  closeBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
