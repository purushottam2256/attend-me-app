/**
 * BLE Service - Bluetooth Low Energy scanning for student attendance
 * 
 * Features:
 * - Initialize BLE manager
 * - Scan for student device UUIDs
 * - Match detected UUIDs with student records
 * - RSSI threshold filtering
 * - Scan timeout protection
 */

import { BleManager, Device, State, ScanMode } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

// Singleton BLE Manager
let bleManager: BleManager | null = null;

// Track if scan is currently active
let isCurrentlyScanning = false;

// Scan timeout handle
let scanTimeoutHandle: NodeJS.Timeout | null = null;

// Configuration
const BLE_CONFIG = {
  // Minimum signal strength to accept (-120 = practically no filter, max range)
  MIN_RSSI: -120,
  // Maximum scan duration in milliseconds (60 minutes - full class period)
  MAX_SCAN_DURATION: 60 * 60 * 1000,
  // Log verbose device info
  VERBOSE_LOGGING: true,
};

export interface DetectedStudent {
  uuid: string;
  rssi: number;
  deviceName: string | null;
}

export type BLEState = 'unknown' | 'resetting' | 'unsupported' | 'unauthorized' | 'off' | 'on';

// Initialize BLE Manager
export const initBLE = (): BleManager => {
  if (!bleManager) {
    bleManager = new BleManager();
    console.log('[BLE] Manager initialized');
  }
  return bleManager;
};

// Get BLE state
export const getBLEState = async (): Promise<BLEState> => {
  const manager = initBLE();
  const state = await manager.state();
  return state.toLowerCase() as BLEState;
};

// Normalize UUID for comparison (removes dashes, lowercases)
export const normalizeUUID = (uuid: string): string => {
  return uuid.toLowerCase().replace(/[-:]/g, '');
};

// Request BLE permissions (Android)
export const requestBLEPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const apiLevel = Platform.Version;
    
    if (apiLevel >= 31) {
      // Android 12+
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      
      const granted = (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
      );
      
      console.log('[BLE] Android 12+ permissions:', granted ? 'GRANTED' : 'DENIED');
      return granted;
    } else {
      // Android < 12
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      const granted = result === 'granted';
      console.log('[BLE] Android < 12 permission:', granted ? 'GRANTED' : 'DENIED');
      return granted;
    }
  }
  
  // iOS permissions are handled in Info.plist
  console.log('[BLE] iOS - permissions handled by system');
  return true;
};

// Check if BLE is ready
export const isBLEReady = async (): Promise<{ ready: boolean; reason?: string }> => {
  const manager = initBLE();
  const state = await manager.state();
  
  console.log('[BLE] Checking readiness, state:', state);
  
  if (state !== State.PoweredOn) {
    if (state === State.PoweredOff) {
      return { ready: false, reason: 'Bluetooth is turned off' };
    }
    if (state === State.Unauthorized) {
      return { ready: false, reason: 'Bluetooth permission denied' };
    }
    if (state === State.Unsupported) {
      return { ready: false, reason: 'Bluetooth not supported on this device' };
    }
    return { ready: false, reason: 'Bluetooth not ready' };
  }
  
  return { ready: true };
};

// Check if scanning is active
export const isScanningActive = (): boolean => {
  return isCurrentlyScanning;
};

// Scan for student devices by Service UUID
export const startScanning = (
  onDeviceFound: (device: DetectedStudent) => void,
  studentUUIDs?: string[], // Optional filter for specific UUIDs
  options?: {
    minRSSI?: number;
    timeout?: number;
    onTimeout?: () => void;
    onError?: (error: Error) => void;
  }
): (() => void) => {
  // Guard: prevent double start
  if (isCurrentlyScanning) {
    console.warn('[BLE] ⚠️ Scan already in progress, ignoring duplicate start');
    return () => {}; // Return no-op stop function
  }
  
  const manager = initBLE();
  const minRSSI = options?.minRSSI ?? BLE_CONFIG.MIN_RSSI;
  const timeout = options?.timeout ?? BLE_CONFIG.MAX_SCAN_DURATION;
  
  // Normalize UUIDs for comparison (lowercase, no dashes for flexibility)
  const normalizedStudentUUIDs = studentUUIDs?.map(normalizeUUID) || [];
  
  console.log('[BLE] ==========================================');
  console.log('[BLE] Starting BLE scan');
  console.log('[BLE] Looking for', normalizedStudentUUIDs.length, 'student UUIDs');
  console.log('[BLE] Min RSSI:', minRSSI);
  console.log('[BLE] Timeout:', timeout / 1000, 'seconds');
  console.log('[BLE] ==========================================');
  
  if (BLE_CONFIG.VERBOSE_LOGGING && studentUUIDs) {
    console.log('[BLE] Student UUIDs:', studentUUIDs.slice(0, 5), '...');
  }
  
  isCurrentlyScanning = true;
  
  // Set scan timeout
  if (timeout > 0) {
    scanTimeoutHandle = setTimeout(() => {
      console.log('[BLE] ⏰ Scan timeout reached, stopping');
      stopScanning();
      options?.onTimeout?.();
    }, timeout);
  }
  
  // Track detected devices to avoid duplicate logging
  const detectedDeviceIds = new Set<string>();
  
  // Start scanning
  manager.startDeviceScan(
    null, // Scan all devices to see their advertised UUIDs
    { 
      allowDuplicates: true, // Key fix: Allow updates so we catch them when RSSI improves
      scanMode: ScanMode.LowLatency // Android: Aggressive scanning for best results
    },
    (error, device) => {
      if (error) {
        console.error('[BLE] ❌ Scan Error:', error.message);
        options?.onError?.(error);
        return;
      }
      
      if (device) {
        const deviceName = device.name || device.localName || '';
        const deviceId = device.id; // MAC address or device ID
        const rssi = device.rssi || -100;
        
        // Get advertised Service UUIDs from the device
        const serviceUUIDs = device.serviceUUIDs || [];
        
        // RSSI filter - ignore weak signals
        if (rssi < minRSSI) {
          return; // Too far away or weak signal
        }
        
        // Log ALL devices for debugging (first time only)
        if (!detectedDeviceIds.has(deviceId)) {
          detectedDeviceIds.add(deviceId);
          if (BLE_CONFIG.VERBOSE_LOGGING) {
            console.log('[BLE] 📱 Device found:', {
              id: deviceId,
              name: deviceName || 'No Name',
              rssi,
              serviceUUIDs: serviceUUIDs.length > 0 ? serviceUUIDs : 'none',
            });
          }
        }
        
        // Check if any of the device's Service UUIDs match our student list
        let matchedUUID: string | null = null;
        
        // 1. Check Service UUIDs
        for (const serviceUUID of serviceUUIDs) {
          const normalizedServiceUUID = normalizeUUID(serviceUUID);
          
          if (normalizedStudentUUIDs.length > 0) {
            const matchIndex = normalizedStudentUUIDs.findIndex(
              studentUUID => normalizedServiceUUID.includes(studentUUID) || 
                             studentUUID.includes(normalizedServiceUUID)
            );
            
            if (matchIndex >= 0) {
              matchedUUID = studentUUIDs![matchIndex];
              console.log('[BLE] ✅ Matched via Service UUID');
              break;
            }
          }
        }
        
        // 2. Check device ID (MAC address) as fallback
        if (!matchedUUID && normalizedStudentUUIDs.length > 0) {
          const normalizedDeviceId = normalizeUUID(deviceId);
          const matchIndex = normalizedStudentUUIDs.findIndex(
            studentUUID => normalizedDeviceId === studentUUID || 
                           normalizedDeviceId.includes(studentUUID) ||
                           studentUUID.includes(normalizedDeviceId)
          );
          if (matchIndex >= 0) {
            matchedUUID = studentUUIDs![matchIndex];
            console.log('[BLE] ✅ Matched via Device ID');
          }
        }
        
        // 3. Check device NAME - for nRF Connect which advertises via name
        if (!matchedUUID && deviceName && normalizedStudentUUIDs.length > 0) {
          const normalizedDeviceName = normalizeUUID(deviceName);
          const matchIndex = normalizedStudentUUIDs.findIndex(
            studentUUID => normalizedDeviceName.includes(studentUUID) ||
                           studentUUID.includes(normalizedDeviceName) ||
                           deviceName.toLowerCase() === studentUUID.toLowerCase()
          );
          if (matchIndex >= 0) {
            matchedUUID = studentUUIDs![matchIndex];
            console.log('[BLE] ✅ Matched via Device Name:', deviceName);
          }
        }
        
        if (matchedUUID) {
          console.log('[BLE] ✅ MATCHED:', matchedUUID, 'from device:', deviceName || deviceId, 'RSSI:', rssi);
          onDeviceFound({
            uuid: matchedUUID,
            rssi,
            deviceName,
          });
        }
      }
    }
  );
  
  // Return stop function
  return () => {
    stopScanning();
  };
};

// Stop scanning
export const stopScanning = (): void => {
  if (!isCurrentlyScanning) {
    return; // Already stopped
  }
  
  console.log('[BLE] 🛑 Stopping scan');
  
  // Clear timeout
  if (scanTimeoutHandle) {
    clearTimeout(scanTimeoutHandle);
    scanTimeoutHandle = null;
  }
  
  // Stop scanning
  if (bleManager) {
    bleManager.stopDeviceScan();
  }
  
  isCurrentlyScanning = false;
};

// Subscribe to BLE state changes
export const onBLEStateChange = (
  callback: (state: BLEState) => void
): (() => void) => {
  const manager = initBLE();
  
  const subscription = manager.onStateChange((state) => {
    console.log('[BLE] State changed:', state);
    callback(state.toLowerCase() as BLEState);
  }, true);
  
  return () => subscription.remove();
};

// Destroy BLE Manager (cleanup)
export const destroyBLE = (): void => {
  stopScanning();
  
  if (bleManager) {
    console.log('[BLE] Destroying manager');
    bleManager.destroy();
    bleManager = null;
  }
};

// Get scan status info (for debugging)
export const getScanStatus = () => ({
  isScanning: isCurrentlyScanning,
  hasManager: bleManager !== null,
  hasTimeout: scanTimeoutHandle !== null,
});

export default {
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
  getScanStatus,
  BLE_CONFIG,
};
