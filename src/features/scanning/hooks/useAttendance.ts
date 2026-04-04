/**
 * useAttendance - Hook for real attendance data from Supabase
 * 
 * Features:
 * - Fetches students for a class (online or from cache)
 * - Handles attendance submission (online) or queue (offline)
 * - Offline support with fallback to cached roster
 * - Fresh start on every page load (no draft restoration)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { 
  getStudentsForClass, 
  createAttendanceSession, 
  submitAttendance,
  getClassPermissions
} from '../../../services/dashboardService';
import { supabase } from '../../../config/supabase';
import {
  findCachedRoster, 
  queueSubmission, 
  isCacheValid,
  clearDraftAttendance
} from '../../../services/offlineService';
import { useConnectionStatus } from '../../../hooks';
import createLogger from '../../../utils/logger';

const log = createLogger('useAttendance');

export interface AttendanceStudent {
  id: string;
  name: string;
  rollNo: string;
  photoUrl?: string;
  bleUUID?: string;
  status: 'pending' | 'present' | 'absent' | 'od' | 'leave';
  detectedAt?: number;
  batch?: number | null;
  isLE?: boolean;
}

// Re-export ClassData if needed or define locally
export 

interface ClassData {
  id?: string;
  slot_id?: string;
  originalSlotIds?: string[];
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
  batchOverride?: 'full' | null; // When 'full', ignore classData.batch and load all students
}

// Offline/server-error modal state exposed to the UI
export interface OfflineModalState {
  visible: boolean;
  title: string;
  message: string;
  onRetry: () => void;
  onUseOffline: (() => void) | null; // null = server error, no offline option
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
  offlineModal: OfflineModalState;
  dismissOfflineModal: () => void;
}

export function useAttendance({ classData, batchOverride }: UseAttendanceOptions): UseAttendanceReturn {
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const { isOnline } = useConnectionStatus();
  
  // Custom offline/server-error modal state (replaces native Alert.alert)
  const [offlineModal, setOfflineModal] = useState<OfflineModalState>({
    visible: false, title: '', message: '', onRetry: () => {}, onUseOffline: null,
  });
  const dismissOfflineModal = useCallback(() => {
    setOfflineModal(prev => ({ ...prev, visible: false }));
  }, []);

  // Use a ref so fetchStudents always reads the LATEST value without
  // being recreated every time isOnline changes (which caused the race condition).
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  // Mounted ref for safe state updates
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Derived counts
  const presentCount = students.filter(s => s.status === 'present' || s.status === 'od').length;
  const odCount = students.filter(s => s.status === 'od').length;
  const absentCount = students.filter(s => s.status === 'absent' || s.status === 'leave').length;
  const pendingCount = students.filter(s => s.status === 'pending').length;
  const totalCount = students.length;

  // Fetch students for the class (with offline fallback)
  const fetchStudents = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!classData) {
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    let isAwaitingPrompt = false;

    try {
      const { target_dept, target_year, target_section } = classData;
      
      // Auto-derive batch from schedule data, unless overridden to 'full'
      const batchNumber = batchOverride === 'full' ? null : (classData?.batch ?? null);
      
      let mappedStudents: AttendanceStudent[] = [];
      let fetchedOnline = false;
      
      const attemptOnlineFetch = async (): Promise<boolean> => {
        try {
          log.info('[ONLINE] Fetching students for:', target_dept, target_year, target_section, 'batch:', batchNumber);
          const fetchedStudents = await getStudentsForClass(
            target_dept,
            target_year,
            target_section,
            batchNumber
          );

          if (signal?.aborted) return false;
          log.info('[ONLINE] Students fetched successfully, count:', fetchedStudents.length);

          // getClassPermissions has its own try/catch, so it won't throw up
          let permissions: { student_id: string; type: string }[] = [];
          if (fetchedStudents.length > 0) {
            log.info('[ONLINE] Fetching permissions for', fetchedStudents.length, 'students...');
            permissions = await getClassPermissions(fetchedStudents.map(s => s.id));
            log.info('[ONLINE] Permissions fetched, count:', permissions.length);
          }
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
              photoUrl: s.avatar_url || undefined,
              batch: s.batch,
              isLE: s.is_le,
            };
          });
          
          log.info('[ONLINE] SUCCESS - mapped', mappedStudents.length, 'students');
          return true;
        } catch (onlineErr: any) {
          if (signal?.aborted) return false;
          log.error('[ONLINE] Attempt FAILED:', onlineErr?.message || onlineErr);
          return false;
        }
      };

      // Attempt 1
      fetchedOnline = await attemptOnlineFetch();
      
      // If first attempt failed and we think we're online, retry once after a short delay
      if (!fetchedOnline && !signal?.aborted && isOnlineRef.current) {
        log.info('[ONLINE] First attempt failed. Retrying in 2s...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!signal?.aborted) {
          fetchedOnline = await attemptOnlineFetch();
        }
      }

      if (fetchedOnline) {
        setIsOfflineMode(false);
      }
      
      // Fall back to cache ONLY if online fetch genuinely threw an error/failed.
      // Do not fall back just because mappedStudents is empty (e.g., 0 enrolled students)
      if (!fetchedOnline && !signal?.aborted) {
        
        // If this is a silent background ping and we already have offline data loaded, 
        // silently abort rather than re-querying SQLite and causing UI frame drops.
        if (silent && isOfflineMode) {
            return;
        }

        // STRICT OFFLINE: Check actual network state before deciding what to show
        const netState = await NetInfo.fetch();
        const isTrulyOffline = !netState.isConnected || netState.isInternetReachable === false;

        if (isTrulyOffline) {
          // Device is truly disconnected — offer offline mode
          const cachedRoster = await findCachedRoster(
            classData.target_dept, 
            classData.target_year, 
            classData.target_section
          );
          
          if (cachedRoster && (await isCacheValid())) {
            log.info('Truly offline + cached roster found, prompting user...');
            
            const applyCache = async (roster: any) => {
              if (!isMountedRef.current) return;
              let finalStudents: AttendanceStudent[] = roster.students.map((s: any) => ({
                id: s.id,
                name: s.name,
                rollNo: s.rollNo,
                bleUUID: s.bluetoothUUID || undefined,
                status: 'pending' as const, 
                photoUrl: undefined,
                batch: s.batch,
                isLE: s.isLE,
              }));
              
              if (batchNumber) {
                finalStudents = finalStudents.filter((s: any) => {
                  if (s.batch !== undefined && s.batch !== null) {
                    return s.batch === batchNumber;
                  }
                  const rollNum = parseInt(s.rollNo.replace(/\D/g, '')) || 0;
                  return batchNumber === 1 ? rollNum % 2 === 1 : rollNum % 2 === 0;
                });
              }

              // Fresh start — no draft restoration, all students begin as pending
              setStudents(finalStudents);
              setIsOfflineMode(true);
              setLoading(false);
            };

            if (!silent) {
              isAwaitingPrompt = true;
              // Show custom modal instead of native Alert
              setOfflineModal({
                visible: true,
                title: 'No Network Connection',
                message: 'You appear to be offline. Continue using cached data?',
                onRetry: () => {
                  setOfflineModal(prev => ({ ...prev, visible: false }));
                  setLoading(true);
                  fetchStudents(signal, false);
                },
                onUseOffline: () => {
                  setOfflineModal(prev => ({ ...prev, visible: false }));
                  applyCache(cachedRoster);
                },
              });
              return;
            } else {
               return;
            }
          } else {
            if (isMountedRef.current) {
              setError('Offline - No cached roster available');
              setIsOfflineMode(true);
            }
          }
        } else {
          // Network is connected but server failed — show retry, NOT offline
          log.info('Network connected but Supabase failed. Showing server error.');
          if (!silent) {
            isAwaitingPrompt = true;
            // Show custom modal instead of native Alert
            setOfflineModal({
              visible: true,
              title: 'Server Error',
              message: 'Could not reach the server. Your internet is connected — this may be a temporary issue.',
              onRetry: () => {
                setOfflineModal(prev => ({ ...prev, visible: false }));
                setLoading(true);
                fetchStudents(signal, false);
              },
              onUseOffline: null, // No offline option for server errors
            });
            return;
          }
        }
      }

      // Fresh start: set students directly without restoring drafts
      if (mappedStudents.length > 0 && isMountedRef.current) {
          setStudents(mappedStudents);
      }

    } catch (err) {
      if (!signal?.aborted && isMountedRef.current) {
        log.error('Error fetching students:', err);
        if (!silent) setError('Failed to load students');
      }
    } finally {
      if (!signal?.aborted && !silent && !isAwaitingPrompt && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [classData, batchOverride, isOfflineMode]); // Added isOfflineMode so the silent check captures it locally.

  // Fetch on mount and when class/batch changes
  // CRITICAL: Defer fetch until AFTER the screen transition animation completes.
  // Without this, fetching 70+ students + permissions simultaneously with the
  // navigation animation blocks the JS thread and causes ANR/crash.
  useEffect(() => {
    const controller = new AbortController();
    const { InteractionManager } = require('react-native');
    
    const task = InteractionManager.runAfterInteractions(() => {
      if (!controller.signal.aborted) {
        fetchStudents(controller.signal);
      }
    });

    return () => {
      controller.abort();
      task.cancel();
    };
  }, [fetchStudents]);

  // Background polling to recover when trapped in offline mode while network is back
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isOnline && isOfflineMode) {
      log.info('Network back online but still in offline mode. Starting 15s recovery ping...');
      interval = setInterval(() => {
        const controller = new AbortController();
        fetchStudents(controller.signal, true); // true = silent ping
      }, 15000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnline, isOfflineMode, fetchStudents]);


  // Update a single student's status
  const updateStudentStatus = useCallback((studentId: string, status: 'pending' | 'present' | 'absent' | 'od' | 'leave') => {
    if (!isMountedRef.current) return;
    setStudents(prev => prev.map(s => 
      s.id === studentId 
        ? { ...s, status, detectedAt: status === 'present' ? Date.now() : undefined }
        : s
    ));
  }, []);

  // Draft auto-save removed: users want fresh start on every page load

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

    // Determine all slot IDs to process (merged classes have multiple)
    const slotIdsToProcess = classData.originalSlotIds?.length 
      ? classData.originalSlotIds 
      : [classData.slot_id];

    // If offline, queue the submission
    if (!isOnlineRef.current || isOfflineMode) {
      try {
        for (const sId of slotIdsToProcess) {
          if (!sId) continue;
          await queueSubmission({
            classData: {
              slotId: String(sId),
              subjectName: classData.subject?.name || 'Unknown',
              subjectId: classData.subject?.id, 
              dept: classData.target_dept,
              year: classData.target_year,
              sectionLetter: classData.target_section,
              section: `${classData.target_dept}-${classData.target_year}-${classData.target_section}`,
            },
            attendance: records,
            submittedAt: new Date().toISOString(),
            id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            retryCount: 0,
          });
        }
        
        log.info(`Submission queued for ${slotIdsToProcess.length} slots for later sync`);
        // Clear draft after queuing
        if (classData.slot_id) {
            await clearDraftAttendance(classData.slot_id);
        }
        return { success: true, error: null, queued: true };
      } catch (err) {
        log.error('Queue error:', err);
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

      // Loop through all slot IDs and create sessions & submit attendance for each
      for (const sId of slotIdsToProcess) {
        if (!sId) continue;

        const { sessionId, error: sessionError } = await createAttendanceSession(
          user.id,
          classData.subject.id,
          sId,
          classData.target_dept,
          classData.target_year,
          classData.target_section,
          totalCount,
          classData.batch,
          classData.isSubstitute || false,
          classData.originalFacultyId || null
        );

        if (sessionError || !sessionId) {
          return { success: false, error: sessionError || `Failed to create session for slot ${sId}` };
        }

        const { success, error: submitError } = await submitAttendance(
          sessionId,
          user.id,
          records
        );

        if (!success) {
          return { success: false, error: submitError || `Failed to submit for slot ${sId}` };
        }
      }

      // Clear draft after successful submission
      if (classData.slot_id) {
          await clearDraftAttendance(classData.slot_id);
      }

      return { success: true, error: null };
    } catch (err) {
      log.error('Submit error:', err);
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
    offlineModal,
    dismissOfflineModal,
  };
}

export default useAttendance;
