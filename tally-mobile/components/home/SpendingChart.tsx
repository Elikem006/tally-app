import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path, Line, Circle, Defs, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius, easing, reveal } from '../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ChartTimeline = 'day' | 'week' | 'month' | 'year';

interface SpendingChartProps {
  bars: { day: string; spend: number }[];
  sum: number;
  timeline: ChartTimeline;
  onTimelineChange: (timeline: ChartTimeline) => void;
}

const TIMELINE_LABELS: Record<ChartTimeline, string> = { day: 'D', week: 'W', month: 'M', year: 'Y' };

/**
 * Spending activity card — cosine-smoothed line with a day/week/month/year
 * switcher.
 *
 * The curve is one SVG path. It was previously ~240 absolutely-positioned,
 * rotated Views (12 per segment), which is the implementation the report
 * screen was moved off last round; Home kept the older one despite being the
 * screen that renders first and most often. The interpolation is unchanged —
 * same cosine easing between points — only how it is drawn.
 *
 * Deliberately not scrubbable: the report screen owns that interaction. Home
 * is the glanceable read, the report is the one you interrogate.
 */
export function SpendingChart({ bars, sum, timeline, onTimelineChange }: SpendingChartProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 88;
  const chartHeight = 140;
  const paddingVertical = 25;
  const chartInset = 16;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpendVal = Math.max(...bars.map((b) => b.spend), 0);

  const { points, curvePath, curveLength, areaPath } = useMemo(() => {
    const pts = bars.map((bar, idx) => {
      const x = bars.length > 1 ? chartInset + (plotWidth / (bars.length - 1)) * idx : chartInset + plotWidth / 2;
      const y = maxSpendVal > 0 ? chartHeight - (paddingVertical + (bar.spend / maxSpendVal) * plotHeight) : chartHeight / 2;
      return { x, y, ...bar };
    });

    if (pts.length === 0) return { points: pts, curvePath: '', curveLength: 0, areaPath: '' };

    const steps = 12;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    let length = 0;
    let prevX = pts[0].x;
    let prevY = pts[0].y;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        const mu = (1 - Math.cos(t * Math.PI)) / 2;
        const x = p1.x + t * (p2.x - p1.x);
        const y = p1.y + mu * (p2.y - p1.y);
        d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        length += Math.hypot(x - prevX, y - prevY);
        prevX = x;
        prevY = y;
      }
    }

    const area = `${d} L ${pts[pts.length - 1].x} ${chartHeight - paddingVertical} L ${pts[0].x} ${chartHeight - paddingVertical} Z`;
    return { points: pts, curvePath: d, curveLength: length, areaPath: area };
  }, [bars, plotWidth, plotHeight, maxSpendVal, chartInset, chartHeight, paddingVertical]);

  // Draws itself in on the screen's secondary beat, so the card arrives and
  // then the line is drawn rather than the whole thing appearing finished.
  const draw = useSharedValue(0);

  useEffect(() => {
    draw.value = 0;
    draw.value = withDelay(reveal.secondary, withTiming(1, { duration: 700, easing: easing.decelerate }));
  }, [timeline, bars.length, maxSpendVal]);

  const drawProps = useAnimatedProps(() => ({
    strokeDashoffset: curveLength * (1 - draw.value),
  }));

  const fadeUpProps = useAnimatedProps(() => ({
    opacity: Math.max(0, draw.value * 1.6 - 0.6),
  }));

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.label, { color: colors.textSecondary }]}>Spending Activity</Text>
          <Text style={[typography.headline, { color: colors.text, marginTop: 2 }]}>
            GHS {sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        <View style={[styles.timelineFilter, { backgroundColor: colors.neutralBg, borderColor: colors.border }]}>
          {(['day', 'week', 'month', 'year'] as const).map((filter) => {
            const isActive = timeline === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.timelineBtn, isActive && { backgroundColor: colors.surfaceElevated }]}
                onPress={() => onTimelineChange(filter)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`View by ${filter}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[typography.label, { color: isActive ? colors.text : colors.textSecondary }]}>
                  {TIMELINE_LABELS[filter]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.chartContainer}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <SvgGradient id="homeSpendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.26} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
            </SvgGradient>
          </Defs>

          {[paddingVertical, chartHeight / 2, chartHeight - paddingVertical].map((y, i) => (
            <Line key={`grid-${i}`} x1={0} y1={y} x2={chartWidth} y2={y} stroke={colors.borderSubtle} strokeWidth={1} />
          ))}

          {!!areaPath && <AnimatedPath d={areaPath} fill="url(#homeSpendFill)" animatedProps={fadeUpProps} />}

          {!!curvePath && (
            <AnimatedPath
              d={curvePath}
              stroke={colors.primary}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={curveLength}
              animatedProps={drawProps}
            />
          )}

          {points.map((point, idx) => (
            <AnimatedCircle
              key={`dot-${idx}`}
              cx={point.x}
              cy={point.y}
              r={5}
              fill={colors.primary}
              stroke={colors.surfaceElevated}
              strokeWidth={2.5}
              animatedProps={fadeUpProps}
            />
          ))}
        </Svg>
      </View>

      <View style={styles.daysContainer}>
        {points.map((point, idx) => (
          <View key={`label-${idx}`} style={[styles.dayCol, { left: point.x - 20 }]}>
            <Text style={[typography.label, { color: colors.textSecondary }]}>{point.day}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  timelineFilter: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
  },
  timelineBtn: {
    width: 28,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartContainer: {
    height: 140,
    position: 'relative',
    marginTop: spacing.xs,
  },
  daysContainer: {
    position: 'relative',
    height: 20,
    marginTop: spacing.sm,
  },
  dayCol: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
});
