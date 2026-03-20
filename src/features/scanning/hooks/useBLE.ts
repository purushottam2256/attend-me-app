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
import * as Location from 'expo-location';
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
      
      // Notify parent (use ref for latest callback)
      onStudentDetectedRef.current(studentId);
    } else {
      console.log('[useBLE] ❌ No match for UUID:', uuid.substring(0, 12) + '...');
      const availableUUIDs = Array.from(uuidToStudentMap.current.keys()).slice(0, 3);
      if (availableUUIDs.length > 0) {
        console.log('[useBLE] Available UUIDs (first 3):', availableUUIDs.map(u => u.substring(0, 12) + '...'));
      }
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
      setIsScanning(true);
      console.log('[useBLE] ✅ Scan started');
    } finally {
      isStartingRef.current = false;
    }
  }, [handleDeviceDetected]); // === FIX: Only depends on stable handleDeviceDetected ===
  
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
        setError(null);
        
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
  }, [enabled, startBLEScan]); // Safe now because startBLEScan is stable
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useBLE] Unmounting - cleanup');
      stopBLEScan();
    };
  }, [stopBLEScan]);
  
  // === FIX: React to enabled changes with stable refs ===
  // Also request Location permission (Android REQUIRES it for BLE scanning)
  useEffect(() => {
    if (enabled) {
      console.log('[useBLE] Enabled=true - requesting permissions then scan');
      
      const requestAllPermissions = async () => {
        // 1. Request Location permission (required for BLE on Android)
        if (Platform.OS === 'android') {
          try {
            const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
            console.log('[useBLE] Location permission:', locStatus);
            
            if (locStatus !== 'granted') {
              setError('Location permission is required for Bluetooth scanning');
              Alert.alert(
                'Location Permission Required',
                'Android requires Location access to scan for Bluetooth devices. Please grant location permission in Settings.',
                [
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
              return;
            }
            
            // 2. Check if Location Services (GPS) are enabled
            const locationEnabled = await Location.hasServicesEnabledAsync();
            console.log('[useBLE] Location services enabled:', locationEnabled);
            
            if (!locationEnabled) {
              Alert.alert(
                'Enable GPS',
                'Please turn on Location/GPS services. Bluetooth scanning requires GPS to be active on Android.',
                [
                  { text: 'Open Settings', onPress: () => Linking.sendIntent?.('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings()) },
                  { text: 'Continue Anyway', style: 'cancel' }
                ]
              );
            }
          } catch (locErr) {
            console.warn('[useBLE] Location permission error:', locErr);
          }
        }
        
        // 3. Request BLE permissions
        const granted = await requestBLEPermissions();
        setPermissionsGranted(granted);
        if (granted) {
          console.log('[useBLE] All permissions granted - starting scan');
          startBLEScan();
        } else {
          console.log('[useBLE] BLE Permissions denied');
          setError('Bluetooth permissions denied');
        }
      };
      
      requestAllPermissions();
    } else {
      console.log('[useBLE] Enabled=false - stopping scan');
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
