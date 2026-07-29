import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, LayoutAnimation, Platform, UIManager } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../theme';
import { Card, Button } from '../components/ui';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Feather names, not emoji: these render inside the same iconCircle badge
// the rest of the app fills with a vector glyph.
const QUICK_START = [
  {
    icon: 'plus-circle',
    title: 'How to add an expense',
    desc: 'Tap the Add tab, fill in the amount, choose a category and an optional description, then tap Add Expense.',
  },
  {
    icon: 'pie-chart',
    title: 'How to set a budget',
    desc: 'Tap the Budget tab, choose a category and enter a monthly spending limit, then tap Set Budget.',
  },
  {
    icon: 'users',
    title: 'How to create a group',
    desc: 'Tap the Groups tab, then tap + Create Group, give it a name and confirm.',
  },
  {
    icon: 'share-2',
    title: 'How to split expenses',
    desc: 'Open a group, tap + Add Shared Expense, enter the amount and description — it splits equally among all members.',
  },
  {
    icon: 'smartphone',
    title: 'How to pay with MoMo',
    desc: 'When adding an expense, select MoMo as the payment method, then enter your MTN MoMo number when prompted.',
  },
];

const FAQS = [
  {
    q: 'How do I settle up with someone?',
    a: 'Open the group, go to the Balances section, and tap Settle Up next to your name if you owe money.',
  },
  {
    q: 'Why is my MoMo balance unavailable?',
    a: 'The MoMo sandbox service is occasionally unavailable. Your payments still work normally — this only affects the balance display.',
  },
  {
    q: 'How do I change my profile photo?',
    a: 'Go to Profile, tap Edit Avatar, then choose Take Photo or Choose from Gallery to update your picture.',
  },
  {
    q: 'How do I delete an expense?',
    a: 'In the History screen, long press on any expense and confirm deletion when prompted.',
  },
  {
    q: 'How do I mark a bill as paid?',
    a: 'Go to the Reminders screen and tap Mark Paid on any reminder you have settled.',
  },
  {
    q: 'What is the MoMo Only filter?',
    a: 'In History, tap 📱 MoMo Only in the filter bar to show only expenses that were paid via MTN MoMo.',
  },
  {
    q: 'How do I add someone to a group?',
    a: 'Open the group, tap + Add Member, and enter their User ID — they can find it on their own Profile screen.',
  },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  function toggleFaq(question: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaq(expandedFaq === question ? null : question);
  }

  function handleEmail() {
    Linking.openURL('mailto:support@tally.app');
  }

  function handleRate() {
    showToast('Coming soon!', 'info');
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, paddingTop: Math.max(insets.top, spacing.md) }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.neutralBg }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[typography.bodyStrong, { color: colors.text }]} accessibilityRole="header">Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card elevation="raised" style={styles.introCard}>
          <View style={[styles.introMark, { backgroundColor: colors.primarySubtle }]}>
            <Feather name="help-circle" size={28} color={colors.primary} />
          </View>
          <Text style={[typography.title, { color: colors.text, marginBottom: spacing.xs }]}>How can we help?</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}>Everything you need to know about Tally app</Text>
        </Card>

        <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, paddingLeft: 4 }]}>Getting Started</Text>
        {QUICK_START.map((item) => (
          <Card key={item.title} style={styles.rowCard}>
            <View style={styles.quickRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.neutralBg }]}>
                <Feather name={item.icon as keyof typeof Feather.glyphMap} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.xs }]}>{item.title}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 18 }]}>{item.desc}</Text>
              </View>
            </View>
          </Card>
        ))}

        <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, paddingLeft: 4 }]}>Frequently Asked Questions</Text>
        {FAQS.map((faq) => {
          const isOpen = expandedFaq === faq.q;
          return (
            <Card key={faq.q} style={styles.rowCard}>
              <TouchableOpacity style={styles.faqQuestion} onPress={() => toggleFaq(faq.q)} activeOpacity={0.7}>
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1, marginRight: spacing.sm }]}>{faq.q}</Text>
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {isOpen && (
                <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm + 2, paddingTop: spacing.sm + 2, borderTopWidth: 1, borderTopColor: colors.borderSubtle }]}>
                  {faq.a}
                </Text>
              )}
            </Card>
          );
        })}

        <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, paddingLeft: 4 }]}>Contact Support</Text>
        <Card style={styles.rowCard}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs, fontFamily: typography.bodyStrong.fontFamily }]}>Customer Support Email</Text>
          <Text style={[typography.bodyStrong, { color: colors.primary, marginBottom: spacing.md }]}>support@tally.app</Text>
          <Button title="✉️  Send Email" onPress={handleEmail} variant="secondary" />
        </Card>

        <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, paddingLeft: 4 }]}>About</Text>
        <Card style={styles.rowCard}>
          <View style={styles.aboutRow}>
            <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>App version</Text>
            <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, { marginTop: spacing.sm + 2 }]}>
            <Text style={[typography.caption, { color: colors.textSecondary, fontFamily: typography.bodyStrong.fontFamily }]}>Built by</Text>
            <Text style={[typography.caption, { color: colors.text, fontFamily: typography.bodyStrong.fontFamily }]}>Tally Team — KNUST</Text>
          </View>
          <Button title="⭐  Rate the App" onPress={handleRate} variant="secondary" style={{ marginTop: spacing.md }} />
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 40,
  },
  introCard: {
    alignItems: 'center',
  },
  rowCard: {
    marginBottom: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  // Matches EmptyState's and ConfirmModal's mark: 64px circle, 28px glyph.
  introMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQuestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
