import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import authService from '@/services/auth.service';
import { User } from 'firebase/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // TEMPORARY: Skip auth state check for development
    // TODO: Uncomment the code below when ready to enable authentication
    setLoading(false);
    return;

    /* COMMENTED OUT - Auth state subscription (enable when ready)
    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
    */
  }, []);

  useEffect(() => {
    if (loading) return;

    // TEMPORARY: Bypass auth check for development
    // TODO: Uncomment the code below when ready to enable authentication
    // For now, allow access to all routes without authentication
    return;

    /* COMMENTED OUT - Authentication check (enable when ready)
    const inAuthGroup = segments[0] === '(tabs)';

    if (!user && inAuthGroup) {
      // User is not signed in and trying to access protected route
      router.replace('/login');
    } else if (user && !inAuthGroup) {
      // User is signed in and trying to access login
      router.replace('/(tabs)');
    }
    */
  }, [user, segments, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'card',
            title: 'Profile',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="dashboard"
          options={{
            presentation: 'card',
            title: 'Parent Dashboard',
            headerShown: true,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
