import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Subtitle, Title } from '@/components/ui';
import { spacing } from '@/theme';

// Phase 3: paginated list of my verifications with result badges + filters.
export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen style={{ paddingTop: insets.top + spacing.md }}>
      <View style={{ marginBottom: spacing.xl }}>
        <Title>History</Title>
        <Subtitle>Your past verifications arrive in Phase 3.</Subtitle>
      </View>
    </Screen>
  );
}
