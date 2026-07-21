import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Input, Label, Screen, Subtitle } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // Navigation is handled by AuthGate once state updates
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
            <Text style={{ color: colors.accent, fontSize: 34, fontWeight: '800' }}>
              ReceiptGuard
            </Text>
            <Subtitle>Sign in with the account your manager created for you.</Subtitle>
          </View>

          {error && (
            <View style={{ marginBottom: spacing.lg }}>
              <ErrorBanner message={error} />
            </View>
          )}

          <View style={{ marginBottom: spacing.lg }}>
            <Label>Email</Label>
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@business.et"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!loading}
            />
          </View>

          <View style={{ marginBottom: spacing.xl }}>
            <Label>Password</Label>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              textContentType="password"
              editable={!loading}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </View>

          <Button title="Sign in" onPress={submit} loading={loading} />

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              textAlign: 'center',
              marginTop: spacing.xl,
            }}
          >
            Forgot your password? Ask your manager to reset it for you.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
