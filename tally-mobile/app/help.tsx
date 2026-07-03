import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const QUICK_START = [
  {
    icon: "➕",
    title: "How to add an expense",
    desc: "Tap the Add tab, fill in the amount, choose a category and an optional description, then tap Add Expense.",
  },
  {
    icon: "📊",
    title: "How to set a budget",
    desc: "Tap the Budget tab, choose a category and enter a monthly spending limit, then tap Set Budget.",
  },
  {
    icon: "👥",
    title: "How to create a group",
    desc: "Tap the Groups tab, then tap + Create Group, give it a name and confirm.",
  },
  {
    icon: "🤝",
    title: "How to split expenses",
    desc: "Open a group, tap + Add Shared Expense, enter the amount and description — it splits equally among all members.",
  },
  {
    icon: "📱",
    title: "How to pay with MoMo",
    desc: "When adding an expense, select MoMo as the payment method, then enter your MTN MoMo number when prompted.",
  },
];

const FAQS = [
  {
    q: "How do I settle up with someone?",
    a: "Open the group, go to the Balances section, and tap Settle Up next to your name if you owe money.",
  },
  {
    q: "Why is my MoMo balance unavailable?",
    a: "The MoMo sandbox service is occasionally unavailable. Your payments still work normally — this only affects the balance display.",
  },
  {
    q: "How do I change my profile photo?",
    a: "Go to Profile, tap Edit Avatar, then choose Take Photo or Choose from Gallery to update your picture.",
  },
  {
    q: "How do I delete an expense?",
    a: "In the History screen, long press on any expense and confirm deletion when prompted.",
  },
  {
    q: "How do I mark a bill as paid?",
    a: "Go to the Reminders screen and tap Mark Paid on any reminder you have settled.",
  },
  {
    q: "What is the MoMo Only filter?",
    a: "In History, tap 📱 MoMo Only in the filter bar to show only expenses that were paid via MTN MoMo.",
  },
  {
    q: "How do I add someone to a group?",
    a: "Open the group, tap + Add Member, and enter their User ID — they can find it on their own Profile screen.",
  },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const { showToast, toastMessage, toastType, toastVisible, hideToast } = useToast();

  function toggleFaq(question: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaq(expandedFaq === question ? null : question);
  }

  function handleEmail() {
    Linking.openURL("mailto:support@tally.app");
  }

  function handleRate() {
    showToast("Coming soon!", "info");
  }

  return (
    <View style={styles.flex}>
      {/* Top Header Row with Back Button */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.headerBarTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <Text style={styles.headerEmoji}>❓</Text>
          <Text style={styles.introTitle}>How can we help?</Text>
          <Text style={styles.introSub}>Everything you need to know about Tally app</Text>
        </View>

        {/* Getting Started */}
        <Text style={styles.sectionTitle}>Getting Started</Text>
        {QUICK_START.map((item) => (
          <View key={item.title} style={styles.card}>
            <View style={styles.quickRow}>
              <View style={styles.iconCircle}>
                <Text style={styles.quickIcon}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickTitle}>{item.title}</Text>
                <Text style={styles.quickDesc}>{item.desc}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* FAQ */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {FAQS.map((faq) => {
          const isOpen = expandedFaq === faq.q;
          return (
            <View key={faq.q} style={styles.card}>
              <TouchableOpacity
                style={styles.faqQuestion}
                onPress={() => toggleFaq(faq.q)}
                activeOpacity={0.7}
              >
                <Text style={styles.faqQuestionText}>{faq.q}</Text>
                <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#8E9AA6" />
              </TouchableOpacity>
              {isOpen && (
                <Text style={styles.faqAnswer}>{faq.a}</Text>
              )}
            </View>
          );
        })}

        {/* Contact */}
        <Text style={styles.sectionTitle}>Contact Support</Text>
        <View style={styles.card}>
          <Text style={styles.contactLabel}>Customer Support Email</Text>
          <Text style={styles.contactEmail}>support@tally.app</Text>
          <TouchableOpacity style={styles.contactButton} onPress={handleEmail} activeOpacity={0.8}>
            <Text style={styles.contactButtonText}>✉️  Send Email</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, { marginTop: 10 }]}>
            <Text style={styles.aboutLabel}>Built by</Text>
            <Text style={styles.aboutValue}>Tally Team — KNUST</Text>
          </View>
          <TouchableOpacity style={styles.rateButton} onPress={handleRate} activeOpacity={0.8}>
            <Text style={styles.rateButtonText}>⭐  Rate the App</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#EAEBEF',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  headerBarTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  introCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EAEBEF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  headerEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 6,
  },
  introSub: {
    fontSize: 13,
    color: '#8E9AA6',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E9AA6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: {
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
  // Quick Start
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAEBEF',
  },
  quickIcon: {
    fontSize: 18,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 4,
  },
  quickDesc: {
    fontSize: 13,
    color: "#8E9AA6",
    lineHeight: 18,
  },
  // FAQ
  faqQuestion: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
    flex: 1,
    paddingRight: 8,
  },
  faqAnswer: {
    fontSize: 13,
    color: "#8E9AA6",
    lineHeight: 18,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EAEBEF",
  },
  // Contact
  contactLabel: {
    fontSize: 12,
    color: "#8E9AA6",
    marginBottom: 4,
    fontWeight: '600',
  },
  contactEmail: {
    fontSize: 15,
    color: "#111111",
    fontWeight: "700",
    marginBottom: 14,
  },
  contactButton: {
    backgroundColor: "#8B5CF610",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#8B5CF625",
  },
  contactButtonText: {
    color: "#8B5CF6",
    fontWeight: "bold",
    fontSize: 14,
  },
  // About
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aboutLabel: {
    fontSize: 13,
    color: "#8E9AA6",
    fontWeight: '500',
  },
  aboutValue: {
    fontSize: 13,
    color: "#111111",
    fontWeight: '700',
  },
  rateButton: {
    backgroundColor: "#F59E0B10",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B25",
    marginTop: 14,
  },
  rateButtonText: {
    color: "#D97706",
    fontWeight: "bold",
    fontSize: 14,
  },
});
