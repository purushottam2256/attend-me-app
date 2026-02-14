/**
 * Background Sync Service
 * 
 * Auto-syncs pending attendance submissions when connectivity returns,
 * even while the app is in the background.
 * 
 * Uses Expo TaskManager + BackgroundFetch for background execution.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { syncPendingSubmissions, getPendingCount } from './offlineService';
import NetInfo from '@react-native-community/netinfo';
import createLogger from '../utils/logger';

const log = createLogger('BackgroundSync');

const BACKGROUND_SYNC_TASK = 'ATTEND_ME_BACKGROUND_SYNC';

// ============================================================================
// TASK DEFINITION (must be at top level, outside of components)
// ============================================================================

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    log.info('Task triggered');

    // Check connectivity first
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      log.info('No connectivity, skipping');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if there are pending submissions
    const pendingCount = await getPendingCount();
    if (pendingCount === 0) {
      log.info('No pending submissions');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Attempt sync
    log.info(`Syncing ${pendingCount} pending submissions...`);
    const result = await syncPendingSubmissions();
    
    if (result.synced > 0) {
      log.info(`Successfully synced ${result.synced} submissions`);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    if (result.failed > 0) {
      log.warn(`${result.failed} submissions failed to sync`);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    log.error('Task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ============================================================================
// REGISTRATION & MANAGEMENT
// ============================================================================

/**
 * Register the background sync task.
 * Call this once during app initialization (e.g., in App.tsx or a context provider).
 */
export async function registerBackgroundSync(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      log.warn('Background fetch is restricted or denied by the OS');
      return false;
    }

    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      log.info('Already registered');
      return true;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (minimum on iOS)
      stopOnTerminate: false,   // Continue after app is swiped away (Android)
      startOnBoot: true,        // Start on device boot (Android)
    });

    log.info('Registered successfully');
    return true;
  } catch (error) {
    log.error('Registration failed:', error);
    return false;
  }
}

/**
 * Unregister the background sync task.
 */
export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      log.info('Unregistered');
    }
  } catch (error) {
    log.error('Unregister failed:', error);
  }
}

/**
 * Foreground sync trigger — use when app detects connectivity restored.
 * This is more reliable than background fetch for immediate sync.
 */
export async function triggerForegroundSync(): Promise<{ synced: number; failed: number }> {
  try {
    const pendingCount = await getPendingCount();
    if (pendingCount === 0) {
      return { synced: 0, failed: 0 };
    }

    log.info(`Triggering sync for ${pendingCount} pending submissions`);
    return await syncPendingSubmissions();
  } catch (error) {
    log.error('Error:', error);
    return { synced: 0, failed: 0 };
  }
}

/**
 * Get the background sync status for display in UI.
 */
export async function getBackgroundSyncStatus(): Promise<{
  isRegistered: boolean;
  osStatus: string;
}> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    const status = await BackgroundFetch.getStatusAsync();
    
    const statusMap: Record<number, string> = {
      [BackgroundFetch.BackgroundFetchStatus.Restricted]: 'Restricted',
      [BackgroundFetch.BackgroundFetchStatus.Denied]: 'Denied',
      [BackgroundFetch.BackgroundFetchStatus.Available]: 'Available',
    };

    return {
      isRegistered,
      osStatus: (status != null ? statusMap[status] : undefined) || 'Unknown',
    };
  } catch {
    return { isRegistered: false, osStatus: 'Error' };
  }
}
