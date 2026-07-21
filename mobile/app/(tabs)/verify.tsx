import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Subtitle, Title } from '@/components/ui';
import { spacing } from '@/theme';

// Phase 2: provider picker → scan / manual / photo → result card → decision.
export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen style={{ paddingTop: insets.top + spacing.md }}>
      <View style={{ marginBottom: spacing.xl }}>
        <Title>Verify receipt</Title>
        <Subtitle>Scanning, manual entry and photo verification arrive in Phase 2.</Subtitle>
      </View>
    </Screen>
  );
}
