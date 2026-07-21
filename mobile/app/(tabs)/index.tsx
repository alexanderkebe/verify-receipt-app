import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { getMeStats, type MeStats } from '@/api/endpoints';
import { Button, Card, ErrorBanner, Screen, Subtitle, Title } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ color: color ?? colors.text, fontSize: 28, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs }}>
        {label}
      </Text>
    </Card>
  );
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  // Refresh whenever the tab regains focus (e.g. after verifying a receipt)
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

  const today = stats?.today;

  return (
    <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <View style={{ marginBottom: spacing.xl }}>
          <Title>Hello, {user?.fullName?.split(' ')[0] ?? 'there'}</Title>
          <Subtitle>{user?.businessName ?? 'Your business'} · today</Subtitle>
        </View>

        {error && (
          <View style={{ marginBottom: spacing.lg }}>
            <ErrorBanner message={error} />
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <StatTile label="Verified today" value={String(today?.verified ?? '—')} color={colors.green} />
          <StatTile label="Issues found" value={String(today?.issues ?? '—')} color={colors.red} />
          <StatTile label="Total checks" value={String(today?.total ?? '—')} />
          <StatTile
            label="Value verified (ETB)"
            value={today ? Math.round(today.valueVerified).toLocaleString() : '—'}
          />
        </View>

        <Button
          title="Verify a receipt"
          onPress={() => router.push('/(tabs)/verify')}
          style={{ marginTop: spacing.xl }}
        />
        <Button
          title="Sign out"
          variant="ghost"
          onPress={signOut}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </Screen>
  );
}
