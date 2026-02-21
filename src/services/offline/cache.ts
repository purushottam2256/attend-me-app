import { 
  CachedRoster, 
  CachedProfile, 
  CachedScheduleSlot, 
  CacheTimestamps,
  STORAGE_KEYS 
} from "./types";
import { getStorage, getSqliteDb } from "./storage";
import { InteractionManager } from 'react-native';
import createLogger from '../../utils/logger';

const storage = getStorage();
const log = createLogger('OfflineCache');

// ============================================================================
// JS THREAD YIELD UTILITY
// ============================================================================

/**
 * Yields control back to the JS thread so touch events, navigation, and
 * animations can be processed. Use between heavy sync operations.
 *
 * How it works: setTimeout(resolve, 0) pushes the continuation to the BACK
 * of the JS event queue, letting any pending UI work run first.
 */
function yieldToUI(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================================================
// TIMESTAMP & STALENESS UTILS
// ============================================================================

export async function getCacheTimestamps(): Promise<CacheTimestamps> {
  try {
    const data = await storage.getItem(STORAGE_KEYS.CACHE_TIMESTAMPS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export async function setCacheTimestamp(key: string): Promise<void> {
  try {
    const timestamps = await getCacheTimestamps();
    timestamps[key] = new Date().toISOString();
    await storage.setItem(
      STORAGE_KEYS.CACHE_TIMESTAMPS,
      JSON.stringify(timestamps),
    );
  } catch (error) {
    log.error("Error setting timestamp:", error);
  }
}

export async function getCacheTimestamp(key: string): Promise<Date | null> {
  const timestamps = await getCacheTimestamps();
  return timestamps[key] ? new Date(timestamps[key]) : null;
}

/**
 * Get a human-readable age string for a cache key (e.g., "5 minutes ago", "Yesterday")
 */
export async function getCacheAge(key: string): Promise<string> {
  const timestamp = await getCacheTimestamp(key);
  if (!timestamp) return 'Never synced';
  
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

export async function isCacheStale(
  key: string,
  maxAgeHours: number,
): Promise<boolean> {
  const timestamp = await getCacheTimestamp(key);
  if (!timestamp) return true;

  const ageMs = Date.now() - timestamp.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours > maxAgeHours;
}

export async function isCacheValid(
  key: string = 'rosters',
  maxAgeHours: number = 24,
): Promise<boolean> {
  return !(await isCacheStale(key, maxAgeHours));
}

// ============================================================================
// ROSTER CACHING
// ============================================================================

/**
 * Get the structured roster map from SQLite (Constructed from raw tables)
 */
export async function getCachedRostersMap(): Promise<Record<string, CachedRoster>> {
  try {
    const db = await getSqliteDb();
    const rosters = await db.getAllAsync<any>(`SELECT * FROM rosters`);
    const students = await db.getAllAsync<any>(`SELECT * FROM students ORDER BY roll_no ASC`);
    
    const map: Record<string, CachedRoster> = {};
    for (const r of rosters) {
       map[r.class_id] = {
          classId: r.class_id,
          slotId: 0,
          subjectName: r.subject_name,
          subjectId: r.subject_id,
          section: r.section,
          cachedAt: r.cached_at,
          students: []
       };
    }
    for (const s of students) {
       if (map[s.class_id]) {
           map[s.class_id].students.push({
              id: s.id,
              name: s.name,
              rollNo: s.roll_no,
              bluetoothUUID: s.bluetooth_uuid,
              batch: s.batch
           });
       }
    }
    return map;
  } catch (error) {
    log.error("Error getting roster map from SQLite:", error);
    return {};
  }
}

export async function cacheRoster(roster: CachedRoster): Promise<void> {
  try {
    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
       await db.runAsync(`INSERT OR REPLACE INTO rosters (class_id, subject_name, subject_id, section, cached_at) VALUES (?, ?, ?, ?, ?)`, 
          [roster.classId, roster.subjectName, roster.subjectId || null, roster.section, roster.cachedAt]
       );
       await db.runAsync(`DELETE FROM students WHERE class_id = ?`, [roster.classId]);
       
       // Batch insert students in chunks of 50 to reduce bridge calls
       const students = roster.students;
       for (let i = 0; i < students.length; i += 50) {
          const chunk = students.slice(i, i + 50);
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const values = chunk.flatMap(s => [s.id, roster.classId, s.name, s.rollNo, s.bluetoothUUID || null, s.batch || null]);
          await db.runAsync(`INSERT INTO students (id, class_id, name, roll_no, bluetooth_uuid, batch) VALUES ${placeholders}`, values);
       }
    });

    await setCacheTimestamp("rosters");
    log.info(`Cached single roster for ${roster.subjectName} to SQLite`);
  } catch (error) {
    log.error("Error caching roster to SQLite:", error);
  }
}

/**
 * Bulk cache rosters into SQLite — NON-BLOCKING version.
 *
 * Professional techniques used:
 * 1. Each roster is processed in its own transaction (not one giant one)
 * 2. yieldToUI() between rosters lets the JS thread handle touch events
 * 3. Students are batch-inserted 50 at a time (1 SQL call vs 60 individual calls)
 *
 * Before: 9 rosters × 60 students = 540 sequential db.runAsync() in one block → 3-5s freeze
 * After:  9 transactions with batch inserts + yields between each → zero freeze
 */
export async function cacheAllRosters(rosters: CachedRoster[] | Record<string, CachedRoster>): Promise<void> {
  try {
    const db = await getSqliteDb();
    const arr = Array.isArray(rosters) ? rosters : Object.values(rosters);
    
    // Process each roster in its own small transaction, yielding between them
    for (let ri = 0; ri < arr.length; ri++) {
      const r = arr[ri];
      
      await db.withTransactionAsync(async () => {
        // Upsert roster metadata
        await db.runAsync(
          `INSERT OR REPLACE INTO rosters (class_id, subject_name, subject_id, section, cached_at) VALUES (?, ?, ?, ?, ?)`, 
          [r.classId, r.subjectName, r.subjectId || null, r.section, r.cachedAt]
        );
        
        // Clear old students
        await db.runAsync(`DELETE FROM students WHERE class_id = ?`, [r.classId]);
        
        // Batch insert students in chunks of 50 (1 SQL call per chunk instead of 1 per student)
        const students = r.students;
        for (let i = 0; i < students.length; i += 50) {
          const chunk = students.slice(i, i + 50);
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const values = chunk.flatMap(s => [
            s.id, r.classId, s.name, s.rollNo, s.bluetoothUUID || null, s.batch || null
          ]);
          await db.runAsync(
            `INSERT INTO students (id, class_id, name, roll_no, bluetooth_uuid, batch) VALUES ${placeholders}`,
            values
          );
        }
      });
      
      // ── YIELD: give the JS thread a chance to handle touch events ──
      // Without this, 9 back-to-back transactions lock the thread for seconds
      if (ri < arr.length - 1) {
        await yieldToUI();
      }
    }

    await setCacheTimestamp("rosters");
    log.info(`Cached ${arr.length} rosters in bulk to SQLite tables`);
  } catch (error) {
    log.error("Error bulk caching rosters in SQLite:", error);
  }
}

export async function getCachedRosters(): Promise<CachedRoster[]> {
  const map = await getCachedRostersMap();
  return Object.values(map);
}

export async function getCachedRosterResponse(classId: string): Promise<CachedRoster | undefined> {
  try {
     const db = await getSqliteDb();
     const rosterRow = await db.getFirstAsync<any>(
         `SELECT * FROM rosters WHERE class_id = ?`, [classId]
     );
     if (!rosterRow) return undefined;
     
     const studentRows = await db.getAllAsync<any>(
         `SELECT * FROM students WHERE class_id = ? ORDER BY roll_no ASC`, [classId]
     );
     
     return {
         classId: rosterRow.class_id,
         slotId: 0,
         subjectName: rosterRow.subject_name,
         subjectId: rosterRow.subject_id,
         section: rosterRow.section,
         cachedAt: rosterRow.cached_at,
         students: studentRows.map(s => ({
            id: s.id,
            name: s.name,
            rollNo: s.roll_no,
            bluetoothUUID: s.bluetooth_uuid,
            batch: s.batch
         }))
     };
  } catch (e) {
     return undefined;
  }
}

/**
 * Alias for getCachedRosterResponse to fix import errors / inconsistency
 */
export async function getCachedRoster(classId: string): Promise<CachedRoster | undefined> {
  return getCachedRosterResponse(classId);
}

/**
 * Find a cached roster by class details (Department, Year, Section).
 */
export async function findCachedRoster(
  dept: string,
  year: number,
  section: string
): Promise<CachedRoster | undefined> {
  const map = await getCachedRostersMap();
  const key = `${dept}-${year}-${section}`;
  return map[key];
}

/**
 * Purge outdated rosters that are no longer part of the user's active timetable
 */
export async function purgeStaleRosters(validClassIds: string[]): Promise<void> {
  try {
     const db = await getSqliteDb();
     if (validClassIds.length === 0) {
         await db.runAsync(`DELETE FROM rosters`);
         log.info("Purged ALL stale rosters from SQLite as schedule is empty.");
         return;
     }
     const placeholders = validClassIds.map(() => '?').join(',');
     const result = await db.runAsync(`DELETE FROM rosters WHERE class_id NOT IN (${placeholders})`, validClassIds);
     if (result.changes > 0) {
         log.info(`Purged ${result.changes} stale rosters from SQLite`);
     }
  } catch (error) {
     log.error("Error purging stale rosters in SQLite:", error);
  }
}

// ============================================================================
// SCHEDULE / TIMETABLE CACHING
// ============================================================================

export async function cacheTodaySchedule(schedule: CachedScheduleSlot[]): Promise<void> {
  // Fire-and-forget: don't block UI for caching
  InteractionManager.runAfterInteractions(async () => {
    try {
      await storage.setItem(
        STORAGE_KEYS.TODAY_SCHEDULE,
        JSON.stringify(schedule),
      );
      await setCacheTimestamp("today_schedule");
    } catch (error) {
      log.error("Error caching today's schedule:", error);
    }
  });
}

export async function getCachedTodaySchedule(): Promise<CachedScheduleSlot[] | null> {
  try {
    const cached = await storage.getItem(STORAGE_KEYS.TODAY_SCHEDULE);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    log.error("Error getting cached schedule:", error);
    return null;
  }
}

export async function cacheTimetable(timetable: any[]): Promise<void> {
  try {
    await storage.setItem(
      STORAGE_KEYS.TIMETABLE,
      JSON.stringify(timetable),
    );
    await setCacheTimestamp("timetable");
    log.info("Cached timetable:", timetable.length, "entries");
  } catch (error) {
    log.error("Error caching timetable:", error);
  }
}

export async function getCachedTimetable(): Promise<any[] | null> {
  try {
    const cached = await storage.getItem(STORAGE_KEYS.TIMETABLE);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    log.error("Error getting cached timetable:", error);
    return null;
  }
}

// ============================================================================
// PROFILE CACHING
// ============================================================================

export async function cacheProfile(profile: CachedProfile): Promise<void> {
  // Fire-and-forget: don't block UI for caching
  InteractionManager.runAfterInteractions(async () => {
    try {
      const data = { ...profile, cachedAt: new Date().toISOString() };
      await storage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(data));
      await setCacheTimestamp("profile");
    } catch (error) {
      log.error("Error caching profile:", error);
    }
  });
}

export async function getCachedProfile(): Promise<CachedProfile | null> {
  try {
    const cached = await storage.getItem(STORAGE_KEYS.PROFILE);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    log.error("Error getting cached profile:", error);
    return null;
  }
}

// ============================================================================
// HISTORY CACHING (Use with caution due to size)
// ============================================================================

export async function cacheHistory(history: any[]): Promise<void> {
  // Fire-and-forget: don't block UI for caching
  InteractionManager.runAfterInteractions(async () => {
    try {
      await storage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      await setCacheTimestamp("history");
    } catch (error) {
      log.error("Error caching history:", error);
    }
  });
}

export async function getCachedHistory(): Promise<any[] | null> {
    try {
        const cached = await storage.getItem(STORAGE_KEYS.HISTORY);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// WATCHLIST CACHING
// ============================================================================

export async function cacheWatchlist(watchlist: any[]): Promise<void> {
  // Fire-and-forget: don't block UI for caching
  InteractionManager.runAfterInteractions(async () => {
    try {
      await storage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(watchlist));
      await setCacheTimestamp("watchlist");
    } catch (error) {
      log.error("Error caching watchlist:", error);
    }
  });
}

export async function getCachedWatchlist(): Promise<any[] | null> {
  try {
    const cached = await storage.getItem(STORAGE_KEYS.WATCHLIST);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    log.error("Error getting cached watchlist:", error);
    return null;
  }
}

// ============================================================================
// ATTENDANCE DRAFTS (OFFLINE CACHING)
// ============================================================================

export async function saveDraftAttendance(slotId: string | number, students: any[]): Promise<void> {
  // Fire-and-forget: drafts must NEVER block touch events
  InteractionManager.runAfterInteractions(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEYS.ATTENDANCE_DRAFTS_PREFIX}${slotId}_${today}`;
      
      // Only save essential data to keep size small
      const draftData = students.map(s => ({
        id: s.id,
        status: s.status,
        timestamp: s.detectedAt || Date.now()
      }));

      await storage.setItem(key, JSON.stringify(draftData));
      // Skip setCacheTimestamp for drafts — timestamps aren't used for draft staleness
    } catch (error) {
      log.error("Error saving draft attendance:", error);
    }
  });
}

export async function getDraftAttendance(slotId: string | number): Promise<any[] | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `${STORAGE_KEYS.ATTENDANCE_DRAFTS_PREFIX}${slotId}_${today}`;
    
    const data = await storage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    log.error("Error getting draft attendance:", error);
    return null;
  }
}

export async function clearDraftAttendance(slotId: string | number): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `${STORAGE_KEYS.ATTENDANCE_DRAFTS_PREFIX}${slotId}_${today}`;
    
    await storage.removeItem(key);
    log.info(`Cleared draft for slot ${slotId}`);
  } catch (error) {
    log.error("Error clearing draft attendance:", error);
  }
}
