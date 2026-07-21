import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Subtitle, Title } from '@/components/ui';
import { spacing } from '@/theme';

// Phase 3: 7-day trend chart, today vs yesterday, decision split.
export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen style={{ paddingTop: insets.top + spacing.md }}>
      <View style={{ marginBottom: spacing.xl }}>
        <Title>My progress</Title>
        <Subtitle>Your 7-day trend and decision breakdown arrive in Phase 3.</Subtitle>
      </View>
    </Screen>
  );
}
