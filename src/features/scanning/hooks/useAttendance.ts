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
  batch?: number | null;
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
  odCount: number;
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
  const odCount = students.filter(s => s.status === 'od').length;
  const absentCount = students.filter(s => s.status === 'absent' || s.status === 'leave').length;
  const pendingCount = students.filter(s => s.status === 'pending').length;
  const totalCount = students.length;

  // Fetch students for the class (with offline fallback)
  const fetchStudents = useCallback(async (signal?: AbortSignal) => {
    if (!classData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { target_dept, target_year, target_section } = classData;
      
      const batchNumber = batch === 'b1' ? 1 : batch === 'b2' ? 2 : null;
      
      let mappedStudents: AttendanceStudent[] = [];
      
      if (isOnline) {
        try {
          const fetchedStudents = await getStudentsForClass(
            target_dept,
            target_year,
            target_section,
            batchNumber
          );

          if (signal?.aborted) return;

          const permissions = await getClassPermissions(fetchedStudents.map(s => s.id));
          const permissionMap = new Map(permissions.map(p => [p.student_id, p.type]));

          mappedStudents = fetchedStudents.map(s => {
            const permissionType = permissionMap.get(s.id);
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
              batch: s.batch,
            };
          });
          
          setIsOfflineMode(false);
        } catch (onlineErr) {
          if (signal?.aborted) return;
          console.log('[useAttendance] Online fetch failed, trying cache');
        }
      }
      
      if (mappedStudents.length === 0 && !signal?.aborted) {
        const slotIdStr = String(classData.slot_id || '0');
        const slotId = /^\d+$/.test(slotIdStr) ? parseInt(slotIdStr, 10) : 0;
        
        const cachedRoster = await getCachedRoster(
          slotId, 
          classData.target_dept, 
          classData.target_year, 
          classData.target_section
        );
        
        if (cachedRoster && (await isCacheValid())) {
          console.log('[useAttendance] Using cached roster');
          mappedStudents = cachedRoster.students.map(s => ({
            id: s.id,
            name: s.name,
            rollNo: s.rollNo,
            bleUUID: s.bluetoothUUID || undefined,
            status: 'pending' as const, 
            photoUrl: undefined,
            batch: s.batch,
          }));
          
          if (batchNumber) {
            mappedStudents = mappedStudents.filter(s => {
              if (s.batch !== undefined && s.batch !== null) {
                return s.batch === batchNumber;
              }
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

      if (!signal?.aborted) {
        setStudents(mappedStudents);
      }
    } catch (err) {
      if (!signal?.aborted) {
        console.error('Error fetching students:', err);
        setError('Failed to load students');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [classData, batch, isOnline]);

  // Fetch on mount and when class/batch changes
  useEffect(() => {
    const controller = new AbortController();
    fetchStudents(controller.signal);
    return () => controller.abort();
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
            subjectId: classData.subject?.id, 
            dept: classData.target_dept,
            year: classData.target_year,
            sectionLetter: classData.target_section,
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
    odCount,
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
