import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { safeStorage } from "../services/storage";

const ONBOARDING_KEY = "tallyOnboardingComplete";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const STEPS = [
  {
    emoji: "💰",
    title: "Welcome to Tally! 👋",
    body: "Your personal finance companion for tracking expenses and splitting costs with friends",
  },
  {
    emoji: "📊",
    title: "Track Every Cedi",
    body: "Add expenses instantly, set budgets and see where your money goes with beautiful charts",
  },
  {
    emoji: "👥",
    title: "Split Fairly with Friends",
    body: "Create groups, add shared expenses and settle up — even with MTN MoMo payments",
  },
];

// Mini previews per step
const CATEGORY_PREVIEW = ["🍔 Food", "🚗 Transport", "🎮 Fun", "💡 Utilities"];
const GROUP_PREVIEW = [
  { name: "Elikem", label: "is owed", amount: "+GHS 60", color: "#00C896" },
  { name: "Joseph", label: "owes", amount: "-GHS 30", color: "#E05C5C" },
  { name: "Ishmael", label: "owes", amount: "-GHS 30", color: "#E05C5C" },
];

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(1); // 1-3
  const slideAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Slide the content in from the right on every step change
  useEffect(() => {
    slideAnim.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentStep]);

  // Gentle floating animation for the hero emoji
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  async function finish() {
    try {
      await safeStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      // Non-critical — worst case they see onboarding once more
    }
    router.replace("/(tabs)");
  }

  function next() {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
    else finish();
  }

  const step = STEPS[currentStep - 1];
  const translateX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_WIDTH * 0.25, 0] });
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });

  return (
    <View style={styles.container}>
      {/* Skip — all steps */}
      <TouchableOpacity style={styles.skipBtn} onPress={finish} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <Animated.View style={[styles.content, { opacity: slideAnim, transform: [{ translateX }] }]}>
        <Animated.Text style={[styles.heroEmoji, { transform: [{ translateY: floatY }] }]}>
          {step.emoji}
        </Animated.Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        {/* Step 2 — expense categories preview */}
        {currentStep === 2 && (
          <View style={styles.previewRow}>
            {CATEGORY_PREVIEW.map((cat) => (
              <View key={cat} style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{cat}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Step 3 — group balance preview */}
        {currentStep === 3 && (
          <View style={styles.groupPreview}>
            {GROUP_PREVIEW.map((m) => (
              <View key={m.name} style={styles.groupRow}>
                <View style={styles.groupAvatar}>
                  <Text style={styles.groupAvatarText}>{m.name.charAt(0)}</Text>
                </View>
                <Text style={styles.groupName}>{m.name}</Text>
                <Text style={styles.groupLabel}>{m.label}</Text>
                <Text style={[styles.groupAmount, { color: m.color }]}>{m.amount}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      {/* Dots + navigation */}
      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.dot,
                s === currentStep && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {currentStep === 3 ? "Get Started →" : "Next →"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1117",
    paddingHorizontal: 28,
  },
  skipBtn: {
    position: "absolute",
    top: 56,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: "#8890A0",
    fontSize: 15,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: {
    fontSize: 80,
    marginBottom: 28,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
  },
  body: {
    color: "#8890A0",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    paddingHorizontal: 12,
  },
  previewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 28,
  },
  categoryChip: {
    backgroundColor: "#1A1F2E",
    borderWidth: 1,
    borderColor: "#00C89630",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryChipText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  groupPreview: {
    width: "100%",
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff10",
    padding: 16,
    marginTop: 28,
    gap: 12,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00C89625",
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarText: {
    color: "#00C896",
    fontSize: 14,
    fontWeight: "bold",
  },
  groupName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  groupLabel: {
    color: "#8890A0",
    fontSize: 12,
  },
  groupAmount: {
    fontSize: 14,
    fontWeight: "bold",
  },
  footer: {
    paddingBottom: 48,
    gap: 24,
    alignItems: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2A2F3E",
  },
  dotActive: {
    backgroundColor: "#00C896",
    width: 22,
  },
  nextBtn: {
    backgroundColor: "#00C896",
    borderRadius: 14,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  nextBtnText: {
    color: "#0F1117",
    fontSize: 16,
    fontWeight: "bold",
  },
});
