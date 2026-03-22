/**
 * useConnectionStatus - Hook for online/offline/syncing status
 * Monitors network state and offline queue
 * 
 * FIX: Previously reported 'syncing' (non-online) when offline queue had
 * pending items, causing manual mode & BLE scanner to falsely show offline.
 * Now: status strictly reflects network connectivity. Queue count is tracked
 * separately and only affects the sync badge, not the connection status.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

interface UseConnectionStatusReturn {
  status: ConnectionStatus;
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  refresh: () => Promise<void>;
}

const OFFLINE_QUEUE_KEY = '@attend_me/offline_queue';

export const useConnectionStatus = (): UseConnectionStatusReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('online');
  const [queueCount, setQueueCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);
  // Track whether an active sync operation is in progress (set externally via context)
  const isSyncingRef = useRef(false);

  const checkQueue = useCallback(async () => {
    try {
      const queueData = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = queueData ? JSON.parse(queueData) : [];
      setQueueCount(queue.length);
      return queue.length;
    } catch {
      return 0;
    }
  }, []);

  const updateStatus = useCallback(async (state: NetInfoState) => {
    const connected = state.isConnected && state.isInternetReachable !== false;
    setIsConnected(!!connected);
    
    if (!connected) {
      setStatus('offline');
      return;
    }

    // FIX: When connected, always report 'online'.
    // 'syncing' is only set during an actual sync operation, not when queue has items.
    // Queue count is tracked separately for UI badges.
    await checkQueue();
    setStatus(isSyncingRef.current ? 'syncing' : 'online');
  }, [checkQueue]);

  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    await updateStatus(state);
  }, [updateStatus]);

  useEffect(() => {
    // Initial check
    refresh();

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      updateStatus(state);
    });

    // Check queue periodically (just for badge count, not status)
    const interval = setInterval(checkQueue, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [refresh, updateStatus, checkQueue]);

  return {
    status,
    isOnline: isConnected,
    isSyncing: status === 'syncing',
    queueCount,
    refresh,
  };
};

export default useConnectionStatus;
