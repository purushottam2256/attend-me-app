import AsyncStorage from "@react-native-async-storage/async-storage";
import { SQLiteStorageAdapter, getStorage } from "./storage";
import createLogger from '../../utils/logger';

const log = createLogger('Migration');

const MIGRATION_KEY = 'MIGRATION_V1_COMPLETE';

/**
 * Migrates data from AsyncStorage to SQLite.
 * This should be run on app startup before the offline service is fully used.
 */
export async function migrateToSQLite(): Promise<void> {
  try {
    const storage = getStorage();
    
    // Ensure we are actually using SQLite before migrating
    if (!(storage instanceof SQLiteStorageAdapter)) {
      log.info('storage.ts is not configured for SQLite. Skipping migration.');
      return;
    }

    const sqlite = storage;
    
    // 1. Check if already migrated
    const migrated = await sqlite.getItem(MIGRATION_KEY);
    if (migrated === 'true') {
      log.info('SQLite migration already complete.');
      return;
    }

    log.info('Starting migration from AsyncStorage to SQLite...');

    // 2. Get all data from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    
    // We intentionally SKIP the legacy `CACHED_ROSTERS` and `PENDING_SUBMISSIONS` blobs. 
    // They are massive JSON objects that cause memory heap freezes if pulled synchronously here. 
    // The new architectural update uses relational tables for these anyway, so moving the raw string blobs is useless and harmful.
    const relevantKeys = keys.filter(k => 
      k !== MIGRATION_KEY && 
      k !== "@attend_me/cached_rosters" &&
      k !== "@attend_me/pending_submissions"
    );

    if (relevantKeys.length === 0) {
      log.info('No data in AsyncStorage to migrate.');
      await sqlite.setItem(MIGRATION_KEY, 'true');
      return;
    }

    const pairs = await AsyncStorage.multiGet(relevantKeys);
    
    // 3. Prepare data for SQLite
    const validPairs: [string, string][] = [];
    for (const [key, value] of pairs) {
      if (value !== null) {
        validPairs.push([key, value]);
      }
    }

    // 4. Batch insert into SQLite
    if (validPairs.length > 0) {
      await sqlite.multiSet(validPairs);
      log.info(`Successfully migrated ${validPairs.length} items to SQLite.`);
    }

    // 5. Mark migration as complete
    await sqlite.setItem(MIGRATION_KEY, 'true');
    log.info('Migration marked as complete.');

    // Optional: Clear AsyncStorage to free space / avoid confusion
    // await AsyncStorage.clear();
    
  } catch (error) {
    log.error('Critical error during migration:', error);
    // Do NOT mark as complete so we can retry next time
  }
}
