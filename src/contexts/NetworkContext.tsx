/**
 * Network Context
 * Provides network status and queued actions functionality
 * 
 * REFACTORED: Now consumes the shared useConnectionStatus singleton
 * instead of creating its own NetInfo listener.
 */

import React, { createContext, useContext, useRef, ReactNode } from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
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
  const { isOnline, justCameOnline } = useConnectionStatus();
  const queuedActions = useRef<QueuedAction[]>([]);
  const isProcessingRef = useRef(false);

  // Process queued actions when back online
  React.useEffect(() => {
    if (justCameOnline && queuedActions.current.length > 0 && !isProcessingRef.current) {
      processQueue();
    }
  }, [justCameOnline]);

  const processQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    const actions = [...queuedActions.current];
    queuedActions.current = [];

    for (const { action, description } of actions) {
      try {
        await action();
      } catch (error) {
        log.error(`Queued action "${description}" failed:`, error);
      }
    }
    
    isProcessingRef.current = false;
  };

  const queueAction = (action: () => Promise<void>, description: string) => {
    const id = Date.now().toString();
    queuedActions.current.push({ id, action, description });
  };

  return (
    <NetworkContext.Provider value={{ isOnline, isConnecting: false, queueAction }}>
      {children}
    </NetworkContext.Provider>
  );
};

export default NetworkContext;
