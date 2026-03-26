import * as SQLite from 'expo-sqlite';
import createLogger from '../utils/logger';

const log = createLogger('Database');

/**
 * Global SQLite Database Pool Singleton
 * 
 * Prevents "Database Locked" and "Stop-The-World" Native thread GC panics
 * by ensuring only ONE connection to the SQLite database is ever opened
 * across the entire application (WAL mode concurrency).
 * 
 * Features:
 * - Serialized write queue (prevents parallel writes / DB locking)
 * - Auto-retry on transient DB failures
 * - Single connection pool
 */
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
  
  // Write queue: ensures only ONE write operation runs at a time
  private writeQueue: Promise<any> = Promise.resolve();

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Returns the globally pooled SQLite database instance.
   * Awaits initialization if it hasn't finished yet.
   */
  public async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!this.dbPromise) {
      log.info('Initializing Global SQLite Connection Pool...');
      this.dbPromise = this.initDb();
    }
    return this.dbPromise;
  }

  /**
   * Serialized write queue — ensures only ONE write operation runs at a time.
   * Prevents "database is locked" errors from parallel writes.
   * 
   * Usage:
   *   await dbPool.runSerialized(async (db) => {
   *     await db.runAsync('INSERT INTO ...', [...]);
   *   });
   */
  public async runSerialized<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    // Chain onto the write queue so operations execute one-by-one
    const result = this.writeQueue.then(async () => {
      const db = await this.getDb();
      return fn(db);
    });
    
    // Update the queue tail — catch errors so one failure doesn't stall the entire queue
    this.writeQueue = result.catch((err) => {
      log.error('Serialized write failed (queue continues):', err);
    });
    
    return result;
  }

  /**
   * Execute a DB operation with automatic retry on transient failures.
   * Falls back gracefully instead of crashing.
   */
  public async withRetry<T>(
    fn: (db: SQLite.SQLiteDatabase) => Promise<T>,
    fallback: T,
    maxRetries: number = 2
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const db = await this.getDb();
        return await fn(db);
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        log.error(`DB operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
        
        if (isLastAttempt) {
          return fallback;
        }
        
        // If DB connection itself failed, reset and retry
        if (error?.message?.includes('database') || error?.message?.includes('SQLite')) {
          this.dbPromise = null;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return fallback;
  }

  private async initDb(): Promise<SQLite.SQLiteDatabase> {
    try {
      // expo-sqlite uses WAL mode by default which allows concurrent reads,
      // but serialized writes. A single connection ensures writes don't collide.
      const db = await SQLite.openDatabaseAsync('offline.db');
      
      // 1. Enforce performance PRAGMAs separately (Expo-SQLite can choke mixing PRAGMAs with DDL)
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -2000;
      `);
      
      // 2. Execute all schema creations
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT);
        
        CREATE TABLE IF NOT EXISTS local_notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          data TEXT,
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
        
        CREATE TABLE IF NOT EXISTS offline_pending_submissions (
            id TEXT PRIMARY KEY NOT NULL,
            class_data TEXT NOT NULL,
            attendance TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            sync_status TEXT DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS offline_roster_cache (
            roster_id TEXT PRIMARY KEY NOT NULL, 
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            students_count INTEGER DEFAULT 0
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
           class_id TEXT,
           name TEXT,
           roll_no TEXT,
           bluetooth_uuid TEXT,
           batch INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS pending_submissions (
           id TEXT PRIMARY KEY,
           data TEXT,
           slot_id TEXT,
           date TEXT,
           created_at TEXT,
           status TEXT DEFAULT 'pending',
           retry_count INTEGER DEFAULT 0,
           last_error TEXT
        );
      `);

      log.info('Global SQLite Connection established successfully.');
      return db;
    } catch (error) {
      log.error('FATAL: Failed to initialize Global SQLite Connection', error);
      this.dbPromise = null; // Reset so next call tries again
      throw error;
    }
  }
}

export const dbPool = DatabaseConnection.getInstance();
