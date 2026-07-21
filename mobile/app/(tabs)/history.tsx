import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHistory, type HistoryItem } from '@/api/endpoints';
import { PROVIDER_SHORT_LABELS } from '@/lib/receipt';
import { Card, ErrorBanner, Screen, Subtitle, Title } from '@/components/ui';
import { radius, resultColor, spacing, useTheme } from '@/theme';

const PAGE_SIZE = 20;

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View
      style={{
        backgroundColor: `${color}22`,
        borderColor: color,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const { colors } = useTheme();
  const accent = resultColor(colors, item.resultLevel);
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
          {item.referenceMasked}
        </Text>
        <Badge text={item.resultLevel} color={accent} />
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs }}>
        {PROVIDER_SHORT_LABELS[item.provider]}
        {item.payerName ? ` · ${item.payerName}` : ''}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: spacing.sm,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
          {item.verifiedAmount !== null
            ? `${item.verifiedAmount.toLocaleString()} ETB`
            : '—'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          {item.isDuplicate && <Badge text="DUPLICATE" color={colors.red} />}
          {item.decision && (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.decision}</Text>
          )}
        </View>
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>
        {new Date(item.createdAt).toLocaleString()}
      </Text>
    </Card>
  );
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    try {
      const data = await getHistory(nextPage, PAGE_SIZE);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setPage(data.page);
      setTotalPages(data.totalPages);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, false);
    }, [loadPage]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadPage(1, false);
    setRefreshing(false);
  }

  async function onEndReached() {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadPage(page + 1, true);
    setLoadingMore(false);
  }

  return (
    <Screen style={{ paddingTop: insets.top + spacing.md, padding: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
        <Title>History</Title>
        <Subtitle>Receipts you have verified.</Subtitle>
      </View>

      {error && (
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <ErrorBanner message={error} />
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryRow item={item} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          error ? null : (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
                No verifications yet. Receipts you check will appear here.
              </Text>
            </Card>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
      />
    </Screen>
  );
}
