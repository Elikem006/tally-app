import { ThemeColors, ThemeType } from '../hooks/useTheme';

/**
 * Extends (never replaces) hooks/useTheme.tsx's ThemeColors. Every key that
 * already exists there (cardBg, text, primary, …) keeps its name and meaning
 * exactly as-is — screens depending on the old shape don't break. This file
 * only adds the semantic tokens screens are currently hardcoding instead.
 */
export interface ExtendedThemeColors extends ThemeColors {
  /** One step up from `background` — the base surface most cards sit on. */
  surface: string;
  /** A visibly raised surface (cards floating on top of `surface`). */
  surfaceElevated: string;
  /** The most raised surface — modals, sheets, the thing on top of everything. */
  surfaceHigh: string;
  /** A quieter border than `border` — dividers that shouldn't compete for attention. */
  borderSubtle: string;
  /** A third text tier below `text` / `textSecondary` — timestamps, footnotes. */
  textTertiary: string;
  /** Modal/sheet scrim color. */
  overlay: string;
  /** Primary at low opacity — selected-chip fills, subtle highlight backgrounds. */
  primarySubtle: string;
  /** Accent at low opacity — the amber equivalent of primarySubtle. */
  accentSubtle: string;
  /** Budget "near limit" state — distinct from `negative` (over budget) and `accent` (brand amber). */
  warning: string;
  /** Warning at low opacity, for warning-state chip/card fills. */
  warningSubtle: string;
  /** Text/icon color that sits legibly on a `primary` fill (filled buttons, selected chips). */
  onPrimary: string;
  /** Feature-card gradient, brand-violet family. Start color. */
  heroGradientFrom: string;
  /** Feature-card gradient, brand-violet family. End color. */
  heroGradientTo: string;
  /** Primary text on the hero gradient. */
  onHero: string;
  /** Secondary/label text on the hero gradient. */
  onHeroDim: string;
  /** Chip fill sitting on top of the hero gradient. */
  heroChipBg: string;
}

const lightExtensions: Omit<ExtendedThemeColors, keyof ThemeColors> = {
  surface: '#F2F4F7',
  surfaceElevated: '#FFFFFF',
  surfaceHigh: '#FFFFFF',
  borderSubtle: '#F0F1F4',
  // #9CA3AF here measures ~2.5:1 against white — fails WCAG AA (4.5:1) for
  // the caption/label text this renders (timestamps, footnotes). #6B7280
  // clears ~4.8:1.
  textTertiary: '#6B7280',
  overlay: 'rgba(15, 17, 21, 0.5)',
  primarySubtle: 'rgba(139, 92, 246, 0.12)',
  accentSubtle: 'rgba(245, 158, 11, 0.12)',
  warning: '#F59E0B',
  warningSubtle: 'rgba(245, 158, 11, 0.14)',
  // light `primary` (#8B5CF6) is dark enough that white text clears AA on it.
  onPrimary: '#FFFFFF',
  heroGradientFrom: '#7C3AED',
  heroGradientTo: '#5B21B6',
  onHero: '#FFFFFF',
  // 0.72 measured 3.70:1 against the gradient's lighter end (#7C3AED) — below
  // the 4.5:1 AA minimum, and this token is only ever used on 11–13px text,
  // so the large-text allowance does not apply. 0.88 clears at 4.72:1.
  onHeroDim: 'rgba(255, 255, 255, 0.88)',
  heroChipBg: 'rgba(255, 255, 255, 0.18)',
};

const darkExtensions: Omit<ExtendedThemeColors, keyof ThemeColors> = {
  surface: '#0F1115',
  surfaceElevated: '#181A22',
  surfaceHigh: '#20232D',
  borderSubtle: '#22242D',
  // Lighter than the light-mode value on purpose — #6B7280 only clears
  // ~3.6:1 against this dark surface; #9CA3AF clears ~6.8:1.
  textTertiary: '#9CA3AF',
  overlay: 'rgba(0, 0, 0, 0.72)',
  primarySubtle: 'rgba(167, 139, 250, 0.16)',
  accentSubtle: 'rgba(251, 191, 36, 0.16)',
  warning: '#FBBF24',
  warningSubtle: 'rgba(251, 191, 36, 0.16)',
  // dark `primary` (#A78BFA) is a light violet — white text on it fails AA,
  // so filled controls invert to near-black instead.
  onPrimary: '#1A1523',
  heroGradientFrom: '#5B21B6',
  heroGradientTo: '#2E1065',
  onHero: '#F5F3FF',
  // Same failure in dark: 0.66 measured 4.39:1 against #5B21B6. 0.78 clears
  // at 5.56:1.
  onHeroDim: 'rgba(245, 243, 255, 0.78)',
  heroChipBg: 'rgba(255, 255, 255, 0.12)',
};

export function getExtendedColors(theme: ThemeType, base: ThemeColors): ExtendedThemeColors {
  return { ...base, ...(theme === 'dark' ? darkExtensions : lightExtensions) };
}

// ─── Category colors — one source of truth for every chart, badge, and icon ──
// Fixed hues for the built-ins; anything else (custom categories) gets a
// deterministic pick from the overflow ramp so the same name always renders
// the same color everywhere, with no color ever stored per-category.

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F97066',
  Transport: '#2DD4BF',
  Entertainment: '#A78BFA',
  Utilities: '#F59E0B',
  Other: '#94A3B8',
  Shared: '#8B5CF6',
  Settlement: '#10B981',
};

// Overflow ramp for custom categories — deliberately distinct from the fixed
// hues above so a custom category never visually collides with a built-in one.
const OVERFLOW_RAMP = [
  '#EC4899', '#06B6D4', '#84CC16', '#F472B6',
  '#38BDF8', '#FB923C', '#4ADE80', '#C084FC',
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** The one place in the app that decides what color a category renders as. */
export function getCategoryColor(categoryName: string | null | undefined): string {
  const name = categoryName || 'Other';
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  return OVERFLOW_RAMP[hashString(name) % OVERFLOW_RAMP.length];
}
