import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors } from '../../theme';

/**
 * Home's signature backdrop. Two very low-opacity blooms bleeding off the top
 * corners, sitting behind everything and scrolling with nothing.
 *
 * Deliberately not a pattern, a mesh or a grid: Home already carries a
 * gradient hero card, a wallet card, a chart and a ring, and anything with
 * visible structure would compete with them. This reads as a light source
 * above the hero rather than as decoration — the intent is that you would
 * not point at it, but the screen stops feeling like cards floating on a
 * flat fill.
 *
 * Home-only on purpose. It is what makes this screen recognisably itself
 * rather than the same card layout every other screen uses.
 */
export function HomeBackdrop() {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);
  const isDark = theme === 'dark';

  // Dark surfaces swallow a wash, so the blooms carry slightly more there.
  const primaryOpacity = isDark ? 0.16 : 0.09;
  const accentOpacity = isDark ? 0.1 : 0.06;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          styles.bloomLeft,
          { backgroundColor: colors.heroGradientFrom, opacity: primaryOpacity },
        ]}
      />
      <View
        style={[
          styles.bloomRight,
          { backgroundColor: colors.accent, opacity: accentOpacity },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bloomLeft: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    top: -190,
    left: -120,
  },
  bloomRight: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -130,
    right: -110,
  },
});
