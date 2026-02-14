
import * as SQLite from 'expo-sqlite';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createLogger from '../utils/logger';

const log = createLogger('NotificationRepo');

let db: SQLite.SQLiteDatabase | null = null;

const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('offline.db');
  }
  return db;
};

export const NotificationRepository = {
  
  // --- Notifications ---

  async getNotifications(userId: string, limit = 50) {
    try {
      const db = await getDB();
      const result = await db.getAllAsync(
        `SELECT * FROM local_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, limit]
      );
      return result.map((row: any) => ({
        ...row,
        data: row.data ? JSON.parse(row.data) : {},
        is_read: Boolean(row.is_read)
      }));
    } catch (error) {
      log.error('getNotifications error:', error);
      return [];
    }
  },

  async upsertNotifications(notifications: any[]) {
    if (notifications.length === 0) return;
    try {
      const db = await getDB();
      await db.withTransactionAsync(async () => {
        for (const n of notifications) {
          await db.runAsync(
            `INSERT OR REPLACE INTO local_notifications (id, user_id, type, title, body, data, priority, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [n.id, n.user_id, n.type, n.title, n.body, JSON.stringify(n.data || {}), n.priority, n.is_read ? 1 : 0, n.created_at]
          );
        }
      });
    } catch (error) {
      log.error('upsertNotifications error:', error);
    }
  },

  async markAsRead(id: string) {
    try {
      const db = await getDB();
      await db.runAsync('UPDATE local_notifications SET is_read = 1 WHERE id = ?', [id]);
    } catch (error) {
      log.error('markAsRead error:', error);
    }
  },

  async markAllAsRead(userId: string) {
    try {
      const db = await getDB();
      await db.runAsync('UPDATE local_notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    } catch (error) {
      log.error('markAllAsRead error:', error);
    }
  },

  async deleteNotification(id: string) {
    try {
      const db = await getDB();
      await db.runAsync('DELETE FROM local_notifications WHERE id = ?', [id]);
    } catch (error) {
      log.error('deleteNotification error:', error);
    }
  },

  async markMultipleAsRead(ids: string[]) {
    if (ids.length === 0) return;
    try {
       const validIds = ids.filter(id => id && typeof id === 'string' && id.trim().length > 0);
       if (validIds.length === 0) return;
       const db = await getDB();
       // Generate placeholders like ?,?,?
       const placeholders = validIds.map(() => '?').join(',');
       await db.runAsync(
         `UPDATE local_notifications SET is_read = 1 WHERE id IN (${placeholders})`,
         validIds
       );
    } catch (error) {
       log.error('markMultipleAsRead error:', error);
    }
  },

  // --- Local Delete Cache (for immediate persistence) ---
  
  async getDeletedIds(): Promise<Set<string>> {
      try {
          const json = await AsyncStorage.getItem('deleted_notification_ids');
          return json ? new Set(JSON.parse(json)) : new Set();
      } catch (error) {
          log.error('Error fetching deleted IDs from cache:', error);
          return new Set();
      }
  },

  async addDeletedId(id: string) {
      try {
          const current = await this.getDeletedIds();
          current.add(id);
          await AsyncStorage.setItem('deleted_notification_ids', JSON.stringify(Array.from(current)));
      } catch (error) {
          log.error('Error saving deleted ID to cache:', error);
      }
  },

  async addDeletedIds(ids: string[]) {
      try {
          const current = await this.getDeletedIds();
          ids.forEach(id => current.add(id));
          await AsyncStorage.setItem('deleted_notification_ids', JSON.stringify(Array.from(current)));
      } catch (error) {
          log.error('Error saving deleted IDs to cache:', error);
      }
  },

  // --- Substitutions ---

  async getSubstitutions(userId: string) {
    try {
      const db = await getDB();
      // Logic: Show pending where I am substitute, OR where I am original (responded)
      const result = await db.getAllAsync(
        `SELECT * FROM local_substitutions 
         WHERE (substitute_faculty_id = ? AND status = 'pending')
            OR (original_faculty_id = ? AND status != 'pending')
            OR (original_faculty_id = ? AND status = 'pending') -- Also show my own pending requests? config says no mostly
         ORDER BY requested_at DESC`,
        [userId, userId, userId]
      );
      // Correction: Filtering logic handled in Service/Screen usually, but fetching all relevant is good
      return result.map((row: any) => ({
        ...row,
        // Reconstruct nested objects for compatibility
        original_faculty: { full_name: row.original_faculty_name },
        subject: { name: row.subject_name, code: row.subject_code },
        is_hidden: Boolean(row.is_hidden)
      }));
    } catch (error) {
      log.error('getSubstitutions error:', error);
      return [];
    }
  },

  async upsertSubstitutions(subs: any[]) {
    if (subs.length === 0) return;
    try {
      const db = await getDB();
      await db.withTransactionAsync(async () => {
        for (const s of subs) {
           // Extract flattened data
           const origName = s.original_faculty?.full_name || s.original_faculty_name;
           const subName = s.subject?.name || s.subject_name;
           const subCode = s.subject?.code || s.subject_code;

           await db.runAsync(
             `INSERT OR REPLACE INTO local_substitutions 
              (id, original_faculty_id, substitute_faculty_id, subject_name, subject_code, original_faculty_name, target_dept, target_year, target_section, slot_id, date, status, requested_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [s.id, s.original_faculty_id, s.substitute_faculty_id, subName, subCode, origName, s.target_dept, s.target_year, s.target_section, s.slot_id, s.date, s.status, s.requested_at || s.created_at]
           );
        }
      });
    } catch (error) {
      log.error('upsertSubstitutions error:', error);
    }
  },

  async updateSubstitutionStatus(id: string, status: string, subId: string) {
    try {
      const db = await getDB();
      await db.runAsync(
        'UPDATE local_substitutions SET status = ?, substitute_faculty_id = ? WHERE id = ?',
        [status, subId, id]
      );
    } catch (error) {
      log.error('updateSubstitutionStatus error:', error);
    }
  },

  async hideSubstitution(id: string) {
    try {
      const db = await getDB();
      await db.runAsync('UPDATE local_substitutions SET is_hidden = 1 WHERE id = ?', [id]);
    } catch (error) {
      log.error('hideSubstitution error:', error);
    }
  },

  // --- Swaps ---

  async getSwaps(userId: string) {
    try {
      const db = await getDB();
      const result = await db.getAllAsync(
        `SELECT * FROM local_class_swaps 
         WHERE (faculty_b_id = ? AND status = 'pending')
            OR (faculty_a_id = ? AND status != 'pending')
         ORDER BY requested_at DESC`,
        [userId, userId]
      );
       return result.map((row: any) => ({
        ...row,
        faculty_a: { full_name: row.faculty_a_name },
        faculty_b: { full_name: row.faculty_b_name },
        is_hidden: Boolean(row.is_hidden)
      }));
    } catch (error) {
      log.error('getSwaps error:', error);
      return [];
    }
  },

  async upsertSwaps(swaps: any[]) {
    if (swaps.length === 0) return;
    try {
      const db = await getDB();
      await db.withTransactionAsync(async () => {
        for (const s of swaps) {
           const nameA = s.faculty_a?.full_name || s.faculty_a_name;
           const nameB = s.faculty_b?.full_name || s.faculty_b_name;

           await db.runAsync(
             `INSERT OR REPLACE INTO local_class_swaps 
              (id, faculty_a_id, faculty_b_id, faculty_a_name, faculty_b_name, slot_a_id, slot_b_id, date, status, requested_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [s.id, s.faculty_a_id, s.faculty_b_id, nameA, nameB, s.slot_a_id, s.slot_b_id, s.date, s.status, s.requested_at || s.created_at]
           );
        }
      });
    } catch (error) {
      log.error('upsertSwaps error:', error);
    }
  },
  
  async updateSwapStatus(id: string, status: string) {
    try {
      const db = await getDB();
      await db.runAsync(
        'UPDATE local_class_swaps SET status = ? WHERE id = ?',
        [status, id]
      );
    } catch (error) {
      log.error('updateSwapStatus error:', error);
    }
  },

  async hideSwap(id: string) {
    try {
      const db = await getDB();
      await db.runAsync('UPDATE local_class_swaps SET is_hidden = 1 WHERE id = ?', [id]);
    } catch (error) {
      log.error('hideSwap error:', error);
    }
  },

    // --- Cleanup ---
  async pruneOldData(daysToKeep = 7) {
    try {
      const db = await getDB();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysToKeep);
      const cutoffStr = cutoff.toISOString();

      await db.runAsync('DELETE FROM local_notifications WHERE created_at < ?', [cutoffStr]);
      // Keep requests a bit longer? or same.
      // Substitutions/Swaps might be needed for history.
    } catch (error) {
      log.error('pruneOldData error:', error);
    }
  }
};
