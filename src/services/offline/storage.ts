import AsyncStorage from "@react-native-async-storage/async-storage";
import createLogger from '../../utils/logger';

const log = createLogger('SQLite');

/**
 * Storage Adapter Interface
 * Allows swapping between AsyncStorage and SQLite seamlessly.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: string[]): Promise<readonly [string, string | null][]>;
  multiSet(keyValuePairs: [string, string][]): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * AsyncStorage Implementation (Current Default)
 */
export const AsyncStorageAdapter: StorageAdapter = {
  async getItem(key: string) {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    return AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    return AsyncStorage.removeItem(key);
  },
  async getAllKeys() {
    return AsyncStorage.getAllKeys();
  },
  async multiGet(keys: string[]) {
    return AsyncStorage.multiGet(keys);
  },
  async multiSet(keyValuePairs: [string, string][]) {
    return AsyncStorage.multiSet(keyValuePairs);
  },
  async multiRemove(keys: string[]) {
    return AsyncStorage.multiRemove(keys);
  },
  async clear() {
    return AsyncStorage.clear();
  },
};

/**
 * Get the active storage adapter.
 * In the future, this can switch to SQLite based on configuration/availability.
 */
import * as SQLite from 'expo-sqlite';

/**
 * SQLite Implementation
 * Optimized for larger datasets and structured queries.
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private db: Promise<SQLite.SQLiteDatabase>;

  constructor() {
    this.db = this.init();
  }

  private async init() {
    try {
      const db = await SQLite.openDatabaseAsync('offline.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT);
        
        CREATE TABLE IF NOT EXISTS local_notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          data TEXT, -- JSON
          priority TEXT,
          is_read INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_substitutions (
           id TEXT PRIMARY KEY,
           original_faculty_id TEXT NOT NULL,
           substitute_faculty_id TEXT,
           subject_name TEXT,
           subject_code TEXT,
           original_faculty_name TEXT,
           target_dept TEXT,
           target_year INTEGER,
           target_section TEXT,
           slot_id TEXT,
           date TEXT,
           status TEXT,
           requested_at TEXT,
           is_hidden INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS local_class_swaps (
           id TEXT PRIMARY KEY,
           faculty_a_id TEXT NOT NULL,
           faculty_b_id TEXT NOT NULL,
           faculty_a_name TEXT,
           faculty_b_name TEXT,
           slot_a_id TEXT,
           slot_b_id TEXT,
           date TEXT,
           status TEXT,
           requested_at TEXT,
           is_hidden INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rosters (
            class_id TEXT PRIMARY KEY,
            subject_name TEXT,
            subject_id TEXT,
            section TEXT,
            cached_at TEXT
        );

        CREATE TABLE IF NOT EXISTS students (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            name TEXT,
            roll_no TEXT,
            bluetooth_uuid TEXT,
            batch INTEGER,
            FOREIGN KEY(class_id) REFERENCES rosters(class_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pending_submissions (
            id TEXT PRIMARY KEY NOT NULL,
            data TEXT NOT NULL,
            slot_id TEXT,
            date TEXT,
            created_at TEXT NOT NULL
        );
      `);
      log.info('Database initialized successfully');
      return db;
    } catch (error) {
      log.error('Failed to initialize database:', error);
      throw error;
    }
  }

  public getDb(): Promise<SQLite.SQLiteDatabase> {
    return this.db;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const db = await this.db;
      const result = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM kv_store WHERE key = ?',
        [key]
      );
      return result ? result.value : null;
    } catch (error) {
      log.error('getItem error:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      const db = await this.db;
      await db.runAsync(
        'INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)',
        [key, value]
      );
    } catch (error) {
      log.error('setItem error:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      const db = await this.db;
      await db.runAsync('DELETE FROM kv_store WHERE key = ?', [key]);
    } catch (error) {
      log.error('removeItem error:', error);
    }
  }

  async getAllKeys(): Promise<readonly string[]> {
    try {
      const db = await this.db;
      const result = await db.getAllAsync<{ key: string }>('SELECT key FROM kv_store');
      return result.map(row => row.key);
    } catch (error) {
      log.error('getAllKeys error:', error);
      return [];
    }
  }

  async multiGet(keys: string[]): Promise<readonly [string, string | null][]> {
    if (keys.length === 0) return [];
    try {
      const db = await this.db;
      // SQLite doesn't have a simple "WHERE key IN (?)" for dynamic array in expo-sqlite directly without constructing query string
      // For safety, we can loop or bind parameters carefully.
      // Or use a single query with constructed placeholders.
      const placeholders = keys.map(() => '?').join(',');
      const result = await db.getAllAsync<{ key: string, value: string }>(
        `SELECT key, value FROM kv_store WHERE key IN (${placeholders})`,
        keys
      );
      
      const resultMap = new Map(result.map(row => [row.key, row.value]));
      return keys.map(key => [key, resultMap.get(key) || null]);
    } catch (error) {
      log.error('multiGet error:', error);
      return keys.map(key => [key, null]);
    }
  }

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    if (keyValuePairs.length === 0) return;
    try {
      const db = await this.db;
      // SQLite parameter limit is usually 999. Each pair takes 2 params.
      // Safe batch size: 400 pairs (800 params).
      const BATCH_SIZE = 400;

      await db.withTransactionAsync(async () => {
        for (let i = 0; i < keyValuePairs.length; i += BATCH_SIZE) {
          const batch = keyValuePairs.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map(() => '(?, ?)').join(',');
          const values = batch.flatMap(pair => pair);

          await db.runAsync(
            `INSERT OR REPLACE INTO kv_store (key, value) VALUES ${placeholders}`,
            values
          );
        }
      });
    } catch (error) {
      log.error('multiSet error:', error);
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      const db = await this.db;
      const BATCH_SIZE = 900; // Safe limit for WHERE IN (?)

      await db.withTransactionAsync(async () => {
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
          const batch = keys.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map(() => '?').join(',');
          await db.runAsync(
            `DELETE FROM kv_store WHERE key IN (${placeholders})`,
            batch
          );
        }
      });
    } catch (error) {
      log.error('multiRemove error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.db;
      await db.runAsync('DELETE FROM kv_store');
    } catch (error) {
      log.error('clear error:', error);
    }
  }
}

// Global instance to avoid re-initializing
let storageInstance: StorageAdapter | null = null;

/**
 * Get the active storage adapter.
 * Currently returns AsyncStorageAdapter, but ready to switch to SQLiteStorageAdapter.
 */
export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    // UNCOMMENT NEXT LINE TO ENABLE SQLITE
    storageInstance = new SQLiteStorageAdapter();
    // storageInstance = AsyncStorageAdapter; 
  }
  return storageInstance;
}

/**
 * Returns the raw SQLite database instance if active, for structured queries.
 */
export function getSqliteDb(): Promise<SQLite.SQLiteDatabase> {
  const adapter = getStorage();
  if (adapter instanceof SQLiteStorageAdapter) {
    return adapter.getDb();
  }
  throw new Error("SQLite adapter is not active");
}
