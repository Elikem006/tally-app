import Svg, { Circle, Path, Rect, Line, G } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';

/**
 * Empty-state line art. Deliberately two-tone — brand `primary` for the
 * subject, `textTertiary` for supporting strokes — so these read as part of
 * the same system as the icon set rather than as clip art, and re-theme
 * automatically. Pure react-native-svg: no asset files, no bundle weight,
 * nothing that needs a custom dev build.
 */

interface IllustrationProps {
  size?: number;
}

/** A receipt with nothing on it — "no expenses yet". */
export function EmptyExpensesArt({ size = 132 }: IllustrationProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Receipt body, torn along the bottom */}
      <Path
        d="M34 20 h48 q5 0 5 5 v72 l-6.5-5 l-6.5 5 l-6.5-5 l-6.5 5 l-6.5-5 l-6.5 5 l-6.5-5 l-6.5 5 V25 q0-5 5-5 z"
        stroke={colors.textTertiary}
        strokeWidth={2.5}
        strokeLinejoin="round"
        fill={colors.surfaceElevated}
      />
      {/* Blank line items */}
      <Line x1={45} y1={40} x2={76} y2={40} stroke={colors.textTertiary} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={45} y1={53} x2={68} y2={53} stroke={colors.textTertiary} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1={45} y1={66} x2={72} y2={66} stroke={colors.textTertiary} strokeWidth={2.5} strokeLinecap="round" />

      {/* Add badge */}
      <Circle cx={86} cy={86} r={17} fill={colors.background} />
      <Circle cx={86} cy={86} r={13.5} fill={colors.primary} />
      <Line x1={86} y1={80} x2={86} y2={92} stroke={colors.onPrimary} strokeWidth={2.75} strokeLinecap="round" />
      <Line x1={80} y1={86} x2={92} y2={86} stroke={colors.onPrimary} strokeWidth={2.75} strokeLinecap="round" />
    </Svg>
  );
}

/** A ring with only a sliver allocated — "no budgets set". */
export function EmptyBudgetsArt({ size = 132 }: IllustrationProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Unallocated remainder */}
      <Circle
        cx={60}
        cy={58}
        r={34}
        stroke={colors.textTertiary}
        strokeWidth={11}
        strokeDasharray="6 9"
        strokeLinecap="round"
        fill="none"
      />
      {/* The one slice that has been set */}
      <Path
        d="M60 24 a34 34 0 0 1 29.4 17"
        stroke={colors.primary}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
      />
      {/* Limit slider underneath */}
      <Line x1={34} y1={104} x2={86} y2={104} stroke={colors.textTertiary} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={50} cy={104} r={6.5} fill={colors.primary} />
    </Svg>
  );
}

/** Three figures, one highlighted — "no groups yet". */
export function EmptyGroupsArt({ size = 132 }: IllustrationProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const side = colors.textTertiary;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Left figure */}
      <G opacity={0.85}>
        <Circle cx={31} cy={54} r={11} stroke={side} strokeWidth={2.5} fill={colors.surfaceElevated} />
        <Path d="M13 84 a18 18 0 0 1 36 0" stroke={side} strokeWidth={2.5} strokeLinecap="round" fill={colors.surfaceElevated} />
      </G>

      {/* Right figure */}
      <G opacity={0.85}>
        <Circle cx={89} cy={54} r={11} stroke={side} strokeWidth={2.5} fill={colors.surfaceElevated} />
        <Path d="M71 84 a18 18 0 0 1 36 0" stroke={side} strokeWidth={2.5} strokeLinecap="round" fill={colors.surfaceElevated} />
      </G>

      {/* Centre figure — in front, in brand color */}
      <Circle cx={60} cy={46} r={14} fill={colors.background} />
      <Circle cx={60} cy={46} r={14} stroke={colors.primary} strokeWidth={3} fill={colors.surfaceElevated} />
      <Path
        d="M37 88 a23 23 0 0 1 46 0"
        stroke={colors.primary}
        strokeWidth={3}
        strokeLinecap="round"
        fill={colors.surfaceElevated}
      />

      {/* Shared-cost spark between them */}
      <Rect x={54} y={98} width={12} height={12} rx={3} transform="rotate(45 60 104)" fill={colors.primary} />
    </Svg>
  );
}
