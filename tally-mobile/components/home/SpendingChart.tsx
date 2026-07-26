import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getExtendedColors, typography, spacing, radius } from '../../theme';

export type ChartTimeline = 'day' | 'week' | 'month' | 'year';

interface SpendingChartProps {
  bars: { day: string; spend: number }[];
  sum: number;
  timeline: ChartTimeline;
  onTimelineChange: (timeline: ChartTimeline) => void;
}

const TIMELINE_LABELS: Record<ChartTimeline, string> = { day: 'D', week: 'W', month: 'M', year: 'Y' };

function getLineStyle(x1: number, y1: number, x2: number, y2: number, lineColor: string) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  return {
    position: 'absolute' as const,
    left: x1,
    top: y1,
    width: distance + 0.6,
    height: 3,
    backgroundColor: lineColor,
    transform: [{ rotate: `${angle}rad` }] as any,
    transformOrigin: ['0%', '50%', 0] as any,
  };
}

/** Spending activity card — cosine-smoothed line chart with a day/week/month/year switcher. */
export function SpendingChart({ bars, sum, timeline, onTimelineChange }: SpendingChartProps) {
  const { theme, colors: baseColors } = useTheme();
  const colors = getExtendedColors(theme, baseColors);

  const { width: screenWidth } = Dimensions.get('window');
  const chartWidth = screenWidth - 88;
  const chartHeight = 140;
  const paddingVertical = 25;
  const chartInset = 16;
  const plotWidth = chartWidth - 2 * chartInset;
  const plotHeight = chartHeight - 2 * paddingVertical;
  const maxSpendVal = Math.max(...bars.map((b) => b.spend), 0);

  const points = bars.map((bar, idx) => {
    const x = bars.length > 1 ? chartInset + (plotWidth / (bars.length - 1)) * idx : chartInset + plotWidth / 2;
    const y = maxSpendVal > 0 ? chartHeight - (paddingVertical + (bar.spend / maxSpendVal) * plotHeight) : chartHeight / 2;
    return { x, y, ...bar };
  });

  const curveSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const steps = 12;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    for (let j = 0; j < steps; j++) {
      const t1 = j / steps;
      const t2 = (j + 1) / steps;
      const mu1 = (1 - Math.cos(t1 * Math.PI)) / 2;
      const mu2 = (1 - Math.cos(t2 * Math.PI)) / 2;
      const x1 = p1.x + t1 * (p2.x - p1.x);
      const x2 = p1.x + t2 * (p2.x - p1.x);
      const y1 = p1.y + mu1 * (p2.y - p1.y);
      const y2 = p1.y + mu2 * (p2.y - p1.y);
      curveSegments.push({ x1, y1, x2, y2 });
    }
  }

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
        <View style={[styles.gridLine, { top: paddingVertical, backgroundColor: colors.borderSubtle }]} />
        <View style={[styles.gridLine, { top: chartHeight / 2, backgroundColor: colors.borderSubtle }]} />
        <View style={[styles.gridLine, { top: chartHeight - paddingVertical, backgroundColor: colors.borderSubtle }]} />

        {curveSegments.map((seg, idx) => (
          <View key={`line-${idx}`} style={getLineStyle(seg.x1, seg.y1, seg.x2, seg.y2, colors.primary)} />
        ))}

        {points.map((point, idx) => (
          <View
            key={`dot-${idx}`}
            style={[
              styles.chartDot,
              {
                left: point.x - 6,
                top: point.y - 6,
                backgroundColor: colors.primary,
                borderColor: colors.surfaceElevated,
                shadowColor: colors.primary,
              },
            ]}
          />
        ))}
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
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  chartDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 3,
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
