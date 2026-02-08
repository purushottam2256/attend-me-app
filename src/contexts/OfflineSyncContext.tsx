/**
 * OfflineSyncContext - App-wide offline sync state management
 * 
 * Provides:
 * - Network status monitoring
 * - Auto-sync when network returns
 * - Sync status for UI badges
 * - Manual sync triggers
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  cacheAllRosters,
  syncPendingSubmissions,
  getSyncStatus,
  getPendingCount,
  type SyncStatus,
  syncRosters as syncRostersService,
} from '../services/offlineService';
import { getTodaySchedule } from '../services/dashboardService';
import { supabase } from '../config/supabase';

interface OfflineSyncContextType {
  // Network status
  isOnline: boolean;
  
  // Sync status
  syncStatus: SyncStatus;
  isSyncing: boolean;
  lastError: string | null;
  
  // Actions
  syncRosters: () => Promise<{ success: boolean; count: number }>;
  syncPending: () => Promise<{ synced: number; failed: number }>;
  refreshStatus: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { isOnline, justCameOnline } = useNetworkStatus();
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    pendingCount: 0,
    isExpired: true,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refresh sync status
  const refreshStatus = useCallback(async () => {
    const status = await getSyncStatus();
    setSyncStatus(status);
  }, []);

  // Load initial status
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Auto-sync pending submissions when coming back online
  useEffect(() => {
    if (justCameOnline && syncStatus.pendingCount > 0) {
      console.log('[OfflineSync] Network restored - auto-syncing pending submissions');
      syncPending();
    }
  }, [justCameOnline, syncStatus.pendingCount]);

  // Auto-sync rosters on launch (once per session)


  // Sync rosters (Smart Sync)
  const syncRosters = useCallback(async () => {
    if (!isOnline) {
      setLastError('No internet connection');
      return { success: false, count: 0 };
    }

    setIsSyncing(true);
    setLastError(null);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Use Smart Sync Service
      const result = await syncRostersService(user.id);
      
      if (!result.success) {
        setLastError(result.error || 'Failed to sync rosters');
      }
      
      await refreshStatus();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setLastError(message);
      return { success: false, count: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshStatus]);

  // Auto-sync rosters on launch (once per session)
  const [hasInitialSynced, setHasInitialSynced] = useState(false);
  useEffect(() => {
    if (isOnline && !hasInitialSynced) {
      console.log('[OfflineSync] Triggering initial Smart Roster Sync');
      syncRosters();
      setHasInitialSynced(true);
    }
  }, [isOnline, hasInitialSynced, syncRosters]);

  // Sync pending submissions
  const syncPending = useCallback(async () => {
    if (!isOnline) {
      return { synced: 0, failed: 0 };
    }

    setIsSyncing(true);
    setLastError(null);

    try {
      const result = await syncPendingSubmissions();
      await refreshStatus();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setLastError(message);
      return { synced: 0, failed: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshStatus]);

  // Periodically check for pending submissions
  useEffect(() => {
    const interval = setInterval(() => {
      getPendingCount().then(count => {
        if (count !== syncStatus.pendingCount) {
          refreshStatus();
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [syncStatus.pendingCount, refreshStatus]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline: isOnline ?? false,
        syncStatus,
        isSyncing,
        lastError,
        syncRosters,
        syncPending,
        refreshStatus,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within OfflineSyncProvider');
  }
  return context;
}

export default OfflineSyncContext;
