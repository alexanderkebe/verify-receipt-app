import { Text, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';

export interface TrendPoint {
  date: string;
  total: number;
  verified: number;
  failed: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Seven-day bar chart drawn with plain views — a charting library would be
 * the single heaviest dependency in the app for one screen.
 * Each bar stacks verified (green) under the remainder (muted).
 */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.total));
  const CHART_HEIGHT = 140;

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: CHART_HEIGHT,
          gap: spacing.sm,
        }}
      >
        {data.map((point) => {
          const totalHeight = Math.max(2, (point.total / max) * CHART_HEIGHT);
          const verifiedHeight = point.total
            ? (point.verified / point.total) * totalHeight
            : 0;
          return (
            <View key={point.date} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 2 }}>
                {point.total || ''}
              </Text>
              <View
                style={{
                  width: '100%',
                  height: totalHeight,
                  backgroundColor: colors.bgTertiary,
                  borderRadius: radius.sm,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                }}
              >
                <View style={{ height: verifiedHeight, backgroundColor: colors.green }} />
              </View>
            </View>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: spacing.sm,
          marginTop: spacing.sm,
        }}
      >
        {data.map((point) => (
          <Text
            key={point.date}
            style={{ flex: 1, color: colors.textMuted, fontSize: 11, textAlign: 'center' }}
          >
            {DAY_LABELS[new Date(`${point.date}T00:00:00Z`).getUTCDay()]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
        <Legend color={colors.green} label="Verified" />
        <Legend color={colors.bgTertiary} label="Other outcomes" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
