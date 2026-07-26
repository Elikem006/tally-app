import { Modal, View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';
import { Button, Chip } from '../ui';

interface QuickAddModalProps {
  visible: boolean;
  amount: string;
  category: string;
  description: string;
  categories: string[];
  getCategoryIcon: (category: string) => string;
  saving: boolean;
  onAmountChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function QuickAddModal({
  visible,
  amount,
  category,
  description,
  categories,
  getCategoryIcon,
  saving,
  onAmountChange,
  onCategoryChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: QuickAddModalProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.surfaceHigh, borderColor: colors.borderSubtle }]}>
          <Text style={[typography.headline, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]}>
            Quick Add Expense
          </Text>

          <TextInput
            style={[typography.displayLarge, styles.amountInput, { color: colors.text }]}
            value={amount}
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            autoFocus
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.md }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}>
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                icon={<Text style={{ fontSize: 16 }}>{getCategoryIcon(cat)}</Text>}
                selected={category === cat}
                onPress={() => onCategoryChange(cat)}
              />
            ))}
          </ScrollView>

          <TextInput
            style={[typography.body, styles.descriptionInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            value={description}
            onChangeText={onDescriptionChange}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textTertiary}
          />

          <View style={styles.buttonRow}>
            <Button title="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} />
            <Button title="Add Expense" onPress={onSubmit} loading={saving} style={{ flex: 2 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  amountInput: {
    textAlign: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 60,
  },
  descriptionInput: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
