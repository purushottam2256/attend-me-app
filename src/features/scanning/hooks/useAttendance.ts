/**
 * useAttendance - Hook for real attendance data from Supabase
 * 
 * Features:
 * - Fetches students for a class (online or from cache)
 * - Handles attendance submission (online) or queue (offline)
 * - Offline support with fallback to cached roster
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getStudentsForClass, 
  createAttendanceSession, 
  submitAttendance,
  getClassPermissions
} from '../../../services/dashboardService';
import { supabase } from '../../../config/supabase';
import { 
  getCachedRoster, 
  queueSubmission, 
  isCacheValid 
} from '../../../services/offlineService';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';

export interface AttendanceStudent {
  id: string;
  name: string;
  rollNo: string;
  photoUrl?: string;
  bleUUID?: string;
  status: 'pending' | 'present' | 'absent' | 'od' | 'leave';
  detectedAt?: number;
}

interface ClassData {
  id?: string;
  slot_id?: string;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  target_dept: string;
  target_year: number;
  target_section: string;
  batch?: number | null;
  // Substitution tracking
  isSubstitute?: boolean;
  originalFacultyId?: string | null;
}

interface UseAttendanceOptions {
  classData: ClassData | null;
  batch: 'full' | 'b1' | 'b2';
}

interface UseAttendanceReturn {
  students: AttendanceStudent[];
  loading: boolean;
  error: string | null;
  presentCount: number;
  absentCount: number;
  pendingCount: number;
  totalCount: number;
  updateStudentStatus: (studentId: string, status: 'pending' | 'present' | 'absent' | 'od' | 'leave') => void;
  submitAttendance: () => Promise<{ success: boolean; error: string | null; queued?: boolean }>;
  refreshStudents: () => Promise<void>;
  isOfflineMode: boolean;
}

export function useAttendance({ classData, batch }: UseAttendanceOptions): UseAttendanceReturn {
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  
  const { isOnline } = useNetworkStatus();

  // Derived counts
  const presentCount = students.filter(s => s.status === 'present' || s.status === 'od').length;
  const absentCount = students.filter(s => s.status === 'absent' || s.status === 'leave').length;
  const pendingCount = students.filter(s => s.status === 'pending').length;
  const totalCount = students.length;

  // Fetch students for the class (with offline fallback)
  const fetchStudents = useCallback(async () => {
    if (!classData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { target_dept, target_year, target_section } = classData;
      
      // Convert batch to number or null
      const batchNumber = batch === 'b1' ? 1 : batch === 'b2' ? 2 : null;
      
      let mappedStudents: AttendanceStudent[] = [];
      
      // Try online fetch first if connected
      if (isOnline) {
        try {
          const fetchedStudents = await getStudentsForClass(
            target_dept,
            target_year,
            target_section,
            batchNumber
          );

          // Get active permissions for today
          const permissions = await getClassPermissions(fetchedStudents.map(s => s.id));
          const permissionMap = new Map(permissions.map(p => [p.student_id, p.type]));

          mappedStudents = fetchedStudents.map(s => {
            const permissionType = permissionMap.get(s.id);
            // If OD/Leave exists, set status automatically
            const initialStatus = permissionType 
              ? permissionType as 'od' | 'leave'
              : 'pending';

            return {
              id: s.id,
              name: s.full_name,
              rollNo: s.roll_no,
              bleUUID: s.bluetooth_uuid || undefined,
              status: initialStatus,
              photoUrl: undefined,
            };
          });
          
          setIsOfflineMode(false);
        } catch (onlineErr) {
          console.log('[useAttendance] Online fetch failed, trying cache');
        }
      }
      
      // Fallback to cached roster if online fetch failed or offline
      if (mappedStudents.length === 0) {
        const slotId = classData.slot_id ? parseInt(classData.slot_id) : 0;
        const cachedRoster = await getCachedRoster(slotId);
        
        if (cachedRoster && (await isCacheValid())) {
          console.log('[useAttendance] Using cached roster');
          mappedStudents = cachedRoster.students.map(s => ({
            id: s.id,
            name: s.name,
            rollNo: s.rollNo,
            bleUUID: s.bluetoothUUID || undefined,
            status: 'pending' as const, // Cannot verify permissions offline easily unless cached
            photoUrl: undefined,
          }));
          
          // Filter by batch if needed
          if (batchNumber) {
            // Assume odd roll numbers are B1, even are B2 (configurable)
            mappedStudents = mappedStudents.filter(s => {
              const rollNum = parseInt(s.rollNo.replace(/\D/g, '')) || 0;
              return batchNumber === 1 ? rollNum % 2 === 1 : rollNum % 2 === 0;
            });
          }
          
          setIsOfflineMode(true);
        } else if (!isOnline) {
          setError('Offline - No cached roster available');
          setIsOfflineMode(true);
        }
      }

      setStudents(mappedStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [classData, batch, isOnline]);

  // Fetch on mount and when class/batch changes
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Update a single student's status
  const updateStudentStatus = useCallback((studentId: string, status: 'pending' | 'present' | 'absent' | 'od' | 'leave') => {
    setStudents(prev => prev.map(s => 
      s.id === studentId 
        ? { ...s, status, detectedAt: status === 'present' ? Date.now() : undefined }
        : s
    ));
  }, []);

  // Submit attendance to Supabase (or queue if offline)
  const handleSubmitAttendance = useCallback(async (): Promise<{ success: boolean; error: string | null; queued?: boolean }> => {
    if (!classData?.slot_id) {
      return { success: false, error: 'Missing class data' };
    }

    // Prepare attendance records
    const records = students.map(s => ({
      studentId: s.id,
      status: s.status === 'pending' ? 'absent' as const : s.status,
    }));

    // If offline, queue the submission
    if (!isOnline || isOfflineMode) {
      try {
        await queueSubmission({
          classData: {
            slotId: parseInt(classData.slot_id),
            subjectName: classData.subject?.name || 'Unknown',
            section: `${classData.target_dept}-${classData.target_year}-${classData.target_section}`,
          },
          attendance: records,
          submittedAt: new Date().toISOString(),
        });
        
        console.log('[useAttendance] Submission queued for later sync');
        return { success: true, error: null, queued: true };
      } catch (err) {
        console.error('[useAttendance] Queue error:', err);
        return { success: false, error: 'Failed to queue submission' };
      }
    }

    // Online submission
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      if (!classData.subject?.id) {
        return { success: false, error: 'Missing subject ID' };
      }

      const { sessionId, error: sessionError } = await createAttendanceSession(
        user.id,
        classData.subject.id,
        classData.slot_id,
        classData.target_dept,
        classData.target_year,
        classData.target_section,
        totalCount,
        classData.batch,
        classData.isSubstitute || false,
        classData.originalFacultyId || null
      );

      if (sessionError || !sessionId) {
        return { success: false, error: sessionError || 'Failed to create session' };
      }

      const { success, error: submitError } = await submitAttendance(
        sessionId,
        user.id,
        records
      );

      if (!success) {
        return { success: false, error: submitError || 'Failed to submit' };
      }

      return { success: true, error: null };
    } catch (err) {
      console.error('Submit error:', err);
      return { success: false, error: 'Submission failed' };
    }
  }, [classData, students, totalCount, isOnline, isOfflineMode]);

  return {
    students,
    loading,
    error,
    presentCount,
    absentCount,
    pendingCount,
    totalCount,
    updateStudentStatus,
    submitAttendance: handleSubmitAttendance,
    refreshStudents: fetchStudents,
    isOfflineMode,
  };
}

export default useAttendance;
