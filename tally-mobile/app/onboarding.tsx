import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { safeStorage } from '../services/storage';
import { useTheme } from '../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, duration, easing } from '../theme';
import { Button } from '../components/ui';

const ONBOARDING_KEY = 'tallyOnboardingComplete';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS = [
  {
    emoji: '💰',
    title: 'Welcome to Tally! 👋',
    body: 'Your personal finance companion for tracking expenses and splitting costs with friends',
  },
  {
    emoji: '📊',
    title: 'Track Every Cedi',
    body: 'Add expenses instantly, set budgets and see where your money goes with beautiful charts',
  },
  {
    emoji: '👥',
    title: 'Split Fairly with Friends',
    body: 'Create groups, add shared expenses and settle up — even with MTN MoMo payments',
  },
];

const CATEGORY_PREVIEW = ['🍔 Food', '🚗 Transport', '🎮 Fun', '💡 Utilities'];

export default function OnboardingScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const [currentStep, setCurrentStep] = useState(1); // 1-3

  const slideProgress = useSharedValue(0);
  const floatY = useSharedValue(0);

  const GROUP_PREVIEW = [
    { name: 'Elikem', label: 'is owed', amount: '+GHS 60', color: colors.positive },
    { name: 'Joseph', label: 'owes', amount: '-GHS 30', color: colors.negative },
    { name: 'Ishmael', label: 'owes', amount: '-GHS 30', color: colors.negative },
  ];

  // Slide the content in from the right on every step change
  useEffect(() => {
    slideProgress.value = 0;
    slideProgress.value = withTiming(1, { duration: duration.slow, easing: easing.decelerate });
  }, [currentStep]);

  // Gentle floating loop for the hero emoji
  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 1400, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
        withTiming(0, { duration: 1400, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
      ),
      -1,
      false,
    );
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: slideProgress.value,
    transform: [{ translateX: (1 - slideProgress.value) * SCREEN_WIDTH * 0.25 }],
  }));

  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  async function finish() {
    try {
      await safeStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Non-critical — worst case they see onboarding once more
    }
    router.replace('/(tabs)');
  }

  function next() {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
    else finish();
  }

  const step = STEPS[currentStep - 1];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.skipBtn} onPress={finish} activeOpacity={0.7}>
        <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>Skip</Text>
      </TouchableOpacity>

      <Animated.View style={[styles.content, contentStyle]}>
        <Animated.Text style={[styles.heroEmoji, emojiStyle]}>{step.emoji}</Animated.Text>
        <Text style={[typography.display, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]} accessibilityRole="header">
          {step.title}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.sm }]}>
          {step.body}
        </Text>

        {currentStep === 2 && (
          <View style={styles.previewRow}>
            {CATEGORY_PREVIEW.map((cat) => (
              <View
                key={cat}
                style={[
                  styles.categoryChip,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.primarySubtle },
                ]}
              >
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{cat}</Text>
              </View>
            ))}
          </View>
        )}

        {currentStep === 3 && (
          <View
            style={[
              styles.groupPreview,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
            ]}
          >
            {GROUP_PREVIEW.map((m) => (
              <View key={m.name} style={styles.groupRow}>
                <View style={[styles.groupAvatar, { backgroundColor: colors.primarySubtle }]}>
                  <Text style={[typography.bodyStrong, { color: colors.primary }]}>{m.name.charAt(0)}</Text>
                </View>
                <Text style={[typography.bodyStrong, { color: colors.text, flex: 1 }]}>{m.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{m.label}</Text>
                <Text style={[typography.bodyStrong, { color: m.color }]}>{m.amount}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.dot,
                { backgroundColor: colors.borderSubtle },
                s === currentStep && { backgroundColor: colors.primary, width: 22 },
              ]}
            />
          ))}
        </View>

        <Button title={currentStep === 3 ? 'Get Started →' : 'Next →'} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 80,
    marginBottom: spacing.xl,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  groupPreview: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingBottom: 48,
    gap: spacing.xl,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
