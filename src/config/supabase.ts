/**
 * Supabase Client Configuration
 * Uses SecureStore for token persistence
 * 
 * HARDENED: fetchWithTimeout catches AbortError and returns a safe
 * empty Response instead of throwing — prevents crash cascades during
 * rapid network flapping where multiple AbortControllers fire simultaneously.
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import createLogger from '../utils/logger';

const log = createLogger('Supabase');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// Global request timeout (prevents hung requests from freezing the app)
const SUPABASE_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Custom fetch wrapper with timeout via AbortController.
 * 
 * CRITICAL: On AbortError, we return a safe empty Response with status 408
 * instead of letting the error propagate. This prevents unhandled promise
 * rejections during network flapping.
 */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  // If the caller already has a signal, chain it
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    // AbortError = timeout or manual cancel — don't throw, return safe response
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      log.info('Request timed out or aborted:', typeof input === 'string' ? input.slice(-60) : 'Request');
      return new Response(JSON.stringify({ error: 'Request timeout', message: 'The request was aborted due to timeout' }), {
        status: 408,
        statusText: 'Request Timeout',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Network error (no internet) — return safe response instead of crashing
    if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
      log.info('Network unavailable for request');
      return new Response(JSON.stringify({ error: 'Network error', message: 'Network is unavailable' }), {
        status: 0,
        statusText: 'Network Error',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Unknown error — still throw (but this is rare)
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// SecureStore adapter for Supabase auth
const ExpoSecureStoreAdapter = {
    getItem: async (key: string): Promise<string | null> => {
        try {
            return await SecureStore.getItemAsync(key);
        } catch (error) {
            log.error('SecureStore getItem error:', error);
            return null;
        }
    },
    setItem: async (key: string, value: string): Promise<void> => {
        try {
            await SecureStore.setItemAsync(key, value);
        } catch (error) {
            log.error('SecureStore setItem error:', error);
        }
    },
    removeItem: async (key: string): Promise<void> => {
        try {
            await SecureStore.deleteItemAsync(key);
        } catch (error) {
            log.error('SecureStore removeItem error:', error);
        }
    },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
    global: {
        fetch: fetchWithTimeout,
    },
});

export default supabase;
