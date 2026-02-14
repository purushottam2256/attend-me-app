/**
 * MRCE Attend-Me App
 * Main entry point
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation';
import { NetworkProvider, ThemeProvider, OfflineSyncProvider, AuthProvider } from './src/contexts';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { OfflineBanner } from './src/components/ui/OfflineBanner';
import ErrorBoundary from './src/components/ErrorBoundary';

import { initOffline } from './src/services/offline';
import createLogger from './src/utils/logger';

const log = createLogger('App');

export default function App() {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Initialize offline service (database, migration)
    // Block rendering until ready to ensure migration completes before UI reads data
    initOffline()
      .then(() => log.info("Offline service ready"))
      .catch(err => log.error("Failed to init offline service:", err))
      .finally(() => setIsReady(true));
  }, []);

  if (!isReady) {
    return null; // Or return a SplashScreen component here
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <NetworkProvider>
                <OfflineSyncProvider>
                  <NotificationProvider>
                    <StatusBar style="auto" />
                    <OfflineBanner />
                    <RootNavigator />
                  </NotificationProvider>
                </OfflineSyncProvider>
              </NetworkProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
