/**
 * Shared types for Offline Service
 */

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  // Tier 1 - Essential
  CACHED_ROSTERS: "@attend_me/cached_rosters",
  ROSTER_CACHE_DATE: "@attend_me/roster_cache_date",
  PENDING_SUBMISSIONS: "@attend_me/pending_submissions",
  LAST_SYNC_TIME: "@attend_me/last_sync_time",
  TODAY_SCHEDULE: "@attend_me/today_schedule",
  TIMETABLE: "@attend_me/timetable",
  PROFILE: "@attend_me/profile",

  // Tier 2 - Enhanced
  HISTORY: "@attend_me/history",
  WATCHLIST: "@attend_me/watchlist",
  CLASS_STATS: "@attend_me/class_stats",

  // Metadata
  CACHE_TIMESTAMPS: "@attend_me/cache_timestamps",
  ATTENDANCE_DRAFTS_PREFIX: "@attend_me/drafts/",
};

// ============================================================================
// INTERFACES
// ============================================================================

export interface CachedStudent {
  id: string;
  name: string;
  rollNo: string;
  bluetoothUUID: string | null;
  batch?: number;
}

export interface CachedRoster {
  classId: string;
  slotId: number;
  subjectName: string;
  subjectId?: string;
  section: string;
  students: CachedStudent[];
  cachedAt: string;
}

export interface PendingSubmission {
  id: string;
  sessionId?: string;
  classData: {
    slotId: string;
    subjectName: string;
    section: string;
    dept?: string;
    year?: number;
    sectionLetter?: string;
    subjectId?: string;
    classId?: string;
    batch?: number;
  };
  attendance: {
    studentId: string;
    status: "present" | "absent" | "od" | "leave";
  }[];
  submittedAt: string;
  retryCount: number;
  // Conflict Resolution Fields
  syncStatus?: 'PENDING' | 'CONFLICT' | 'SYNCED' | 'FAILED';
  serverVersion?: any; // To store conflicting server data
  forceSync?: boolean;
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
  day?: string;
  batch?: number | null;
}

export interface CacheTimestamps {
  [key: string]: string; // ISO Date string
}

export interface SyncResult {
    synced: number;
    failed: number;
    conflicts: number;
    errors: string[];
}
