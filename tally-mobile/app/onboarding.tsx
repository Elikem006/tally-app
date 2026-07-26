import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { safeStorage } from '../services/storage';
import { useTheme } from '../hooks/useTheme';
import {
  getExtendedColors,
  getCategoryColor,
  typography,
  spacing,
  radius,
  duration,
  easing,
  staggerDelay,
} from '../theme';
import { Button, BrandMark, BrandLockup, EmptyBudgetsArt, EmptyGroupsArt, getCategoryIconName } from '../components/ui';

const ONBOARDING_KEY = 'tallyOnboardingComplete';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** How long the brand lockup holds before the first step takes over. */
const COLD_OPEN_MS = 1750;

const STEPS = [
  {
    title: 'Every cedi accounted for',
    body: 'Track what you spend, split what you share, and always know where you stand.',
  },
  {
    title: 'Track every cedi',
    body: 'Add expenses instantly, set budgets and see exactly where your money goes.',
  },
  {
    title: 'Split fairly with friends',
    body: 'Create groups, add shared expenses and settle up — even with MTN MoMo.',
  },
];

const CATEGORY_PREVIEW = ['Food', 'Transport', 'Entertainment', 'Utilities'];

export default function OnboardingScreen() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  // Step 0 is the cold open — the brand lockup drawing itself on.
  const [currentStep, setCurrentStep] = useState(0);

  const slideProgress = useSharedValue(0);
  const coldOpenOut = useSharedValue(1);

  const GROUP_PREVIEW = [
    { name: 'Elikem', label: 'is owed', amount: '+GHS 60', color: colors.positive },
    { name: 'Joseph', label: 'owes', amount: '-GHS 30', color: colors.negative },
    { name: 'Ishmael', label: 'owes', amount: '-GHS 30', color: colors.negative },
  ];

  // Hold the lockup, then hand over to step 1. Skipping mid-open jumps
  // straight to the app, so an impatient tap is never blocked by the intro.
  useEffect(() => {
    const t = setTimeout(() => {
      coldOpenOut.value = withTiming(0, { duration: duration.base, easing: easing.accelerate });
      setTimeout(() => setCurrentStep(1), duration.base);
    }, COLD_OPEN_MS);
    return () => clearTimeout(t);
  }, []);

  // Slide the content in from the right on every step change
  useEffect(() => {
    if (currentStep === 0) return;
    slideProgress.value = 0;
    slideProgress.value = withTiming(1, { duration: duration.slow, easing: easing.decelerate });
  }, [currentStep]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: slideProgress.value,
    transform: [{ translateX: (1 - slideProgress.value) * SCREEN_WIDTH * 0.25 }],
  }));

  const coldOpenStyle = useAnimatedStyle(() => ({
    opacity: coldOpenOut.value,
    transform: [{ scale: 0.96 + coldOpenOut.value * 0.04 }],
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

  // ── Cold open ─────────────────────────────────────────────────────────────
  if (currentStep === 0) {
    return (
      <View style={[styles.container, styles.coldOpen, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={finish}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
        >
          <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
        <Animated.View style={coldOpenStyle}>
          <BrandLockup size={132} animate />
        </Animated.View>
      </View>
    );
  }

  const step = STEPS[currentStep - 1];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={finish}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
      >
        <Text style={[typography.bodyStrong, { color: colors.textSecondary }]}>Skip</Text>
      </TouchableOpacity>

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.artWrap}>
          {currentStep === 1 && <BrandMark size={128} />}
          {currentStep === 2 && <EmptyBudgetsArt size={148} />}
          {currentStep === 3 && <EmptyGroupsArt size={148} />}
        </View>

        <Text style={[typography.display, { color: colors.text, textAlign: 'center', marginBottom: spacing.md }]} accessibilityRole="header">
          {step.title}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.sm }]}>
          {step.body}
        </Text>

        {currentStep === 2 && (
          <View style={styles.previewRow}>
            {CATEGORY_PREVIEW.map((cat, idx) => {
              const catColor = getCategoryColor(cat);
              return (
                <Animated.View
                  key={cat}
                  entering={FadeIn.duration(duration.base).delay(staggerDelay(idx, 70))}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: `${catColor}1A`, borderColor: `${catColor}40` },
                  ]}
                >
                  <MaterialCommunityIcons name={getCategoryIconName(cat)} size={15} color={catColor} />
                  <Text style={[typography.labelStrong, { color: colors.text }]}>{cat}</Text>
                </Animated.View>
              );
            })}
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
  coldOpen: { alignItems: 'center', justifyContent: 'center' },
  artWrap: {
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
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
