// Tamagui's LinearGradient draws with expo-linear-gradient on iOS; this registers it (must run first).
import '@tamagui/native/setup-expo-linear-gradient';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TamaguiProvider } from 'tamagui';
import config from '../tamagui.config.ts';
import { useSheetOptions } from '../lib/navigation.tsx';
import { SessionProvider, useSession } from '../lib/session.tsx';
import { useColors } from '../lib/theme.ts';
import { ToastProvider } from '../lib/toast.tsx';

export { ErrorBoundary } from 'expo-router';

// Keep the splash screen up until we know whether there's a saved key.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <TamaguiProvider config={config} defaultTheme={scheme === 'dark' ? 'dark' : 'light'}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SessionProvider>
          <ToastProvider>
            <Navigation />
          </ToastProvider>
        </SessionProvider>
      </GestureHandlerRootView>
    </TamaguiProvider>
  );
}

function Navigation() {
  const { status } = useSession();
  const scheme = useColorScheme();
  const c = useColors();
  const sheet = useSheetOptions();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);
  if (status === 'loading') return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: c.accent, background: c.background, card: c.surface, border: c.separator } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={status === 'in'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="meal" options={sheet} />
          <Stack.Screen name="workout" options={sheet} />
          <Stack.Screen name="weight" options={sheet} />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'out'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
