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
 * FIX LOG:
 * - Stabilized startBLEScan reference to prevent scan restart loops
 * - Fixed stale closure in enabled effect using refs
 * - Moved useEffect order so functions are defined before usage
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform, Alert, Linking } from 'react-native';
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
  resetDetectedUUIDs: () => void;
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
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // === FIX: Use refs to hold latest values for stable callbacks ===
  const studentsRef = useRef(students);
  const onStudentDetectedRef = useRef(onStudentDetected);
  const scanTimeoutRef = useRef(scanTimeout);
  
  // Keep refs in sync
  useEffect(() => { studentsRef.current = students; }, [students]);
  useEffect(() => { onStudentDetectedRef.current = onStudentDetected; }, [onStudentDetected]);
  useEffect(() => { scanTimeoutRef.current = scanTimeout; }, [scanTimeout]);
  
  // UUID to student mapping (ref-based, no re-render on change)
  const uuidToStudentMap = useRef<Map<string, string>>(new Map());
  const studentsWithUUIDRef = useRef(0);
  
  // Build UUID map when students change
  useEffect(() => {
    const map = new Map<string, string>();
    let countWithUUID = 0;
    
    students.forEach(student => {
      if (student.bluetooth_uuid) {
        const normalizedUUID = normalizeUUID(student.bluetooth_uuid);
        map.set(normalizedUUID, student.id);
        countWithUUID++;
        
        if (countWithUUID <= 5) {
          console.log('[useBLE] Mapping UUID:', normalizedUUID.substring(0, 12) + '...', '→ Student:', student.name);
        }
      }
    });
    
    uuidToStudentMap.current = map;
    studentsWithUUIDRef.current = countWithUUID;
    
    console.log('[useBLE] ==========================================');
    console.log('[useBLE] Students with BLE UUID:', countWithUUID, 'of', students.length);
    if (countWithUUID === 0 && students.length > 0) {
      console.warn('[useBLE] ⚠️ WARNING: No students have bluetooth_uuid set!');
    }
    console.log('[useBLE] ==========================================');
  }, [students]);
  
  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[useBLE] Requesting BLE permissions...');
      const granted = await requestBLEPermissions();
      setPermissionsGranted(granted);
      if (!granted) {
        setError('Bluetooth permissions denied');
        console.error('[useBLE] ❌ Permissions denied');
      } else {
        console.log('[useBLE] ✅ Permissions granted');
      }
      return granted;
    } catch (e) {
      console.error('[useBLE] ❌ Permission request failed:', e);
      setError('Failed to request permissions');
      return false;
    }
  }, []);
  
  // === FIX: Stable handleDeviceDetected that reads from refs ===
  const handleDeviceDetected = useCallback((device: DetectedStudent) => {
    try {
      const uuid = normalizeUUID(device.uuid);
      
      // Check if already detected
      if (detectedUUIDsRef.current.has(uuid)) {
        return;
      }
      
      // Check if matches a student
      const studentId = uuidToStudentMap.current.get(uuid);
      
      if (studentId) {
        // Mark as detected
        detectedUUIDsRef.current.add(uuid);
        if (isMounted.current) {
          setDetectedCount(prev => prev + 1);
          setLastDetected(uuid);
        }
        
        // Haptic feedback — wrapped in try-catch (can fail on some devices)
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        
        // Notify parent (use ref for latest callback)
        onStudentDetectedRef.current(studentId);
      }
    } catch (err) {
      // CRITICAL: Never let a BLE callback crash the app
      console.warn('[useBLE] handleDeviceDetected error (swallowed):', err);
    }
  }, []); // === FIX: Empty deps — uses refs internally, never gets stale ===
  
  // === FIX: Stable startBLEScan that reads students from ref ===
  const startBLEScan = useCallback(async () => {
    // Guard: prevent concurrent starts
    if (isStartingRef.current) {
      console.log('[useBLE] Start already in progress, ignoring');
      return;
    }
    
    // Guard: check if already scanning
    if (isScanningActive()) {
      console.log('[useBLE] Already scanning, ignoring');
      return;
    }
    
    isStartingRef.current = true;
    
    try {
      // Check if BLE is ready
      const { ready, reason } = await isBLEReady();
      if (!isMounted.current) return;

      if (!ready) {
        console.error('[useBLE] ❌ BLE not ready:', reason);
        setError(reason || 'BLE not ready');
        return;
      }
      
      // Reset detected UUIDs for new scan
      detectedUUIDsRef.current.clear();
      setDetectedCount(0);
      setError(null);
      
      // === FIX: Read students from ref — no dependency on students array ===
      const currentStudents = studentsRef.current;
      const studentUUIDs = currentStudents
        .filter(s => s.bluetooth_uuid)
        .map(s => s.bluetooth_uuid!);
      
      if (studentUUIDs.length === 0) {
        console.warn('[useBLE] ⚠️ No students have Bluetooth UUIDs!');
        setError('No students have Bluetooth UUIDs configured');
        return;
      }
      
      console.log('[useBLE] Starting scan with', studentUUIDs.length, 'UUIDs');
      
      // Start scanning with timeout
      const stop = startScanning(handleDeviceDetected, studentUUIDs, {
        timeout: scanTimeoutRef.current,
        onTimeout: () => {
          console.log('[useBLE] ⏰ Scan timed out');
          setIsScanning(false);
          setError('Scan timed out - please restart if needed');
        },
        onError: (err) => {
          console.error('[useBLE] ❌ Scan error:', err.message);
          setError(err.message);
        },
      });
      
      stopScanRef.current = stop;
      if (isMounted.current) {
        setIsScanning(true);
      }
      console.log('[useBLE] ✅ Scan started');
    } finally {
      isStartingRef.current = false;
    }
  }, [handleDeviceDetected]); // === FIX: Only depends on stable handleDeviceDetected ===
  
  // Stop scanning
  const stopBLEScan = useCallback(() => {
    try {
      if (stopScanRef.current) {
        stopScanRef.current();
        stopScanRef.current = null;
      }
      
      // Also call global stop to be sure
      stopScanning();
      
      if (isMounted.current) {
        setIsScanning(false);
      }
    } catch (err) {
      console.warn('[useBLE] stopBLEScan error (swallowed):', err);
    }
  }, []);

  // Reset detected UUIDs (used by rescan to re-detect all beacons)
  const resetDetectedUUIDs = useCallback(() => {
    console.log('[useBLE] Resetting detected UUIDs');
    detectedUUIDsRef.current.clear();
    setDetectedCount(0);
    setLastDetected(null);
  }, []);
  
  // Initialize BLE and listen for state changes with auto-resume
  useEffect(() => {
    if (!enabled) return;
    
    let unsubscribe: (() => void) | undefined;

    try {
      initBLE();
      let previousState: BLEState = 'unknown';
      
      // Get initial state
      getBLEState().then(state => {
        if (isMounted.current) {
          setBLEState(state);
          previousState = state;
        }
      }).catch(() => {});
      
      // Subscribe to state changes with auto-resume
      unsubscribe = onBLEStateChange((state) => {
        try {
          if (!isMounted.current) return;
          setBLEState(state);
          
          // Auto-resume: if Bluetooth was off and is now on, restart scan
          if (previousState === 'off' && state === 'on') {
            setError(null);
            setTimeout(() => {
              if (!isScanningActive() && isMounted.current) {
                startBLEScan().catch(() => {});
              }
            }, 500);
          }
          
          previousState = state;
        } catch (err) {
          console.warn('[useBLE] BLE state change handler error (swallowed):', err);
        }
      });
    } catch (err) {
      console.warn('[useBLE] BLE init error (swallowed):', err);
    }
    
    return () => {
      try {
        if (unsubscribe) unsubscribe();
        stopScanning();
      } catch {}
    };
  }, [enabled, startBLEScan]); // Safe now because startBLEScan is stable
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useBLE] Unmounting - cleanup');
      stopBLEScan();
    };
  }, [stopBLEScan]);
  
  // === FIX: React to enabled changes with stable refs ===
  useEffect(() => {
    if (enabled) {
      const requestAllPermissions = async () => {
        try {
          const granted = await requestBLEPermissions();
          if (!isMounted.current) return;
          setPermissionsGranted(granted);
          if (granted) {
            startBLEScan().catch(() => {});
          } else {
            setError('Bluetooth permissions denied');
          }
        } catch (err) {
          console.warn('[useBLE] Permission request error (swallowed):', err);
          if (isMounted.current) setError('Failed to request permissions');
        }
      };
      
      requestAllPermissions();
    } else {
      stopBLEScan();
    }
  }, [enabled, startBLEScan, stopBLEScan]); // === FIX: Safe deps — all stable ===
  
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
    resetDetectedUUIDs,
  };
};

export default useBLE;
