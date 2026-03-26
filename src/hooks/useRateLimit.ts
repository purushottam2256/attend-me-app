/**
 * Custom Hooks for Rate-Limiting User Actions
 *
 * - useDebounce: Delays value updates (for search inputs)
 * - useThrottle: Limits action frequency (for buttons/refresh)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Debounce a value — waits for the user to stop typing before updating.
 *
 * Usage:
 *   const [searchText, setSearchText] = useState('');
 *   const debouncedSearch = useDebounce(searchText, 300);
 *   useEffect(() => { search(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * Throttle an async function — prevents rapid-fire calls.
 *
 * Usage:
 *   const throttledRefresh = useThrottle(async () => { await fetchData(); }, 2000);
 *   <Button onPress={throttledRefresh} />
 */
export function useThrottle<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number = 2000
): T {
  const lastCallRef = useRef(0);
  const isRunningRef = useRef(false);

  const throttledFn = useCallback((...args: any[]) => {
    const now = Date.now();
    
    // Prevent double-tap and rapid fire
    if (isRunningRef.current || now - lastCallRef.current < delayMs) {
      return;
    }

    lastCallRef.current = now;
    isRunningRef.current = true;

    const result = fn(...args);

    // If the function returns a promise, wait for it
    if (result && typeof result.then === 'function') {
      result.finally(() => {
        isRunningRef.current = false;
      });
    } else {
      // Synchronous function — unlock after delay
      setTimeout(() => {
        isRunningRef.current = false;
      }, delayMs);
    }

    return result;
  }, [fn, delayMs]) as T;

  return throttledFn;
}

export default { useDebounce, useThrottle };
