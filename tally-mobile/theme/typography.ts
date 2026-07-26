import { TextStyle } from 'react-native';

/**
 * The type scale every screen should read sizes/weights from instead of
 * inlining fontSize. Maps the app's 26 previously-scattered fontSize values
 * (9–80) onto 10 named steps. `fontFamily` resolves to Inter once
 * useAppFonts() (see theme/index.ts) has loaded; until then these styles
 * still work, they just render in the OS system font — the splash screen
 * hold in _layout.tsx is what actually prevents that from being seen.
 *
 * numeric/numericLarge set fontVariant: ['tabular-nums'] so digits occupy
 * fixed-width cells — amounts don't visually jitter while animating or
 * updating (e.g. AmountText's count-up).
 */

export const FONT_FAMILY = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// fontWeight is deliberately excluded: these are static per-weight font
// files (Inter_700Bold, not Inter + fontWeight:'bold'), and mixing the two
// causes inconsistent fake-bolding on some platforms. Weight is controlled
// entirely by which fontFamily each style picks.
type TypeStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'fontVariant'
>;

export const typography: Record<
  | 'displayLarge'
  | 'display'
  | 'title'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'numeric'
  | 'numericLarge',
  TypeStyle
> = {
  // Hero amounts — home dashboard's big spend number, amount-entry focal point.
  displayLarge: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
  },
  // Secondary hero moments — budget card totals, group balance headline.
  display: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  // Screen/section titles.
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  // Card titles, list-section headers.
  headline: {
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: 17,
    lineHeight: 22,
  },
  // Default body copy.
  body: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  // Body copy that needs to stand out without jumping a whole scale step.
  bodyStrong: {
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: 15,
    lineHeight: 21,
  },
  // Timestamps, footnotes, helper text under inputs.
  caption: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    lineHeight: 15,
  },
  // Form labels, tab labels, chip text.
  label: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    lineHeight: 17,
  },
  // Inline amounts in list rows (history, group expense lists).
  numeric: {
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  // Prominent-but-not-hero amounts (budget card "spent" figure, stat tiles).
  numericLarge: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
};
