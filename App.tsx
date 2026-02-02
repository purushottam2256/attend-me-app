/**
 * MRCE Attend-Me App
 * Main entry point
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation';
import { NetworkProvider, ThemeProvider, OfflineSyncProvider, AuthProvider } from './src/contexts';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { OfflineBanner } from './src/components/ui/OfflineBanner';

export default function App() {
  return (
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
  );
}
