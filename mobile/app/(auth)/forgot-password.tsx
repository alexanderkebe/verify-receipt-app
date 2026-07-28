import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requestPasswordReset } from '@/api/password-reset';
import { Button, ErrorBanner, Input, Label, Screen, Subtitle, Title } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to request a reset link. Please try again.',
      );
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
            <Title>Reset your password</Title>
            <Subtitle>
              Enter your account email and we will send you a secure reset link.
            </Subtitle>
          </View>

          {error && (
            <View style={{ marginBottom: spacing.lg }}>
              <ErrorBanner message={error} />
            </View>
          )}

          {message ? (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: `${colors.green}22`,
                borderColor: colors.green,
                borderWidth: 1,
                borderRadius: radius.md,
                padding: spacing.lg,
                marginBottom: spacing.xl,
              }}
            >
              <Text style={{ color: colors.green, fontSize: 14 }}>{message}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm }}>
                Open the link from your email to choose a new password, then return here to sign in.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ marginBottom: spacing.xl }}>
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
                  onSubmitEditing={submit}
                  returnKeyType="send"
                />
              </View>

              <Button title="Send reset link" onPress={submit} loading={loading} />
            </>
          )}

          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => router.replace('/login' as Href)}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
