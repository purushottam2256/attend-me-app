/**
 * Network Context
 * Provides network status and queued actions functionality
 */

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import createLogger from '../utils/logger';

const log = createLogger('Network');

interface QueuedAction {
  id: string;
  action: () => Promise<void>;
  description: string;
}

interface NetworkContextType {
  isOnline: boolean;
  isConnecting: boolean;
  queueAction: (action: () => Promise<void>, description: string) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  isConnecting: false,
  queueAction: () => {},
});

export const useNetwork = () => useContext(NetworkContext);

interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const queuedActions = useRef<QueuedAction[]>([]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online ?? true);

      // Process queued actions when back online
      if (online && queuedActions.current.length > 0) {
        processQueue();
      }
    });

    return () => unsubscribe();
  }, []);

  const processQueue = async () => {
    const actions = [...queuedActions.current];
    queuedActions.current = [];

    for (const { action } of actions) {
      try {
        await action();
      } catch (error) {
        log.error('Queued action failed:', error);
      }
    }
  };

  const queueAction = (action: () => Promise<void>, description: string) => {
    const id = Date.now().toString();
    queuedActions.current.push({ id, action, description });
  };

  return (
    <NetworkContext.Provider value={{ isOnline, isConnecting, queueAction }}>
      {children}
    </NetworkContext.Provider>
  );
};

export default NetworkContext;
