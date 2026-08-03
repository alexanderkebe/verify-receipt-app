import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as NativeSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { Loading } from '@/components/ui';
import AnimatedSplash from '@/components/SplashScreen';
import { useTheme } from '@/theme';
import { createDebug } from '@/lib/debug';

const debug = createDebug('[AUTHGATE]');

// Keep the splash screen visible until auth state is resolved
NativeSplashScreen.preventAutoHideAsync().catch(() => {
  // Silently fail — not critical if this doesn't work
});

/**
 * Routes the user to the right place as auth state settles:
 * signed out → login, temp password → change password, otherwise → tabs.
 * Also hides the splash screen once we know where to navigate.
 */
function AuthGate() {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();
  // In-app animated splash (matches the web splash) shown on every cold start.
  const [showSplash, setShowSplash] = useState(true);

  debug('AuthGate render — status:', status, 'segments:', segments, 'mustChangePassword:', user?.mustChangePassword, 'showSplash:', showSplash);

  // Hand off from the native splash to the animated in-app splash seamlessly
  // (same dark backdrop, same lockup).
  useEffect(() => {
    NativeSplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (status === 'loading') {
      debug('AuthGate effect — status=loading, waiting...');
      return;
    }

    // Hide splash once we know the auth state
    NativeSplashScreen.hideAsync().catch(() => {});

    const path = segments as string[];
    const inAuthGroup = path[0] === '(auth)';

    debug('AuthGate effect — status:', status, 'path:', path, 'inAuthGroup:', inAuthGroup);

    if (status === 'signedOut') {
      if (!inAuthGroup) {
        debug('AuthGate → signedOut, redirecting to /(auth)/login');
        router.replace('/(auth)/login');
      } else {
        debug('AuthGate → signedOut, already in auth group');
      }
      return;
    }

    // Signed in but still on a boss-issued temp password
    if (user?.mustChangePassword) {
      if (path[1] !== 'change-password') {
        debug('AuthGate → mustChangePassword, redirecting to /(auth)/change-password');
        router.replace('/(auth)/change-password');
      } else {
        debug('AuthGate → mustChangePassword, already on change-password screen');
      }
      return;
    }

    if (inAuthGroup) {
      debug('AuthGate → signedIn, no password change needed, redirecting to /(tabs)');
      router.replace('/(tabs)');
    } else if (path.length === 0) {
      // Empty segments means no route mounted yet (e.g. just after login).
      // Redirect to tabs so the initial screen loads.
      debug('AuthGate → signedIn, segments empty, redirecting to /(tabs)');
      router.replace('/(tabs)');
    } else {
      debug('AuthGate → signedIn, already in tabs');
    }
  }, [status, user?.mustChangePassword, segments, router]);

  debug('AuthGate — rendering Stack. loading overlay:', status === 'loading');

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {!showSplash && status === 'loading' && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg, zIndex: 999, alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Loading />
        </View>
      )}

      {showSplash && <AnimatedSplash onDone={() => setShowSplash(false)} />}
    </View>
  );
}

export default function RootLayout() {
  const { isDark } = useTheme();
  debug('RootLayout rendered, isDark:', isDark);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
