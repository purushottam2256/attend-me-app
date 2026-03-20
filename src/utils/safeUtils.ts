/**
 * Safe JSON utilities — prevents crashes from malformed JSON
 * Use safeJsonParse everywhere instead of raw JSON.parse
 */

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
