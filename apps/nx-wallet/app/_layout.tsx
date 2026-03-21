import '@/polyfills'; // MUST BE FIRST
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { nexoidService } from '@/services/NexoidService';
import { SecureStorage } from '@/services/SecureStorage';
import { wdkService } from '@/services/WDKService';
import { balanceService } from '@/services/BalanceService';
import { WebSocketProvider, useWebSocket } from '@/context/WebSocketContext';
import { ChatNotificationBanner } from '@/components/ChatNotificationBanner';
import { messagingService } from '@/services/MessagingService';
import { authService } from '@/services/AuthService';
import { StatusBar } from 'expo-status-bar';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  const [isWdkReady, setIsWdkReady] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    async function init() {
        if (loaded) {
           try {
             // 1. Check for existing seed phrase
             let seed = await SecureStorage.getSeedPhrase();
             
             // 2. Initialize WDK (will generate seed if null passed, but we want to control saving)
             const usedSeed = await wdkService.initialize(seed || undefined);
             
             // 3. If we didn't have a seed before, save the new one
             if (!seed && usedSeed) {
                 await SecureStorage.saveSeedPhrase(usedSeed);
                 console.log('New wallet generated and saved');
             }

             // 4. Get user address
             const userAddress = await wdkService.getAddress('ethereum');

             // 5. Authenticate (demo stub)
             try {
               const storedSafeAddress = await SecureStorage.getSafeAddress();
               await authService.authenticate(userAddress, storedSafeAddress || undefined);
             } catch (authErr) {
               console.warn('Auth failed, continuing:', authErr);
             }

             // 6. Initialize NexoidService with stored Safe address (if available)
             const safeAddress = await SecureStorage.getSafeAddress();

             if (safeAddress) {
               nexoidService.initialize(safeAddress).then(() => {
                 console.log('Nexoid service initialized with Safe:', safeAddress);
                 balanceService.refreshBalance(safeAddress);
               }).catch(e => {
                 console.error('Failed to initialize Nexoid service:', e);
               });
             } else {
               console.log('No Safe address configured. Safe wallet features will be unavailable.');
               try {
                 balanceService.refreshBalance(userAddress);
               } catch(e) { /* ignore */ }
             }

             setIsWdkReady(true);
           } catch (e) {
               console.error('Failed to initialize WDK:', e);
               setInitializationError(e as Error);
           } finally {
               SplashScreen.hideAsync();
           }
        }
    }
    
    init();
  }, [loaded]);

  // Only wait for fonts to load. 
  // WDK/Safe initialization happens in background to allow offline/cached usage.
  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <WebSocketProvider>
          <RootLayoutNav />
        </WebSocketProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const webSocket = useWebSocket();
  const hasInitializedMessaging = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tryInitialize = () => {
      if (cancelled || hasInitializedMessaging.current) return;
      const authAddress = authService.getAddress();
      const address = authAddress || nexoidService.getSafeAddress();
      if (address) {
        hasInitializedMessaging.current = true;
        messagingService.initialize(address);
        return;
      }
      setTimeout(tryInitialize, 500);
    };

    tryInitialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagingService.attachWebSocket(webSocket);
    return () => {
      messagingService.detachWebSocket();
    };
  }, [webSocket]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} translucent />
      <ChatNotificationBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="robot/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="credential/[id]" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
