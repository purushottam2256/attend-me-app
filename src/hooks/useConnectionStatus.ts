/**
 * useConnectionStatus - Hook for online/offline/syncing status
 * Monitors network state and offline queue
 */

import { useState, useEffect, useCallback } from 'react';
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

  const updateStatus = useCallback(async (connected: boolean) => {
    setIsConnected(connected);
    
    if (!connected) {
      setStatus('offline');
      return;
    }

    const count = await checkQueue();
    if (count > 0) {
      setStatus('syncing');
    } else {
      setStatus('online');
    }
  }, [checkQueue]);

  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    await updateStatus(state.isConnected ?? true);
  }, [updateStatus]);

  useEffect(() => {
    // Initial check
    refresh();

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      updateStatus(state.isConnected ?? true);
    });

    // Check queue periodically
    const interval = setInterval(checkQueue, 30000); // Reduced from 10s to 30s

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
