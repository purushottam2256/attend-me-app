import { supabase } from "../../config/supabase";
import { withTimeout } from '../../utils/withTimeout';
import { syncMutex } from '../../utils/syncMutex';
import { 
  PendingSubmission, 
  SyncResult, 
  SyncStatus, 
  STORAGE_KEYS,
  CachedRoster,
  CachedStudent
} from "./types";
import { 
  getPendingSubmissions, 
  removePendingSubmission, 
  getPendingCount,
  queueSubmission 
} from "./queue";
import { getStorage } from "./storage";
import { 
    cacheRoster, 
    cacheAllRosters, 
    setCacheTimestamp, 
    getCacheTimestamp,
    isCacheValid,
    getCachedRostersMap,
    purgeStaleRosters,
} from "./cache";
import createLogger from '../../utils/logger';

const storage = getStorage();
const log = createLogger('OfflineSync');

/** Yield to the JS event loop so touch events can process — zero delay, maximum responsiveness */
function yieldToUI(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================================================
// STATUS UTILS
// ============================================================================

export async function getSyncStatus(rosterExpiryHours = 24): Promise<SyncStatus> {
  const lastSyncTimeStr = await storage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
  const pendingCount = await getPendingCount();

  let isExpired = true;
  if (lastSyncTimeStr) {
    const lastSync = new Date(lastSyncTimeStr);
    const hours = (new Date().getTime() - lastSync.getTime()) / (1000 * 60 * 60);
    isExpired = hours > rosterExpiryHours;
  }

  return {
    lastSyncTime: lastSyncTimeStr,
    pendingCount,
    isExpired,
  };
}

// ============================================================================
// UPLOAD SYNC (Pending Submissions)
// ============================================================================

export async function syncPendingSubmissions(): Promise<SyncResult> {
  const result = await syncMutex.run(() => _syncPendingSubmissions());
  return result ?? { synced: 0, failed: 0, conflicts: 0, errors: ['Skipped — another sync is running'] };
}

async function _syncPendingSubmissions(): Promise<SyncResult> {
  const pending = await getPendingSubmissions();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, conflicts: 0, errors: [] };
  }

  log.info(`Processing ${pending.length} pending submissions...`);
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { synced: 0, failed: 0, conflicts: 0, errors: ["No user logged in"] };

  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  const errors: string[] = [];

  for (const submission of pending) {
    if (submission.syncStatus === 'CONFLICT') {
        conflicts++;
        continue;
    }

    try {
      // VALIDATION
      if (!submission.attendance || !Array.isArray(submission.attendance) || submission.attendance.length === 0) {
        log.error('Corrupt submission, removing:', submission.id);
        await removePendingSubmission(submission.id);
        failed++;
        continue;
      }

      const { slotId } = submission.classData;
      const sessionDate = submission.submittedAt.split("T")[0];
      
      const presentCount = submission.attendance.filter((a) => a.status === "present").length;
      const absentCount = submission.attendance.filter((a) => a.status === "absent").length;
      const odCount = submission.attendance.filter((a) => a.status === "od").length;
      const leaveCount = submission.attendance.filter((a) => a.status === "leave").length;
      const totalStudents = submission.attendance.length;

      // OVERWRITE LOGIC (User requested removal of conflict system)
      // Always delete existing session for this slot/date to ensure client data takes precedence.
      // Foreign key cascades should handle log cleanup if configured, otherwise we risk orphaned logs 
      // (but assuming cascade or just leaving them for now as per previous forceSync logic).
      
      const { error: deleteError } = await withTimeout(
        supabase
          .from('attendance_sessions')
          .delete()
          .eq('faculty_id', user.id)
          .eq('date', sessionDate)
          .eq('slot_id', slotId),
        10000,
        'sync:deleteExisting',
      );

      if (deleteError) {
          log.error('Failed to clear existing session for overwrite:', deleteError);
          // We continue to try insert, or throw? 
          // If delete fails, insert might duplicate if no unique constraint.
          // Let's throw to be safe and retry later.
          throw deleteError;
      }


      // SELF-HEALING: Check for missing subjectId
      let finalSubjectId = submission.classData.subjectId;
      if (!finalSubjectId && submission.classData.subjectName) {
        // Try to find subject by name for this faculty
        const { data: subj } = await withTimeout(
          supabase
            .from('subjects')
            .select('id')
            .ilike('name', submission.classData.subjectName)
            .maybeSingle(),
          10000,
          'sync:lookupSubject',
        ); // might be ambiguous if multiple faculties same subject name, but subjects usually global or mapped
        
        // Better: check master_timetables for this faculty + subject name
        const { data: classWithSubj } = await supabase
           .from('master_timetables')
           .select('subject_id')
           .eq('faculty_id', user.id)
           .eq('target_dept', submission.classData.dept || '')
           .eq('target_section', submission.classData.section || '')
           .maybeSingle();

        if (classWithSubj?.subject_id) {
           finalSubjectId = classWithSubj.subject_id;
           log.info('Self-healed subject_id:', finalSubjectId);
        } else if (subj?.id) {
           finalSubjectId = subj.id;
        }
      }

      if (!finalSubjectId) {
         throw new Error(`Missing Subject ID for ${submission.classData.subjectName} and could not resolve it.`);
      }

      // INSERT
      const { data: session, error: sessionError } = await withTimeout(
        supabase
          .from("attendance_sessions")
          .insert({
            faculty_id: user.id,
            date: sessionDate,
            slot_id: slotId || '0',
            subject_id: finalSubjectId,
            target_dept: submission.classData.dept || submission.classData.classId?.split("-")[0],
            target_section: submission.classData.section,
            target_year: submission.classData.year || 1,
            batch: submission.classData.batch,
            present_count: presentCount,
            absent_count: absentCount,
            od_count: odCount,
            leave_count: leaveCount,
            total_students: totalStudents,
            start_time: submission.submittedAt,
            end_time: submission.submittedAt,
            is_synced: true,
            synced_at: new Date().toISOString(),
          })
          .select()
          .single(),
        15000,
        'sync:insertSession',
      );

      if (sessionError) throw sessionError;

      // LOGS
      const logs = submission.attendance.map((a) => ({
        session_id: session.id,
        student_id: a.studentId,
        status: a.status,
        marked_at: submission.submittedAt,
        is_manual: true,
      }));

      const { error: logsError } = await withTimeout(
        supabase.from("attendance_logs").insert(logs),
        15000,
        'sync:insertLogs',
      );

      if (logsError) throw logsError;

      // SUCCESS
      await removePendingSubmission(submission.id);
      synced++;

    } catch (err: any) {
      log.error('Sync failed for item:', submission.id, JSON.stringify(err));
      
      const isNetworkError = 
        err.message?.includes('Network request failed') || 
        err.message?.includes('fetch') ||
        err.message?.includes('network') ||
        err.code === 'PGRST000'; // Postgrest connection error rarely triggers this code client info but checking anyway

      if (isNetworkError) {
         log.info('Network error, skipping retry increment.');
         // Do NOT increment retry count, just keep in queue
         // We do not modify submission, so it stays as is.
         failed++;
         errors.push('Network Error');
         continue; 
      }

      failed++;
      errors.push(err.message || 'Unknown Error');
      
      submission.retryCount = (submission.retryCount || 0) + 1;
      if (submission.retryCount > 5) {
          log.error('Max retries reached, removing:', submission.id);
          // Optional: Move to "Dead Letter Queue" instead of deleting?
          // For now, delete to clear queue.
          await removePendingSubmission(submission.id);
      } else {
          await queueSubmission(submission);
      }
    }
  }

  return { synced, failed, conflicts, errors };
}

// ============================================================================
// DOWNLOAD SYNC (Rosters)
// ============================================================================

export async function syncRosters(
  facultyId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  const result = await syncMutex.run(() => _syncRosters(facultyId));
  return result ?? { success: false, count: 0, error: 'Skipped — another sync is running' };
}

async function _syncRosters(
  facultyId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    log.info("Starting Smart Roster Sync...");

    // 1. Fetch Classes
    const { data: classData, error: classError } = await withTimeout(
      supabase
        .from("master_timetables")
        .select(`
          target_dept,
          target_year,
          target_section,
          subjects:subject_id (name)
        `)
        .eq("faculty_id", facultyId)
        .eq("is_active", true),
      10000,
      'syncRosters:fetchClasses',
    );

    if (classError) {
      log.error("Error fetching classes:", classError);
      return { success: false, count: 0, error: classError.message };
    }

    // Deduplicate
    const uniqueClasses = new Map<string, any>();
    (classData || []).forEach((item: any) => {
      const key = `${item.target_dept}-${item.target_year}-${item.target_section}`;
      if (!uniqueClasses.has(key)) {
        uniqueClasses.set(key, {
          target_dept: item.target_dept,
          target_year: item.target_year,
          target_section: item.target_section,

          subject_name: item.subjects?.name || "Class",
          subject_id: item.subjects?.id,
        });
      }
    });

    const allClasses = Array.from(uniqueClasses.values());
    log.info(`Found ${allClasses.length} unique classes to sync.`);

    if (!allClasses || allClasses.length === 0) {
      log.info("No classes found to sync.");
      return { success: true, count: 0 };
    }

    const validKeys: string[] = [];
    allClasses.forEach(cls => {
        const key = `${cls.target_dept}-${cls.target_year}-${cls.target_section}`;
        validKeys.push(key);
    });
    
    // NATIVE SQLITE GARBAGE COLLECTION
    // Tell the cache layer to instantly purge any rosters not in this valid list.
    await purgeStaleRosters(validKeys);
    
    // 3. Sync and Update
    let updatedCount = 0;
    const syncedRosters: any[] = [];
    
    for (const cls of allClasses) {
      // Yield to JS event loop between network calls so touches stay responsive
      await yieldToUI();

      const classKey = `${cls.target_dept}-${cls.target_year}-${cls.target_section}`;

      // Optimization: if cache is very fresh (<1h), maybe skip?
      // For now, force fetch to ensure accuracy.

      const { data: students, error } = await withTimeout(
        supabase
          .from("students")
          .select("id, name:full_name, roll_number:roll_no, bluetooth_uuid, batch")
          .eq("dept", cls.target_dept)
          .eq("year", cls.target_year)
          .eq("section", cls.target_section)
          .order("roll_no"),
        10000,
        `syncRosters:fetchStudents(${classKey})`,
      );

      if (error) {
        log.error(`Failed to sync roster: ${classKey}`, error);
        continue;
      }
      
      // Yield again before array processing
      await yieldToUI();

      syncedRosters.push({
        classId: classKey,
        slotId: 0, 
        subjectName: cls.subject_name,
        subjectId: cls.subject_id,
        section: `${cls.target_dept}-${cls.target_year}-${cls.target_section}`,
        students: (students || []).map((s: any) => ({
          id: s.id,
          name: s.name, 
          rollNo: s.roll_number,
          bluetoothUUID: s.bluetooth_uuid,
          batch: s.batch,
        })),
        cachedAt: new Date().toISOString(),
      });

      updatedCount++;
    }

    // 4. Save Final Map (Merged & GC'd)
    if (updatedCount > 0) {
        await cacheAllRosters(syncedRosters);
        await storage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString());
    }

    return { success: true, count: updatedCount };

  } catch (error: any) {
    log.error("Roster sync failed:", error);
    return { success: false, count: 0, error: error.message };
  }
}
