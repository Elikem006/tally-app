/**
 * 4pt spacing scale. Maps the app's previously-scattered padding/margin/gap
 * values onto 7 named steps.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Radius scale. Covers every *design-token* radius in the audit (the true
 * distinct-value count once you exclude the one-off circular elements —
 * avatar photo circle, decorative background rings in index.tsx/report.tsx —
 * which are `width / 2` constructions, not scale candidates, and stay as
 * inline width/2 at their call sites).
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type SpacingKey = keyof typeof spacing;
export type RadiusKey = keyof typeof radius;
