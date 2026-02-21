/**
 * useBLE Hook - React hook for BLE scanning in ScanScreen
 * 
 * Provides:
 * - BLE state management
 * - Permission handling
 * - Student device detection with auto-marking
 * - Scan timeout protection
 * - Proper cleanup on unmount/blur
 * 
 * ⚠️ IMPORTANT: Every useEffect dependency is carefully controlled to prevent
 * infinite re-render loops. Do NOT add `startBLEScan`, `students`, or other
 * unstable references to effect dep arrays without using refs.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  initBLE,
  getBLEState,
  normalizeUUID,
  requestBLEPermissions,
  isBLEReady,
  isScanningActive,
  startScanning,
  stopScanning,
  onBLEStateChange,
  destroyBLE,
  type DetectedStudent,
  type BLEState,
} from '../../../services/bleService';

interface Student {
  id: string;
  name: string;
  rollNumber: string;
  bluetooth_uuid: string | null;
  isPresent: boolean;
}

interface UseBLEOptions {
  students: Student[];
  onStudentDetected: (studentId: string) => void;
  enabled?: boolean;
  scanTimeout?: number; // milliseconds
}

interface UseBLEReturn {
  bleState: BLEState;
  isScanning: boolean;
  permissionsGranted: boolean;
  detectedCount: number;
  lastDetected: string | null;
  error: string | null;
  studentsWithUUID: number;
  startBLEScan: () => Promise<void>;
  stopBLEScan: () => void;
  requestPermissions: () => Promise<boolean>;
}

export const useBLE = ({
  students,
  onStudentDetected,
  enabled = true,
  scanTimeout = 10 * 60 * 1000, // 10 minutes default
}: UseBLEOptions): UseBLEReturn => {
  const [bleState, setBLEState] = useState<BLEState>('unknown');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const stopScanRef = useRef<(() => void) | null>(null);
  const detectedUUIDsRef = useRef<Set<string>>(new Set());
  const isStartingRef = useRef(false);
  const wasScanningBeforeBackground = useRef(false);
  const isScanningRef = useRef(false); // Mirror of isScanning for use inside callbacks without deps
  
  // ─── Stable refs for callbacks used inside effects ─────────────────
  // These let effects call the latest version of a function without
  // depending on its identity (which would cause re-render loops).
  const onStudentDetectedRef = useRef(onStudentDetected);
  onStudentDetectedRef.current = onStudentDetected;

  const studentsRef = useRef(students);
  studentsRef.current = students;
  
  // Create UUID to student ID map
  const uuidToStudentMap = useRef<Map<string, string>>(new Map());
  const studentsWithUUIDRef = useRef(0);
  
  // Build UUID map when students change (uses serialized key to avoid
  // re-running when the array reference changes but contents are the same)
  const studentUUIDKey = students
    .map(s => s.bluetooth_uuid || '')
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    const map = new Map<string, string>();
    let countWithUUID = 0;
    
    students.forEach(student => {
      if (student.bluetooth_uuid) {
        const normalizedUUID = normalizeUUID(student.bluetooth_uuid);
        map.set(normalizedUUID, student.id);
        countWithUUID++;
      }
    });
    
    uuidToStudentMap.current = map;
    studentsWithUUIDRef.current = countWithUUID;
    
    // Log only once per distinct set of UUIDs (not every render)
    console.log('[useBLE] UUID map rebuilt:', countWithUUID, 'of', students.length, 'students have BLE UUIDs');
    if (countWithUUID === 0 && students.length > 0) {
      console.warn('[useBLE] ⚠️ No students have bluetooth_uuid set');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUUIDKey]); // ← stable string key, NOT the students array ref
  
  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await requestBLEPermissions();
      setPermissionsGranted(granted);
      if (!granted) {
        setError('Bluetooth permissions denied');
      }
      return granted;
    } catch (e) {
      console.error('[useBLE] Permission request failed:', e);
      setError('Failed to request permissions');
      return false;
    }
  }, []);
  
  // Handle detected device (uses refs to avoid depending on onStudentDetected)
  const handleDeviceDetected = useCallback((device: DetectedStudent) => {
    const uuid = normalizeUUID(device.uuid);
    
    if (detectedUUIDsRef.current.has(uuid)) return;
    
    const studentId = uuidToStudentMap.current.get(uuid);
    
    if (studentId) {
      console.log('[useBLE] ✅ Match:', uuid.substring(0, 12) + '... → Student:', studentId);
      detectedUUIDsRef.current.add(uuid);
      setDetectedCount(prev => prev + 1);
      setLastDetected(uuid);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onStudentDetectedRef.current(studentId);
    }
  }, []); // ← no deps! Uses refs for everything
  
  // Start scanning
  const startBLEScan = useCallback(async () => {
    if (isStartingRef.current || isScanningActive()) return;
    
    isStartingRef.current = true;
    
    try {
      const { ready, reason } = await isBLEReady();
      if (!ready) {
        setError(reason || 'BLE not ready');
        return;
      }
      
      detectedUUIDsRef.current.clear();
      setDetectedCount(0);
      setError(null);
      
      // Read students from ref (stable, no dep needed)
      const studentUUIDs = studentsRef.current
        .filter(s => s.bluetooth_uuid)
        .map(s => s.bluetooth_uuid!);
      
      if (studentUUIDs.length === 0) {
        console.warn('[useBLE] No students have Bluetooth UUIDs');
        setError('No students have Bluetooth UUIDs configured');
        return;
      }
      
      console.log('[useBLE] Starting scan with', studentUUIDs.length, 'UUIDs');
      
      const stop = startScanning(handleDeviceDetected, studentUUIDs, {
        timeout: scanTimeout,
        onTimeout: () => {
          console.log('[useBLE] Scan timed out');
          setIsScanning(false);
          isScanningRef.current = false;
          setError('Scan timed out');
        },
        onError: (err) => {
          console.error('[useBLE] Scan error:', err.message);
          setError(err.message);
        },
      });
      
      stopScanRef.current = stop;
      setIsScanning(true);
      isScanningRef.current = true;
      console.log('[useBLE] ✅ Scan started');
    } finally {
      isStartingRef.current = false;
    }
  }, [handleDeviceDetected, scanTimeout]); // ← students removed (uses ref)
  
  // Stop scanning
  const stopBLEScan = useCallback(() => {
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
    stopScanning();
    setIsScanning(false);
    isScanningRef.current = false;
  }, []);
  
  // ─── Store latest startBLEScan in a ref for use by effects ──────────
  const startBLEScanRef = useRef(startBLEScan);
  startBLEScanRef.current = startBLEScan;
  
  // ─── Initialize BLE and listen for state changes ────────────────────
  // Deps: [enabled] ONLY. Never depend on startBLEScan here!
  useEffect(() => {
    if (!enabled) return;
    
    initBLE();
    let previousState: BLEState = 'unknown';
    
    getBLEState().then(state => {
      console.log('[useBLE] Initial BLE state:', state);
      setBLEState(state);
      previousState = state;
    });
    
    const unsubscribe = onBLEStateChange((state) => {
      console.log('[useBLE] BLE state changed:', previousState, '→', state);
      setBLEState(state);
      
      if (previousState === 'off' && state === 'on') {
        console.log('[useBLE] Bluetooth enabled — auto-resuming scan...');
        setError(null);
        setTimeout(() => {
          if (!isScanningActive()) {
            startBLEScanRef.current().catch(err => {
              console.error('[useBLE] Auto-resume failed:', err);
            });
          }
        }, 500);
      }
      
      previousState = state;
    });
    
    return () => {
      unsubscribe();
      stopScanning();
    };
  }, [enabled]); // ← startBLEScan REMOVED (uses ref instead)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useBLE] Unmounting - cleanup');
      stopBLEScan();
    };
  }, [stopBLEScan]);

  // ─── AppState listener: auto-resume scan after background ──────────
  // Deps: [enabled] ONLY. Uses refs for isScanning and startBLEScan.
  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (isScanningRef.current || isScanningActive()) {
          wasScanningBeforeBackground.current = true;
          console.log('[useBLE] App backgrounded while scanning');
        }
      } else if (nextAppState === 'active') {
        if (wasScanningBeforeBackground.current) {
          wasScanningBeforeBackground.current = false;
          console.log('[useBLE] 🔄 App foregrounded — auto-resuming scan...');
          setTimeout(() => {
            if (!isScanningActive()) {
              startBLEScanRef.current().catch(err => {
                console.error('[useBLE] Auto-resume after background failed:', err);
              });
            }
          }, 600);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [enabled]); // ← isScanning & startBLEScan REMOVED (uses refs)
  
  // React to enabled changes (play/pause toggle)
  useEffect(() => {
    if (enabled) {
      console.log('[useBLE] Enabled — requesting permissions then scan');
      requestBLEPermissions().then((granted) => {
        setPermissionsGranted(granted);
        if (granted) {
          startBLEScanRef.current();
        } else {
          setError('Bluetooth permissions denied');
        }
      });
    } else {
      console.log('[useBLE] Disabled — stopping scan');
      stopBLEScan();
    }
  }, [enabled, stopBLEScan]); // ← uses ref for startBLEScan
  
  return {
    bleState,
    isScanning,
    permissionsGranted,
    detectedCount,
    lastDetected,
    error,
    studentsWithUUID: studentsWithUUIDRef.current,
    startBLEScan,
    stopBLEScan,
    requestPermissions,
  };
};

export default useBLE;

