/**
 * OTA Update Checker — Checks for and applies Expo OTA updates.
 *
 * Call checkForUpdates() on app launch (after splash screen).
 * Uses expo-updates to download + apply JS bundles without APK rebuild.
 */

import * as Updates from 'expo-updates';
import { Alert, Platform } from 'react-native';
import createLogger from '../utils/logger';

const log = createLogger('UpdateService');

/**
 * Check for OTA updates and prompt user to restart if available.
 * Safe to call on every app launch — does nothing if no update exists.
 */
export async function checkForUpdates(): Promise<void> {
  // Skip in dev mode or when updates aren't enabled
  if (__DEV__) {
    log.info('Skipping update check in dev mode');
    return;
  }

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      log.info('Update available, downloading...');

      await Updates.fetchUpdateAsync();

      log.info('Update downloaded, prompting restart...');

      Alert.alert(
        'Update Available',
        'A new version has been downloaded. Restart now to apply?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart',
            style: 'default',
            onPress: () => {
              Updates.reloadAsync();
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      log.info('App is up to date');
    }
  } catch (error: any) {
    // OTA check must NEVER crash the app
    log.error('Update check failed:', error?.message);
  }
}

/**
 * Get current update info for display in settings/about screens.
 */
export function getUpdateInfo() {
  if (__DEV__) {
    return { channel: 'development', updateId: 'dev' };
  }

  return {
    channel: Updates.channel || 'default',
    updateId: Updates.updateId || 'embedded',
    createdAt: Updates.createdAt?.toISOString() || 'N/A',
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };
}
