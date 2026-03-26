/**
 * Supabase Client Configuration
 * Uses SecureStore for token persistence
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
 * Falls back to standard fetch if AbortController isn't available.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
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
