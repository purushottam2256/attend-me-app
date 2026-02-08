/**
 * Offline Service - Comprehensive Offline Support
 * 
 * Features:
 * - Tier 1: Timetable, Profile, Today's Schedule, Rosters, Submissions
 * - Tier 2: History, Watchlist, Class Stats
 * - Auto-sync pending submissions when online
 * - Cache staleness detection
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';


// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  // Tier 1 - Essential
  CACHED_ROSTERS: '@attend_me/cached_rosters',
  ROSTER_CACHE_DATE: '@attend_me/roster_cache_date',
  PENDING_SUBMISSIONS: '@attend_me/pending_submissions',
  LAST_SYNC_TIME: '@attend_me/last_sync_time',
  TODAY_SCHEDULE: '@attend_me/today_schedule',
  TIMETABLE: '@attend_me/timetable',
  PROFILE: '@attend_me/profile',
  
  // Tier 2 - Enhanced
  HISTORY: '@attend_me/history',
  WATCHLIST: '@attend_me/watchlist',
  CLASS_STATS: '@attend_me/class_stats',
  
  // Metadata
  CACHE_TIMESTAMPS: '@attend_me/cache_timestamps',
};

// ============================================================================
// TYPES
// ============================================================================

export interface CachedRoster {
  classId: string;
  slotId: number;
  subjectName: string;
  section: string;
  students: CachedStudent[];
  cachedAt: string;
}

export interface CachedStudent {
  id: string;
  name: string;
  rollNo: string;
  bluetoothUUID: string | null;
  batch?: number;
}

export interface PendingSubmission {
  id: string;
  sessionId?: string;
  classData: {
    slotId: number;
    subjectName: string;
    section: string;
    dept?: string;
    year?: number;
    sectionLetter?: string;
    subjectId?: string;
  };
  attendance: {
    studentId: string;
    status: 'present' | 'absent' | 'od' | 'leave';
  }[];
  submittedAt: string;
  retryCount: number;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  pendingCount: number;
  isExpired: boolean;
}

export interface CachedProfile {
  id: string;
  full_name: string;
  email: string;
  department?: string;
  avatar_url?: string;
  role?: string;
  notifications_enabled?: boolean;
  cachedAt: string;
}

export interface CachedScheduleSlot {
  slot_id: string | number;
  start_time: string;
  end_time: string;
  subject?: { id?: string; name: string; code?: string };
  room?: string;
  target_dept?: string;
  target_year?: number;
  target_section?: string;
  status?: string;
}

export interface CachedHistorySession {
  id: string;
  date: string;
  slot_id: string;
  subject_name: string;
  section: string;
  present_count: number;
  absent_count: number;
  total_students: number;
  created_at: string;
}

export interface CachedWatchlistStudent {
  student_id: string;
  full_name: string;
  roll_no: string;
  attendance_percentage: number;
}

interface CacheTimestamps {
  [key: string]: string;
}

// ============================================================================
// CACHE TIMESTAMP UTILITIES
// ============================================================================

async function setCacheTimestamp(key: string): Promise<void> {
  try {
    const timestamps = await getCacheTimestamps();
    timestamps[key] = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEYS.CACHE_TIMESTAMPS, JSON.stringify(timestamps));
  } catch (error) {
    console.error('[OfflineService] Error setting cache timestamp:', error);
  }
}

async function getCacheTimestamps(): Promise<CacheTimestamps> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_TIMESTAMPS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export async function getCacheTimestamp(key: string): Promise<Date | null> {
  const timestamps = await getCacheTimestamps();
  return timestamps[key] ? new Date(timestamps[key]) : null;
}

export async function isCacheStale(key: string, maxAgeHours: number): Promise<boolean> {
  const timestamp = await getCacheTimestamp(key);
  if (!timestamp) return true;
  
  const ageMs = Date.now() - timestamp.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours > maxAgeHours;
}

export async function getCacheAge(key: string): Promise<string> {
  const timestamp = await getCacheTimestamp(key);
  if (!timestamp) return 'Never synced';
  
  const ageMs = Date.now() - timestamp.getTime();
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours}h ago`;
  
  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays}d ago`;
}

// ============================================================================
// TIER 1: ROSTER CACHING
// ============================================================================



export async function getCachedRoster(slotId: number, dept?: string, year?: number, section?: string): Promise<CachedRoster | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_ROSTERS);
    if (!cached) return null;
    
    const rosters = JSON.parse(cached) as { [key: string]: CachedRoster };
    
    // First try legacy key (slot based) for backward compatibility
    if (rosters[String(slotId)]) return rosters[String(slotId)];

    // Try new smart key (class based)
    if (dept && year && section) {
      const classKey = `${dept}-${year}-${section}`;
      if (rosters[classKey]) return rosters[classKey];
    }
    
    return null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached roster:', error);
    return null;
  }
}

/**
 * Smart Sync: Caches rosters for ALL unique classes a faculty teaches.
 * Runs on startup/pull-to-refresh to ensure offline availability.
 */
export async function syncRosters(facultyId: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    console.log('[OfflineService] Starting Smart Roster Sync...');
    
    // 1. Get all unique classes (Dept-Year-Sec)
    // Inline logical to avoid circular dependency with dashboardService
    const { data: classData, error: classError } = await supabase
      .from('master_timetables')
      .select(`
        target_dept,
        target_year,
        target_section,
        subjects:subject_id (name)
      `)
      .eq('faculty_id', facultyId)
      .eq('is_active', true);

    if (classError) {
        console.error('[OfflineService] Error fetching classes for roster sync:', classError);
        return { success: false, count: 0, error: classError.message };
    }

    // Deduplicate based on Dept-Year-Section key
    const uniqueClasses = new Map<string, any>();
    (classData || []).forEach((item: any) => {
      const key = `${item.target_dept}-${item.target_year}-${item.target_section}`;
      if (!uniqueClasses.has(key)) {
        uniqueClasses.set(key, {
            target_dept: item.target_dept,
            target_year: item.target_year,
            target_section: item.target_section,
            subject_name: item.subjects?.name || 'Class'
        });
      }
    });
    
    const allClasses = Array.from(uniqueClasses.values());
    console.log(`[OfflineService] Found ${allClasses.length} unique classes to sync.`);
    
    if (!allClasses || allClasses.length === 0) {
      console.log('[OfflineService] No classes found to sync.');
      return { success: true, count: 0 };
    }

    // 2. Load existing cache
    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_ROSTERS);
    const cachedRosters: { [key: string]: CachedRoster } = cachedRaw ? JSON.parse(cachedRaw) : {};
    
    let updatedCount = 0;
    const newCacheKeys = new Set<string>();

    // 3. Sync each class
    for (const cls of allClasses) {
      const classKey = `${cls.target_dept}-${cls.target_year}-${cls.target_section}`;
      newCacheKeys.add(classKey);

      // Simple optimization: If we have it and it's less than 24h old, skip detailed fetch unless forced?
      // For now, we'll just fetch to ensure accuracy as student lists are small.
      // In future: compare hash or last_updated.
      
      const { data: students, error } = await supabase
        .from('students')
        .select('id, name:full_name, roll_number:roll_no, bluetooth_uuid, batch')
        .eq('dept', cls.target_dept)
        .eq('year', cls.target_year)
        .eq('section', cls.target_section)
        .order('roll_no');
      
      if (error) {
        console.error(`[OfflineService] Failed to sync roster: ${classKey}`, JSON.stringify(error));
        continue; // Keep existing if fail?
      }

      cachedRosters[classKey] = {
        classId: classKey,
        slotId: 0, // Not tied to a specific slot anymore
        subjectName: cls.subject_name,
        section: `${cls.target_dept}-${cls.target_year}-${cls.target_section}`,
        students: (students || []).map(s => ({
          id: s.id,
          name: s.name,  // Now mapped correctly via alias
          rollNo: s.roll_number, // Mapped via alias
          bluetoothUUID: s.bluetooth_uuid,
          batch: s.batch,
        })),
        cachedAt: new Date().toISOString(),
      };
      
      updatedCount++;
    }
    
    // 4. Garbage Collection: Remove rosters for classes no longer in timetable
    // Keep legacy slot-based keys if needed, or migration strategy?
    // We will keep keys that match the new format ONLY if they are in newCacheKeys.
    // For safety, we might keep "extra" keys for a while, but let's be clean.
    
    Object.keys(cachedRosters).forEach(key => {
        // If it looks like a class key (contains dashes) and not in current schedule, delete it
        if (key.includes('-') && !newCacheKeys.has(key) && isNaN(Number(key))) {
            delete cachedRosters[key];
            console.log('[OfflineService] Pruned obsolete roster:', key);
        }
    });
    
    await AsyncStorage.setItem(STORAGE_KEYS.CACHED_ROSTERS, JSON.stringify(cachedRosters));
    await AsyncStorage.setItem(STORAGE_KEYS.ROSTER_CACHE_DATE, new Date().toISOString().split('T')[0]);
    await setCacheTimestamp('rosters');
    
    console.log(`[OfflineService] Smart Sync Complete. Updated: ${updatedCount}, Total Cached: ${Object.keys(cachedRosters).length}`);
    return { success: true, count: updatedCount };

  } catch (error) {
    console.error('[OfflineService] Error in smart roster sync:', error);
    return { success: false, count: 0, error: String(error) };
  }
}

// Legacy function - kept for compatibility but redirecting or deprecating?
export async function cacheAllRosters(
  schedule: Array<{ slot_id: number; subject?: { name: string }; target_dept: string; target_year: number; target_section: string }>
): Promise<{ success: boolean; count: number; error?: string }> {
    // We can just use the new system, or keep this for specific slot caching if needed.
    // Ideally, we replace its usage with syncRosters.
    return { success: true, count: 0 }; 
}

export async function isCacheValid(): Promise<boolean> {
  try {
    const cacheDate = await AsyncStorage.getItem(STORAGE_KEYS.ROSTER_CACHE_DATE);
    if (!cacheDate) return false;
    
    const today = new Date().toISOString().split('T')[0];
    return cacheDate === today;
  } catch {
    return false;
  }
}

// ============================================================================
// TIER 1: TODAY'S SCHEDULE CACHING
// ============================================================================

export async function cacheTodaySchedule(schedule: CachedScheduleSlot[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TODAY_SCHEDULE, JSON.stringify({
      date: new Date().toISOString().split('T')[0],
      slots: schedule,
    }));
    await setCacheTimestamp('todaySchedule');
    console.log('[OfflineService] Cached today\'s schedule:', schedule.length, 'slots');
  } catch (error) {
    console.error('[OfflineService] Error caching today schedule:', error);
  }
}

export async function getCachedTodaySchedule(): Promise<CachedScheduleSlot[] | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.TODAY_SCHEDULE);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const today = new Date().toISOString().split('T')[0];
    
    // Return cached data even if stale (will show warning in UI)
    return data.slots || null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached schedule:', error);
    return null;
  }
}

// ============================================================================
// TIER 1: TIMETABLE CACHING (Full Week)
// ============================================================================

export async function cacheTimetable(timetable: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(timetable));
    await setCacheTimestamp('timetable');
    console.log('[OfflineService] Cached timetable:', timetable.length, 'entries');
  } catch (error) {
    console.error('[OfflineService] Error caching timetable:', error);
  }
}

export async function getCachedTimetable(): Promise<any[] | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.TIMETABLE);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached timetable:', error);
    return null;
  }
}

// ============================================================================
// TIER 1: PROFILE CACHING
// ============================================================================

export async function cacheProfile(profile: CachedProfile): Promise<void> {
  try {
    const data = { ...profile, cachedAt: new Date().toISOString() };
    await AsyncStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(data));
    await setCacheTimestamp('profile');
    console.log('[OfflineService] Cached profile for:', profile.full_name);
  } catch (error) {
    console.error('[OfflineService] Error caching profile:', error);
  }
}

export async function getCachedProfile(): Promise<CachedProfile | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached profile:', error);
    return null;
  }
}

// ============================================================================
// TIER 2: HISTORY CACHING
// ============================================================================

export async function cacheHistory(sessions: CachedHistorySession[]): Promise<void> {
  try {
    // Keep only last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentSessions = sessions.filter(s => new Date(s.date) >= sevenDaysAgo);
    
    await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(recentSessions));
    await setCacheTimestamp('history');
    console.log('[OfflineService] Cached history:', recentSessions.length, 'sessions');
  } catch (error) {
    console.error('[OfflineService] Error caching history:', error);
  }
}

export async function getCachedHistory(): Promise<CachedHistorySession[] | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached history:', error);
    return null;
  }
}

// ============================================================================
// TIER 2: WATCHLIST CACHING
// ============================================================================

export async function cacheWatchlist(students: CachedWatchlistStudent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(students));
    await setCacheTimestamp('watchlist');
    // console.log('[OfflineService] Cached watchlist:', students.length, 'students');
  } catch (error) {
    console.error('[OfflineService] Error caching watchlist:', error);
  }
}

export async function getCachedWatchlist(): Promise<CachedWatchlistStudent[] | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLIST);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('[OfflineService] Error getting cached watchlist:', error);
    return null;
  }
}

// ============================================================================
// SUBMISSION QUEUE
// ============================================================================

export async function queueSubmission(submission: Omit<PendingSubmission, 'id' | 'retryCount'>): Promise<string> {
  try {
    const pendingStr = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SUBMISSIONS);
    const pending: PendingSubmission[] = pendingStr ? JSON.parse(pendingStr) : [];
    
    const newSubmission: PendingSubmission = {
      ...submission,
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      retryCount: 0,
    };
    
    pending.push(newSubmission);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(pending));
    
    console.log('[OfflineService] Queued submission:', newSubmission.id);
    return newSubmission.id;
  } catch (error) {
    console.error('[OfflineService] Error queuing submission:', error);
    throw error;
  }
}

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  try {
    const pendingStr = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SUBMISSIONS);
    return pendingStr ? JSON.parse(pendingStr) : [];
  } catch {
    return [];
  }
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingSubmissions();
  return pending.length;
}

export async function syncPendingSubmissions(): Promise<{ synced: number; failed: number }> {
  try {
    const pending = await getPendingSubmissions();
    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }
    
    console.log('[OfflineService] Syncing', pending.length, 'pending submissions');
    
    let synced = 0;
    let failed = 0;
    const remaining: PendingSubmission[] = [];
    
    for (const submission of pending) {
      try {
        // Get user for faculty_id
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        
        // FAILSAFE: If subject_id is missing (legacy offline data), try to find it
        let subjectId = submission.classData.subjectId;
        if (!subjectId) {
            console.log('[OfflineService] subject_id missing, attempting lookup...');
            const { data: subject } = await supabase
                .from('subjects')
                .select('id')
                .eq('name', submission.classData.subjectName)
                .eq('dept', submission.classData.dept)
                .eq('year', submission.classData.year)
                .single();
            
            if (subject) {
                subjectId = subject.id;
            } else {
                console.error('[OfflineService] Could not find subject for legacy submission:', submission.classData.subjectName);
                // We cannot insert without subject_id due to foreign key constraint. Use a safe fallback or skip?
                // Let's try to fetch ANY subject for this class as a last resort to save the data
                 const { data: fallbackSubject } = await supabase
                    .from('master_timetables')
                    .select('subject_id')
                    .eq('target_dept', submission.classData.dept)
                    .eq('target_year', submission.classData.year)
                    .eq('target_section', submission.classData.sectionLetter)
                    .limit(1)
                    .single();
                 if (fallbackSubject) subjectId = fallbackSubject.subject_id;
            }
        }

        if (!subjectId) {
             console.error('[OfflineService] Fatal: No subject_id found. Skipping this submission to prevent crash.');
             // Skip this one but don't count as failed so it gets removed? Or count as failed?
             // If we leave it, it blocks everything. Better to delete it or move to "quarantine".
             // For now, let's treat as failed but maybe we need a way to clear it.
             throw new Error('Missing subject_id - Metadata corrupted');
        }

        // Create session first
        const { data: session, error: sessionError } = await supabase
          .from('attendance_sessions')
          .insert({
            faculty_id: user.id,
            slot_id: submission.classData.slotId || 0, // Fallback to 0 if missing (manual/extra class)
            date: submission.submittedAt.split('T')[0],
            date: submission.submittedAt.split('T')[0],
            subject_id: subjectId,
            target_dept: submission.classData.dept,
            target_year: submission.classData.year,
            target_section: submission.classData.sectionLetter,
            start_time: submission.submittedAt,
            // is_offline_sync: true, // Column missing in DB schema
          })
          .select()
          .single();
        
        if (sessionError) throw sessionError;
        
        // Insert attendance logs
        const logs = submission.attendance.map(a => ({
          session_id: session.id,
          student_id: a.studentId,
          status: a.status,
          recorded_at: submission.submittedAt,
        }));
        
        const { error: logError } = await supabase
          .from('attendance_logs')
          .insert(logs);
        
        if (logError) throw logError;
        
        // Update session counts
        const presentCount = submission.attendance.filter(r => r.status === 'present').length;
        const absentCount = submission.attendance.filter(r => r.status === 'absent').length;
        const odCount = submission.attendance.filter(r => r.status === 'od').length;
        const leaveCount = submission.attendance.filter(r => r.status === 'leave').length;
        
        await supabase
          .from('attendance_sessions')
          .update({
            present_count: presentCount,
            absent_count: absentCount,
            od_count: odCount,
            leave_count: leaveCount,
            end_time: new Date().toISOString(),
            is_synced: true,
            synced_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        
        synced++;
      } catch (err) {
        console.error('[OfflineService] Submission sync failed:', err);
        submission.retryCount += 1;
        if (submission.retryCount < 3) {
          remaining.push(submission);
        }
        failed++;
      }
    }
    
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(remaining));
    
    console.log('[OfflineService] Sync complete:', { synced, failed, remaining: remaining.length });
    return { synced, failed };
  } catch (error) {
    console.error('[OfflineService] Sync error:', error);
    return { synced: 0, failed: 0 };
  }
}

export async function removePendingSubmission(submissionId: string): Promise<void> {
  try {
    const pending = await getPendingSubmissions();
    const filtered = pending.filter(p => p.id !== submissionId);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OfflineService] Error removing submission:', error);
  }
}

// ============================================================================
// SYNC STATUS
// ============================================================================

export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
    const pendingCount = await getPendingCount();
    const isExpired = !(await isCacheValid());
    
    return {
      lastSyncTime: lastSync,
      pendingCount,
      isExpired,
    };
  } catch {
    return {
      lastSyncTime: null,
      pendingCount: 0,
      isExpired: true,
    };
  }
}

// ============================================================================
// CACHE ALL DATA (Call when online)
// ============================================================================

export async function cacheAllData(userId: string): Promise<{ success: boolean; cached: string[] }> {
  const cached: string[] = [];
  
  try {
    // Cache profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profile) {
      await cacheProfile(profile);
      cached.push('profile');
    }
    
    // Cache timetable
    const { data: timetable } = await supabase
      .from('master_timetables')
      .select('*, subjects:subject_id(id, name, code)')
      .eq('faculty_id', userId)
      .eq('is_active', true);
    
    if (timetable) {
      // Map 'subjects' to 'subject' to match TimetableSlot interface if needed
      const mappedTimetable = timetable.map((t: any) => ({
        ...t,
        subject: t.subjects
      }));
      await cacheTimetable(mappedTimetable);
      cached.push('timetable');
    }
    
    console.log('[OfflineService] Cached all data:', cached);
    return { success: true, cached };
  } catch (error) {
    console.error('[OfflineService] Error caching all data:', error);
    return { success: false, cached };
  }
}

// ============================================================================
// CLEAR DATA
// ============================================================================

export async function clearOfflineData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    console.log('[OfflineService] Cleared all offline data');
  } catch (error) {
    console.error('[OfflineService] Error clearing data:', error);
  }
}

