/**
 * useConnectionStatus - SINGLETON network status hook
 * 
 * ARCHITECTURE: Uses a module-level NetInfo listener (ONE for the entire app)
 * with debouncing to prevent render storms during network flapping.
 * 
 * All screens share the same listener via useSyncExternalStore pattern.
 * This replaces the old approach where each useConnectionStatus() call
 * created its own NetInfo.addEventListener (causing 10+ simultaneous listeners).
 * 
 * DEBOUNCE LOGIC:
 * - "online → offline" transition is delayed 2s (prevents false negatives during Wi-Fi↔4G handoff)
 * - "offline → online" transition is delayed 500ms (quick recovery, but avoids flicker)
 * - "justCameOnline" flag stays true for 3s after reconnection (for triggering syncs)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { safeJsonParse } from '../utils/safeUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

interface UseConnectionStatusReturn {
  status: ConnectionStatus;
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  justCameOnline: boolean;
  refresh: () => Promise<void>;
}

const OFFLINE_QUEUE_KEY = '@attend_me/offline_queue';

// ============================================================================
// MODULE-LEVEL SINGLETON — shared across ALL hook consumers
// ============================================================================

/** The actual resolved network state (debounced) */
let _isOnline: boolean = true;

/** Raw NetInfo value (pre-debounce) */
let _rawIsOnline: boolean = true;

/** Debounce timer for network transitions */
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Tracks "just came online" for auto-sync triggers */
let _justCameOnline: boolean = false;
let _justCameOnlineTimer: ReturnType<typeof setTimeout> | null = null;

/** All subscriber callbacks */
const _subscribers = new Set<() => void>();

/** Whether the singleton listener is initialized */
let _initialized = false;

/** NetInfo unsubscribe function */
let _unsubscribe: (() => void) | null = null;

function notifySubscribers() {
  _subscribers.forEach(cb => {
    try { cb(); } catch {}
  });
}

function handleNetworkChange(state: NetInfoState) {
  const newOnline = !!(state.isConnected && state.isInternetReachable !== false);
  _rawIsOnline = newOnline;

  // Clear any pending debounce
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }

  if (newOnline === _isOnline) {
    // No actual change — ignore
    return;
  }

  // Debounce the transition
  const delay = newOnline
    ? 500   // online recovery: 500ms (quick but avoids flicker)
    : 2000; // offline detection: 2s (prevents false negatives during Wi-Fi↔4G handoff)

  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    const wasOffline = !_isOnline;
    _isOnline = newOnline;

    // Track "just came online" for sync triggers
    if (newOnline && wasOffline) {
      _justCameOnline = true;
      if (_justCameOnlineTimer) clearTimeout(_justCameOnlineTimer);
      _justCameOnlineTimer = setTimeout(() => {
        _justCameOnline = false;
        _justCameOnlineTimer = null;
        notifySubscribers(); // notify that justCameOnline cleared
      }, 3000);
    }

    notifySubscribers();
  }, delay);
}

function initSingleton() {
  if (_initialized) return;
  _initialized = true;

  // Get initial state synchronously
  NetInfo.fetch().then(state => {
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    _rawIsOnline = _isOnline;
    notifySubscribers();
  }).catch(() => {
    // If NetInfo.fetch fails, assume online
    _isOnline = true;
    _rawIsOnline = true;
  });

  // Single global listener
  _unsubscribe = NetInfo.addEventListener(handleNetworkChange);
}

// ============================================================================
// HOOK — lightweight consumer of the singleton
// ============================================================================

export const useConnectionStatus = (): UseConnectionStatusReturn => {
  // Ensure singleton is initialized
  useMemo(() => initSingleton(), []);

  // Local state synced from singleton
  const [isOnline, setIsOnline] = useState(_isOnline);
  const [justCameOnline, setJustCameOnline] = useState(_justCameOnline);
  const [queueCount, setQueueCount] = useState(0);
  const isSyncingRef = useRef(false);

  // Subscribe to singleton changes
  useEffect(() => {
    const callback = () => {
      setIsOnline(_isOnline);
      setJustCameOnline(_justCameOnline);
    };
    _subscribers.add(callback);

    // Sync initial state
    callback();

    return () => {
      _subscribers.delete(callback);
    };
  }, []);

  // Queue count check (throttled, not on every render)
  const checkQueue = useCallback(async () => {
    try {
      const queueData = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = safeJsonParse<any[]>(queueData, []);
      setQueueCount(Array.isArray(queue) ? queue.length : 0);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    checkQueue();
    const interval = setInterval(checkQueue, 30000);
    return () => clearInterval(interval);
  }, [checkQueue]);

  const status: ConnectionStatus = !isOnline
    ? 'offline'
    : isSyncingRef.current
      ? 'syncing'
      : 'online';

  const refresh = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      _isOnline = connected;
      _rawIsOnline = connected;
      setIsOnline(connected);
      await checkQueue();
    } catch {
      // Non-fatal
    }
  }, [checkQueue]);

  return {
    status,
    isOnline,
    isSyncing: status === 'syncing',
    queueCount,
    justCameOnline,
    refresh,
  };
};

export default useConnectionStatus;
