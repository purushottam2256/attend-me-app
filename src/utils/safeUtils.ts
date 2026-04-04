/**
 * Safe Execution & Data Utilities — prevents crashes from:
 * - Malformed JSON
 * - Unhandled async errors
 * - Invalid API responses
 * - Missing required fields
 * - JS thread blocking during heavy data loads
 *
 * EVERY async call in the app should go through safeExecute() or safeApi().
 */

import { InteractionManager } from 'react-native';

import * as Sentry from '@sentry/react-native';

// ============================================================================
// JSON SAFETY
// ============================================================================

/**
 * Safe JSON.parse — never throws. Returns fallback on failure.
 */
export function safeJsonParse<T = any>(
  json: string | null | undefined,
  fallback: T = null as T
): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    if (__DEV__) {
      console.warn('[safeJsonParse] Failed to parse:', json?.slice(0, 100));
    }
    return fallback;
  }
}

/**
 * Safe JSON.stringify — never throws. Returns '{}' on failure.
 */
export function safeJsonStringify(value: any, fallback: string = '{}'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

// ============================================================================
// DATA SAFETY
// ============================================================================

/**
 * Safe array access — returns empty array if value is not an array.
 */
export function safeArray<T>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Safe property access — returns fallback if value is nullish.
 */
export function safeGet<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

// ============================================================================
// SAFE EXECUTE — wraps ALL async operations
// ============================================================================

interface SafeExecuteOptions {
  /** Maximum number of retries on failure (default: 0 = no retry) */
  retries?: number;
  /** Delay between retries in ms (default: 500) */
  retryDelay?: number;
  /** Context tag for logging (e.g. 'BLEScanner', 'SyncEngine') */
  context?: string;
  /** If true, suppress console output even in __DEV__ */
  silent?: boolean;
}

/**
 * Wraps any async function with try/catch + optional retry.
 * NEVER throws — returns fallback on failure.
 *
 * Usage:
 *   const data = await safeExecute(() => fetchFromAPI(), [], { retries: 2, context: 'Dashboard' });
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: SafeExecuteOptions = {}
): Promise<T> {
  const { retries = 0, retryDelay = 500, context = 'Unknown', silent = false } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === retries;
      const tag = `[safeExecute][${context}]`;

      if (!silent) {
        if (__DEV__) {
          console.warn(
            `${tag} Attempt ${attempt + 1}/${retries + 1} failed:`,
            error?.message || error
          );
        }
      }

      // Report to Sentry on final failure
      if (isLastAttempt) {
        try {
          Sentry.captureException(error, {
            tags: { safeExecute: context },
            extra: { attempt: attempt + 1, totalAttempts: retries + 1 },
          });
        } catch {
          // Sentry itself failed — swallow silently
        }
        return fallback;
      }

      // Wait before retrying
      if (retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Fallback (TypeScript safety — should never reach here)
  return fallback;
}

// ============================================================================
// SAFE API — wraps Supabase responses
// ============================================================================

interface SupabaseResponse<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
}

/**
 * Wraps a Supabase call. Checks for error, validates data, returns fallback on failure.
 * NEVER throws.
 *
 * Usage:
 *   const users = await safeApi(supabase.from('profiles').select('*'), []);
 */
export async function safeApi<T>(
  promise: PromiseLike<SupabaseResponse<T>>,
  fallback: T,
  context: string = 'API'
): Promise<T> {
  try {
    const { data, error } = await promise;

    if (error) {
      if (__DEV__) {
        console.warn(`[safeApi][${context}] Error:`, error.message);
      }
      try {
        Sentry.captureMessage(`[safeApi][${context}] ${error.message}`, 'warning');
      } catch {
        // Sentry failed — swallow
      }
      return fallback;
    }

    // Guard against null/undefined data
    if (data == null) {
      return fallback;
    }

    return data;
  } catch (error: any) {
    if (__DEV__) {
      console.warn(`[safeApi][${context}] Exception:`, error?.message || error);
    }
    try {
      Sentry.captureException(error, { tags: { safeApi: context } });
    } catch {
      // Sentry failed — swallow
    }
    return fallback;
  }
}

// ============================================================================
// DATA VALIDATION
// ============================================================================

/**
 * Validates that an object has all required fields (non-null, non-undefined, non-empty-string).
 * Returns { valid: true } or { valid: false, missing: ['fieldName', ...] }.
 *
 * Usage:
 *   const check = validateRequired(submission, ['student_id', 'session_id', 'status']);
 *   if (!check.valid) { log.error('Missing fields:', check.missing); return; }
 */
export function validateRequired(
  obj: Record<string, any> | null | undefined,
  fields: string[]
): { valid: boolean; missing: string[] } {
  if (!obj) {
    return { valid: false, missing: fields };
  }

  const missing = fields.filter(field => {
    const val = obj[field];
    return val === null || val === undefined || val === '';
  });

  return { valid: missing.length === 0, missing };
}

// ============================================================================
// INTERACTION-SAFE EXECUTION — defers work until after animations complete
// ============================================================================

/**
 * Defers execution of heavy async work until after pending UI interactions
 * (navigation animations, gesture handlers) complete. This prevents the
 * JS thread from being blocked during screen transitions, which is the
 * #1 cause of ANRs and janky animations in React Native.
 *
 * Usage:
 *   await safeInteractionExecute(() => fetchHeavyData(), []);
 */
export function safeInteractionExecute<T>(
  fn: () => Promise<T>,
  fallback: T,
  context: string = 'Unknown'
): Promise<T> {
  return new Promise<T>((resolve) => {
    const handle = InteractionManager.runAfterInteractions(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error: any) {
        if (__DEV__) {
          console.warn(`[safeInteractionExecute][${context}] Error:`, error?.message || error);
        }
        try {
          Sentry.captureException(error, { tags: { safeInteraction: context } });
        } catch {
          // Sentry failed — swallow
        }
        resolve(fallback);
      }
    });

    // Safety: if InteractionManager never fires (edge case on Android),
    // force-resolve after 10 seconds to prevent hanging
    setTimeout(() => {
      resolve(fallback);
    }, 10000);
  });
}

// ============================================================================
// SAFE MATH — prevents -Infinity/NaN from crashing render
// ============================================================================

/**
 * Safe Math.max that handles empty arrays. Math.max() with no args returns -Infinity,
 * and Math.max(...[]) also returns -Infinity, which causes NaN in downstream division.
 */
export function safeMax(values: number[], fallback: number = 0): number {
  if (!values || values.length === 0) return fallback;
  return Math.max(...values);
}

/**
 * Safe Math.min that handles empty arrays.
 */
export function safeMin(values: number[], fallback: number = 0): number {
  if (!values || values.length === 0) return fallback;
  return Math.min(...values);
}
