/**
 * useNetworkStatus Hook — DEPRECATED
 * 
 * This hook has been replaced by useConnectionStatus (singleton pattern).
 * This file re-exports useConnectionStatus for backward compatibility.
 * 
 * @deprecated Use useConnectionStatus from './useConnectionStatus' instead.
 */

import { useConnectionStatus } from './useConnectionStatus';

export function useNetworkStatus() {
  const { isOnline, justCameOnline, refresh } = useConnectionStatus();
  
  return {
    isConnected: isOnline,
    isInternetReachable: isOnline,
    type: null,
    isOnline,
    wasOffline: false,
    justCameOnline,
    refresh,
  };
}

export default useNetworkStatus;
