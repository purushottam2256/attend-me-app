import { 
  CachedRoster, 
  CachedProfile, 
  CachedScheduleSlot, 
  CacheTimestamps,
  STORAGE_KEYS 
} from "./types";
import { getStorage } from "./storage";
import createLogger from '../../utils/logger';

const storage = getStorage();
const log = createLogger('OfflineCache');

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
 * Get the raw roster map from storage (Backward Compatibility: Storage is Object, not Array)
 */
export async function getCachedRostersMap(): Promise<Record<string, CachedRoster>> {
  try {
    const data = await storage.getItem(STORAGE_KEYS.CACHED_ROSTERS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    log.error("Error getting roster map:", error);
    return {};
  }
}

export async function cacheRoster(roster: CachedRoster): Promise<void> {
  try {
    const map = await getCachedRostersMap();
    map[roster.classId] = roster;
    
    await storage.setItem(STORAGE_KEYS.CACHED_ROSTERS, JSON.stringify(map));
    await setCacheTimestamp("rosters");
    log.info(`Cached roster for ${roster.subjectName} (${roster.students.length} students)`);
  } catch (error) {
    log.error("Error caching roster:", error);
  }
}

/**
 * Bulk cache rosters (replaces entire map or merges?)
 * The sync logic usually rebuilds valid rosters. We'll accept a Map or Array.
 * If Array, we convert to Map.
 */
export async function cacheAllRosters(rosters: CachedRoster[] | Record<string, CachedRoster>): Promise<void> {
  try {
    let map: Record<string, CachedRoster> = {};
    
    if (Array.isArray(rosters)) {
      rosters.forEach(r => map[r.classId] = r);
    } else {
      map = rosters;
    }

    await storage.setItem(STORAGE_KEYS.CACHED_ROSTERS, JSON.stringify(map));
    await setCacheTimestamp("rosters");
    log.info(`Cached ${Object.keys(map).length} rosters in bulk`);
  } catch (error) {
    log.error("Error bulk caching rosters:", error);
  }
}

export async function getCachedRosters(): Promise<CachedRoster[]> {
  const map = await getCachedRostersMap();
  return Object.values(map);
}

export async function getCachedRosterResponse(classId: string): Promise<CachedRoster | undefined> {
  const map = await getCachedRostersMap();
  return map[classId];
}

/**
 * Alias for getCachedRosterResponse to fix import errors / inconsistency
 */
export async function getCachedRoster(classId: string): Promise<CachedRoster | undefined> {
  return getCachedRosterResponse(classId);
}

/**
 * Find a cached roster by class details (Department, Year, Section).
 * This is the reliable way to look up rosters since slot IDs change but class identity is constant.
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

// ============================================================================
// SCHEDULE / TIMETABLE CACHING
// ============================================================================

export async function cacheTodaySchedule(schedule: CachedScheduleSlot[]): Promise<void> {
  try {
    await storage.setItem(
      STORAGE_KEYS.TODAY_SCHEDULE,
      JSON.stringify(schedule),
    );
    await setCacheTimestamp("today_schedule");
    log.info("Cached today's schedule:", schedule.length, "slots");
  } catch (error) {
    log.error("Error caching today's schedule:", error);
  }
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
  try {
    const data = { ...profile, cachedAt: new Date().toISOString() };
    await storage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(data));
    await setCacheTimestamp("profile");
    log.info("Cached profile for:", profile.full_name);
  } catch (error) {
    log.error("Error caching profile:", error);
  }
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
    try {
        // Limit history size? Maybe top 50?
        // For now, full cache as per implementation plan
        await storage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
        await setCacheTimestamp("history");
    } catch (error) {
        log.error("Error caching history:", error);
    }
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
  try {
    await storage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(watchlist));
    await setCacheTimestamp("watchlist");
    log.info("Cached watchlist:", watchlist.length, "students");
  } catch (error) {
    log.error("Error caching watchlist:", error);
  }
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
    await setCacheTimestamp(`draft_${slotId}`);
    log.info(`Saved draft for slot ${slotId} (${draftData.length} students)`);
  } catch (error) {
    log.error("Error saving draft attendance:", error);
  }
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
