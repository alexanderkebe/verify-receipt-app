import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { changePassword } from '@/api/endpoints';
import { Button, ErrorBanner, Input, Label, Screen, Subtitle, Title } from '@/components/ui';
import { spacing } from '@/theme';

const MIN_LENGTH = 8; // matches AUTH_CONFIG.passwordMinLength on the server

export default function ChangePasswordScreen() {
  const { refreshUser, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (next.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    if (next === current) {
      setError('Choose a password different from your temporary one.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await changePassword(current, next);
      // mustChangePassword flips to false → AuthGate moves us into the app
      await refreshUser();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={{ paddingTop: insets.top + spacing.xl }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: spacing.xxl }}>
            <Title>Set your password</Title>
            <Subtitle>
              You are signed in with a temporary password. Choose your own to continue.
            </Subtitle>
          </View>

          {error && (
            <View style={{ marginBottom: spacing.lg }}>
              <ErrorBanner message={error} />
            </View>
          )}

          <View style={{ marginBottom: spacing.lg }}>
            <Label>Temporary password</Label>
            <Input
              value={current}
              onChangeText={setCurrent}
              placeholder="The password your manager gave you"
              secureTextEntry
              editable={!loading}
            />
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <Label>New password</Label>
            <Input
              value={next}
              onChangeText={setNext}
              placeholder={`At least ${MIN_LENGTH} characters`}
              secureTextEntry
              editable={!loading}
            />
          </View>

          <View style={{ marginBottom: spacing.xl }}>
            <Label>Confirm new password</Label>
            <Input
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Type it again"
              secureTextEntry
              editable={!loading}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          <Button title="Save password" onPress={submit} loading={loading} />
          <Button
            title="Sign out"
            variant="ghost"
            onPress={signOut}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
