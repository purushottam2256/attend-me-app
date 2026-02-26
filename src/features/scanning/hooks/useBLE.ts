/**
 * useBLE Hook - React hook for BLE scanning in ScanScreen
 * 
 * Provides:
 * - BLE state management
 * - Permission handling
 * - Student device detection with auto-marking
 * - Scan timeout protection
 * - Proper cleanup on unmount/blur
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const isStartingRef = useRef(false); // Prevent concurrent start attempts
  
  // Create UUID to student ID map
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
        
        // Log first 5 mappings for debugging
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
  
  // Initialize BLE and listen for state changes with auto-resume
  useEffect(() => {
    if (!enabled) return;
    
    initBLE();
    let previousState: BLEState = 'unknown';
    
    // Get initial state
    getBLEState().then(state => {
      console.log('[useBLE] Initial BLE state:', state);
      setBLEState(state);
      previousState = state;
    });
    
    // Subscribe to state changes with auto-resume
    const unsubscribe = onBLEStateChange((state) => {
      console.log('[useBLE] BLE state changed:', previousState, '→', state);
      setBLEState(state);
      
      // Auto-resume: if Bluetooth was off and is now on, restart scan
      if (previousState === 'off' && state === 'on') {
        console.log('[useBLE] 🔄 Bluetooth enabled! Auto-resuming scan...');
        setError(null); // Clear any previous errors
        
        // Small delay to let BLE fully initialize
        setTimeout(() => {
          if (!isScanningActive()) {
            console.log('[useBLE] Starting scan after BLE enabled...');
            startBLEScan().catch(err => {
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
  }, [enabled, startBLEScan]);
  
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
  
  // Handle detected device
  const handleDeviceDetected = useCallback((device: DetectedStudent) => {
    const uuid = normalizeUUID(device.uuid);
    
    console.log('[useBLE] Device callback:', { 
      uuid: uuid.substring(0, 12) + '...', 
      name: device.deviceName, 
      rssi: device.rssi 
    });
    
    // Check if already detected
    if (detectedUUIDsRef.current.has(uuid)) {
      console.log('[useBLE] Already detected, skipping');
      return;
    }
    
    // Check if matches a student
    const mapSize = uuidToStudentMap.current.size;
    console.log('[useBLE] Looking up in map with', mapSize, 'entries');
    
    const studentId = uuidToStudentMap.current.get(uuid);
    
    if (studentId) {
      console.log('[useBLE] ✅ MATCH FOUND! UUID → StudentID:', studentId);
      
      // Mark as detected
      detectedUUIDsRef.current.add(uuid);
      setDetectedCount(prev => prev + 1);
      setLastDetected(uuid);
      
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Notify parent
      onStudentDetected(studentId);
    } else {
      console.log('[useBLE] ❌ No match for UUID:', uuid.substring(0, 12) + '...');
      // Show first few available UUIDs for debugging
      const availableUUIDs = Array.from(uuidToStudentMap.current.keys()).slice(0, 3);
      if (availableUUIDs.length > 0) {
        console.log('[useBLE] Available UUIDs (first 3):', availableUUIDs.map(u => u.substring(0, 12) + '...'));
      }
    }
  }, [onStudentDetected]);
  
  // Start scanning
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
      if (!ready) {
        console.error('[useBLE] ❌ BLE not ready:', reason);
        setError(reason || 'BLE not ready');
        return;
      }
      
      // Reset detected UUIDs for new scan
      detectedUUIDsRef.current.clear();
      setDetectedCount(0);
      setError(null);
      
      // Get student UUIDs for filtering
      const studentUUIDs = students
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
        timeout: scanTimeout,
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
      setIsScanning(true);
      console.log('[useBLE] ✅ Scan started');
    } finally {
      isStartingRef.current = false;
    }
  }, [students, handleDeviceDetected, scanTimeout]);
  
  // Stop scanning
  const stopBLEScan = useCallback(() => {
    console.log('[useBLE] Stopping scan...');
    
    if (stopScanRef.current) {
      stopScanRef.current();
      stopScanRef.current = null;
    }
    
    // Also call global stop to be sure
    stopScanning();
    
    setIsScanning(false);
    console.log('[useBLE] Scan stopped');
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useBLE] Unmounting - cleanup');
      stopBLEScan();
    };
  }, [stopBLEScan]);
  
  // React to enabled changes (play/pause toggle)
  useEffect(() => {
    if (enabled) {
      // When enabled (play), request permissions then start scanning
      console.log('[useBLE] Enabled=true - requesting permissions then scan');
      requestBLEPermissions().then((granted) => {
        setPermissionsGranted(granted);
        if (granted) {
          console.log('[useBLE] Permissions granted - starting scan');
          startBLEScan();
        } else {
          console.log('[useBLE] Permissions denied');
          setError('Bluetooth permissions denied');
        }
      });
    } else {
      // When disabled (pause), stop scanning immediately
      console.log('[useBLE] Enabled=false - stopping scan');
      stopBLEScan();
    }
  }, [enabled]); // Intentionally not including other deps to avoid loops
  
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
