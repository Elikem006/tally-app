import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';

/**
 * Home's backdrop: a single soft wash of brand light falling from the top of
 * the screen, behind everything, scrolling with nothing.
 *
 * The first version was two solid-colour Views with a border radius and a low
 * opacity. React Native cannot blur a plain View, so those had hard, crisp
 * edges — clipped by the screen corners they read as two distinct
 * semicircles, which is the opposite of ambient. Reducing the opacity would
 * only have made faint discs; the edge was the problem, not the intensity.
 *
 * A radial gradient fading to fully transparent has no edge by construction,
 * so there is no shape to notice. One wash rather than two blooms, and a
 * single hue drawn from the hero gradient, so it reads as light coming off
 * the hero card rather than as decoration in its own right.
 *
 * Home-only on purpose — it is what makes this screen recognisably itself.
 */

/** How far down the screen the wash reaches before it is fully transparent. */
const GLOW_HEIGHT = 360;

export function HomeBackdrop() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const isDark = theme === 'dark';

  // Peak opacity at the very top only; everything below falls off to nothing.
  // Dark surfaces swallow a wash, so it carries a little more there.
  const peak = isDark ? 0.2 : 0.1;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width="100%" height={GLOW_HEIGHT}>
        <Defs>
          <RadialGradient id="homeGlow" cx="50%" cy="0%" rx="80%" ry="100%">
            <Stop offset="0" stopColor={colors.heroGradientFrom} stopOpacity={peak} />
            <Stop offset="0.55" stopColor={colors.heroGradientFrom} stopOpacity={peak * 0.35} />
            <Stop offset="1" stopColor={colors.heroGradientFrom} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeGlow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
  },
});
