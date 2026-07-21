import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMeStats, type MeStats } from '@/api/endpoints';
import TrendChart from '@/components/TrendChart';
import { Card, ErrorBanner, Loading, Screen, Subtitle, Title } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: color ?? colors.text, fontSize: 16, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<MeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await getMeStats());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!stats && !error) return <Loading />;

  const successRate =
    stats && stats.today.total > 0
      ? Math.round((stats.today.verified / stats.today.total) * 100)
      : null;

  const diff = stats ? stats.today.total - stats.yesterday.total : 0;

  return (
    <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <View style={{ marginBottom: spacing.xl }}>
          <Title>My progress</Title>
          <Subtitle>Your own verification activity over the last 7 days.</Subtitle>
        </View>

        {error && (
          <View style={{ marginBottom: spacing.lg }}>
            <ErrorBanner message={error} />
          </View>
        )}

        {stats && (
          <>
            <Card>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                  marginBottom: spacing.lg,
                }}
              >
                LAST 7 DAYS
              </Text>
              <TrendChart data={stats.trend} />
            </Card>

            <Card style={{ marginTop: spacing.lg }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                  marginBottom: spacing.sm,
                }}
              >
                TODAY
              </Text>
              <Row label="Receipts checked" value={String(stats.today.total)} />
              <Row label="Verified" value={String(stats.today.verified)} color={colors.green} />
              <Row label="Issues found" value={String(stats.today.issues)} color={colors.red} />
              <Row
                label="Value verified"
                value={`${Math.round(stats.today.valueVerified).toLocaleString()} ETB`}
              />
              {successRate !== null && <Row label="Success rate" value={`${successRate}%`} />}
              <Row
                label="vs. yesterday"
                value={
                  diff === 0
                    ? 'Same'
                    : diff > 0
                      ? `+${diff} more`
                      : `${Math.abs(diff)} fewer`
                }
                color={diff >= 0 ? colors.green : colors.textSecondary}
              />
            </Card>

            <Card style={{ marginTop: spacing.lg }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                  marginBottom: spacing.sm,
                }}
              >
                MY DECISIONS (7 DAYS)
              </Text>
              <Row label="Accepted" value={String(stats.decisions.accepted)} color={colors.green} />
              <Row label="Rejected" value={String(stats.decisions.rejected)} color={colors.red} />
              <Row
                label="Escalated"
                value={String(stats.decisions.escalated)}
                color={colors.yellow}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
