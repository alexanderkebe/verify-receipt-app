import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { Loading } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Routes the user to the right place as auth state settles:
 * signed out → login, temp password → change password, otherwise → tabs.
 */
function AuthGate() {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'signedOut') {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Signed in but still on a boss-issued temp password
    if (user?.mustChangePassword) {
      if (segments[1] !== 'change-password') router.replace('/(auth)/change-password');
      return;
    }

    if (inAuthGroup) router.replace('/(tabs)');
  }, [status, user?.mustChangePassword, segments, router]);

  if (status === 'loading') return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
