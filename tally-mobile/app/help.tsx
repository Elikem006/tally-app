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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>❓</Text>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <Text style={styles.headerSub}>Everything you need to know about Tally</Text>
      </View>

      {/* Getting Started */}
      <Text style={styles.sectionTitle}>Getting Started</Text>
      {QUICK_START.map((item) => (
        <View key={item.title} style={styles.card}>
          <View style={styles.quickRow}>
            <Text style={styles.quickIcon}>{item.icon}</Text>
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
              <Text style={styles.faqArrow}>{isOpen ? "▲" : "▼"}</Text>
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
        <Text style={styles.contactLabel}>Email</Text>
        <Text style={styles.contactEmail}>support@tally.app</Text>
        <TouchableOpacity style={styles.contactButton} onPress={handleEmail} activeOpacity={0.7}>
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
        <TouchableOpacity style={styles.rateButton} onPress={handleRate} activeOpacity={0.7}>
          <Text style={styles.rateButtonText}>⭐  Rate the App</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
      <Toast message={toastMessage} type={toastType} visible={toastVisible} onHide={hideToast} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 8,
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 14,
    color: "#8890A0",
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00C896",
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff10",
  },
  // Quick Start
  quickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  quickIcon: {
    fontSize: 22,
    marginTop: 1,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
  },
  quickDesc: {
    fontSize: 13,
    color: "#8890A0",
    lineHeight: 20,
  },
  // FAQ
  faqQuestion: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
    paddingRight: 8,
  },
  faqArrow: {
    fontSize: 12,
    color: "#8890A0",
  },
  faqAnswer: {
    fontSize: 13,
    color: "#8890A0",
    lineHeight: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ffffff10",
  },
  // Contact
  contactLabel: {
    fontSize: 12,
    color: "#8890A0",
    marginBottom: 4,
  },
  contactEmail: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "500",
    marginBottom: 14,
  },
  contactButton: {
    backgroundColor: "#00C89620",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00C896",
  },
  contactButtonText: {
    color: "#00C896",
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
    color: "#8890A0",
  },
  aboutValue: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "500",
  },
  rateButton: {
    backgroundColor: "#FFC10720",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFC107",
    marginTop: 14,
  },
  rateButtonText: {
    color: "#FFC107",
    fontWeight: "bold",
    fontSize: 14,
  },
});
