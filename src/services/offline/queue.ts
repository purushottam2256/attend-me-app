import { PendingSubmission, STORAGE_KEYS } from "./types";
import { getStorage } from "./storage";
import createLogger from '../../utils/logger';

const storage = getStorage();
const log = createLogger('OfflineQueue');

/**
 * Get all pending submissions from local storage
 */
export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
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
  try {
    let pending = await getPendingSubmissions();

    // DEDUPLICATION / OVERRIDE LOGIC
    // Remove any existing queued submission for the same slot + date
    const newDate = submission.submittedAt.split("T")[0];
    const newSlot = submission.classData.slotId;
    
    const initialCount = pending.length;
    pending = pending.filter((p) => {
      const pDate = p.submittedAt.split("T")[0];
      // Keep item if it's NOT the same slot/date
      return !(p.classData.slotId === newSlot && pDate === newDate);
    });

    if (pending.length < initialCount) {
      log.info(`Replaced ${initialCount - pending.length} existing queued submission(s) for slot ${newSlot} on ${newDate}`);
    }

    // Add new submission
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
  const pending = await getPendingSubmissions();
  return pending.length;
}


