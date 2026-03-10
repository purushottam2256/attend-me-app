/**
 * MRCE Attend-Me App
 * Main entry point
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from '@navigation';
import { NetworkProvider, ThemeProvider, OfflineSyncProvider, AuthProvider } from '@contexts';
import { NotificationProvider } from '@contexts/NotificationContext';
import { OfflineBanner } from '@components/ui/OfflineBanner';
import ErrorBoundary from '@components/ErrorBoundary';

import { initOffline } from '@services/offline';
import createLogger from '@utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

const log = createLogger('App');

// Setup Database Connection
const getDb = () => {
    return SQLite.openDatabaseSync('offline_sync.db');
};

export default function App() {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Initialize offline service (database, migration)
    // Block rendering until ready to ensure migration completes before UI reads data
    initOffline()
      .then(async () => {
        log.info("Offline service ready");
        
        // --- Weekly Cleanup of Hidden Items ---
        try {
          const LAST_CLEANUP_KEY = '@attend_me/last_hidden_cleanup';
          const lastCleanupStr = await AsyncStorage.getItem(LAST_CLEANUP_KEY);
          const now = Date.now();
          const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
          
          if (!lastCleanupStr || (now - parseInt(lastCleanupStr, 10)) > ONE_WEEK_MS) {
            log.info("Running weekly hidden items cleanup...");
            const db = getDb();
            await db.execAsync(`DELETE FROM hidden_items;`);
            await AsyncStorage.setItem(LAST_CLEANUP_KEY, now.toString());
            log.info("Hidden items cleanup complete.");
          }
        } catch (cleanupErr) {
          log.error("Failed to run hidden items cleanup:", cleanupErr);
        }
      })
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
