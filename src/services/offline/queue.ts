import { PendingSubmission, STORAGE_KEYS } from "./types";
import { getStorage, getSqliteDb, SQLiteStorageAdapter } from "./storage";
import createLogger from '../../utils/logger';

const log = createLogger('OfflineQueue');

/**
 * Get all pending submissions from local storage or SQLite table
 */
export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const storage = getStorage();
  
  if (storage instanceof SQLiteStorageAdapter) {
    try {
      const db = await getSqliteDb();
      const rows = await db.getAllAsync<{ data: string }>(
        'SELECT data FROM pending_submissions ORDER BY created_at ASC'
      );
      return rows.map((row: { data: string }) => JSON.parse(row.data));
    } catch (error) {
      log.error("Error getting pending submissions from SQLite:", error);
      return [];
    }
  }

  // Legacy / AsyncStorage Fallback
  try {
    const json = await storage.getItem(STORAGE_KEYS.PENDING_SUBMISSIONS);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    log.error("Error getting pending submissions:", error);
    return [];
  }
}

/**
 * Add a new submission to the queue.
 * Handles deduplication by replacing existing submissions for the same slot/date.
 */
export async function queueSubmission(submission: PendingSubmission): Promise<void> {
  const storage = getStorage();

  if (storage instanceof SQLiteStorageAdapter) {
    try {
      const db = await getSqliteDb();
      const newDate = submission.submittedAt.split("T")[0];
      const newSlot = submission.classData.slotId;
      
      await db.withTransactionAsync(async () => {
         // Delete conflicting (deduplication) using optimized columns
         // This avoids fetching all rows and filtering in JS.
         await db.runAsync(
             'DELETE FROM pending_submissions WHERE slot_id = ? AND date = ?',
             [String(newSlot), newDate]
         );
         
         // Insert new submission
         await db.runAsync(
             'INSERT OR REPLACE INTO pending_submissions (id, data, slot_id, date, created_at) VALUES (?, ?, ?, ?, ?)',
             [
                 submission.id, 
                 JSON.stringify(submission), 
                 String(newSlot), 
                 newDate, 
                 new Date().toISOString()
             ]
         );
      });

      log.info(`Submission queued in SQLite table for slot ${newSlot} on ${newDate}.`);
      return;
    } catch (error) {
      log.error("Error queueing submission to SQLite:", error);
      throw error;
    }
  }

  // Legacy / AsyncStorage Logic
  try {
    let pending = await getPendingSubmissions();

    // DEDUPLICATION / OVERRIDE LOGIC
    const newDate = submission.submittedAt.split("T")[0];
    const newSlot = submission.classData.slotId;
    
    const initialCount = pending.length;
    pending = pending.filter((p) => {
      const pDate = p.submittedAt.split("T")[0];
      return !(p.classData.slotId === newSlot && pDate === newDate);
    });

    if (pending.length < initialCount) {
      log.info(`Replaced ${initialCount - pending.length} existing queued submission(s) for slot ${newSlot} on ${newDate}`);
    }

    pending.push(submission);
    await storage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(pending));
    log.info("Submission queued. Total pending:", pending.length);
  } catch (error) {
    log.error("Error queueing submission:", error);
    throw error;
  }
}

/**
 * Remove a specific submission from the queue by ID
 */
export async function removePendingSubmission(id: string): Promise<void> {
  const storage = getStorage();

  if (storage instanceof SQLiteStorageAdapter) {
      try {
          const db = await getSqliteDb();
          await db.runAsync('DELETE FROM pending_submissions WHERE id = ?', [id]);
          return;
      } catch (error) {
          log.error("Error removing submission from SQLite:", error);
      }
  }

  // Legacy
  try {
    const pending = await getPendingSubmissions();
    const filtered = pending.filter((p) => p.id !== id);
    await storage.setItem(STORAGE_KEYS.PENDING_SUBMISSIONS, JSON.stringify(filtered));
  } catch (error) {
    log.error("Error removing submission:", error);
  }
}

/**
 * Clear all pending submissions (Risk: Data Loss if not synced)
 */
export async function clearPendingSubmissions(): Promise<void> {
  const storage = getStorage();

  if (storage instanceof SQLiteStorageAdapter) {
      try {
          const db = await getSqliteDb();
          await db.runAsync('DELETE FROM pending_submissions');
          log.info("Cleared all pending submissions from SQLite table");
          return;
      } catch (error) {
          log.error("Error clearing pending submissions from SQLite:", error);
      }
  }

  // Legacy
  try {
    await storage.removeItem(STORAGE_KEYS.PENDING_SUBMISSIONS);
    log.info("Cleared all pending submissions");
  } catch (error) {
    log.error("Error clearing pending submissions:", error);
  }
}

/**
 * Get the count of pending submissions
 */
export async function getPendingCount(): Promise<number> {
  const storage = getStorage();
  
  if (storage instanceof SQLiteStorageAdapter) {
    try {
      const db = await getSqliteDb();
      const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pending_submissions');
      return result?.count || 0;
    } catch (e) {
      log.error("Error getting pending count from SQLite:", e);
      return 0;
    }
  }

  const pending = await getPendingSubmissions();
  return pending.length;
}
