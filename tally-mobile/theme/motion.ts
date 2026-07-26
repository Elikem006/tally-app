import { Easing, EasingFunction, EasingFunctionFactory } from 'react-native-reanimated';

/** Durations in ms. Everything in this app's motion is 150–350ms. */
export const duration = {
  fast: 150,
  base: 250,
  slow: 350,
} as const;

/** Shared easing curves — ease-out everywhere; nothing bouncy, nothing linear. */
export const easing: Record<'standard' | 'decelerate' | 'accelerate', EasingFunction | EasingFunctionFactory> = {
  // General-purpose ease-out — press states, fades, most transitions.
  standard: Easing.out(Easing.cubic),
  // Entrances (list stagger, screen transitions in) — starts fast, settles gently.
  decelerate: Easing.bezier(0.16, 1, 0.3, 1),
  // Exits (dismissing a sheet, item leaving a list) — starts gentle, leaves fast.
  accelerate: Easing.bezier(0.7, 0, 0.84, 0),
};

/** Standard press-state scale for every pressable in the app. */
export const pressScale = 0.97;

/**
 * Per-item entrance delay for staggered lists — 40ms apart, capped after the
 * 8th item. Long lists (History can run 50+ rows) never make the user wait
 * out a growing trickle: everything past item 8 shares item 8's delay
 * instead of index * step growing without bound.
 */
export function staggerDelay(index: number, step = 40, cap = 7): number {
  return Math.min(index, cap) * step;
}
