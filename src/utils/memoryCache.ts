/**
 * In-Memory Cache Layer with TTL
 *
 * Provides zero-latency reads for frequently accessed data.
 * Three-tier lookup: Memory → SQLite → Supabase
 *
 * Usage:
 *   memoryCache.set('schedule:today', scheduleData, 5 * 60 * 1000); // 5 min TTL
 *   const cached = memoryCache.get('schedule:today');
 */

import createLogger from './logger';

const log = createLogger('MemoryCache');

interface CacheEntry<T = any> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached data. Returns null if expired or missing.
   */
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with TTL (in ms).
   * Default TTL: 5 minutes.
   */
  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Get data from cache, or fetch it if missing/expired.
   * Automatically caches the result.
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number = 5 * 60 * 1000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    try {
      const data = await fetchFn();
      this.set(key, data, ttlMs);
      return data;
    } catch (error) {
      log.error(`getOrFetch failed for key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Invalidate a specific key.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix (e.g., 'schedule:').
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for debugging.
   */
  stats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const memoryCache = new MemoryCache(50);
export default memoryCache;
