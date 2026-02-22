/**
 * ConnectionStatusContext — SINGLE-INSTANCE network status provider.
 *
 * Before this fix, useConnectionStatus() was a hook called in 6+ screens.
 * React Navigation keeps all tabs mounted, so each screen created its OWN
 * NetInfo listener + setInterval. After navigating to all tabs = 6 listeners
 * + 6 intervals, all firing concurrently and saturating the JS bridge.
 *
 * Now: ONE provider, ONE listener, ONE interval. All screens read from context.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

interface ConnectionStatusContextData {
  status: ConnectionStatus;
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  refresh: () => Promise<void>;
}

const OFFLINE_QUEUE_KEY = '@attend_me/offline_queue';

const ConnectionStatusContext = createContext<ConnectionStatusContextData>({
  status: 'online',
  isOnline: true,
  isSyncing: false,
  queueCount: 0,
  refresh: async () => {},
});

export const ConnectionStatusProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<ConnectionStatus>('online');
  const [queueCount, setQueueCount] = useState(0);
  const [isConnected, setIsConnected] = useState(true);

  const checkQueueRef = useRef(async () => {
    try {
      const queueData = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = queueData ? JSON.parse(queueData) : [];
      setQueueCount(queue.length);
      return queue.length;
    } catch {
      return 0;
    }
  });

  const updateStatusRef = useRef(async (connected: boolean) => {
    setIsConnected(connected);
    if (!connected) {
      setStatus('offline');
      return;
    }
    const count = await checkQueueRef.current();
    if (count > 0) {
      setStatus('syncing');
    } else {
      setStatus('online');
    }
  });

  const refresh = useCallback(async () => {
    const state = await NetInfo.fetch();
    await updateStatusRef.current(state.isConnected ?? true);
  }, []);

  // SINGLE mount-only effect — ONE listener, ONE interval for the entire app
  useEffect(() => {
    NetInfo.fetch().then(state => {
      updateStatusRef.current(state.isConnected ?? true);
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      updateStatusRef.current(state.isConnected ?? true);
    });

    const interval = setInterval(() => checkQueueRef.current(), 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <ConnectionStatusContext.Provider value={{
      status,
      isOnline: isConnected,
      isSyncing: status === 'syncing',
      queueCount,
      refresh,
    }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
};

/**
 * Drop-in replacement for the old useConnectionStatus() hook.
 * Same API, but reads from the single shared context instead of creating
 * its own NetInfo listener.
 */
export const useConnectionStatus = () => useContext(ConnectionStatusContext);

export default ConnectionStatusContext;
