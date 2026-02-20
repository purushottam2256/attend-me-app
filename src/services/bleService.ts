/**
 * BLE Service - Bluetooth Low Energy scanning for student attendance
 * 
 * Features:
 * - Initialize BLE manager
 * - Scan for student device UUIDs
 * - Match detected UUIDs with student records
 * - RSSI threshold filtering
 * - Scan timeout protection
 * 
 * NOTE ON BACKGROUND SCANNING:
 * - This implementation primarily supports foreground scanning.
 * - For true background scanning (screen off/app minimized):
 *   1. iOS: Requires 'Uses Bluetooth LE accessories' in UIBackgroundModes (Info.plist) and EAS Build.
 *   2. Android: Requires ACCESS_BACKGROUND_LOCATION and foreground service.
 *   3. Expo Go: Background scanning is NOT supported.
 *   4. Library: react-native-ble-plx has limited background support without ejection.
 * 
 * NOTE ON RANGE:
 * - MIN_RSSI is set to -120 to allow maximum range (essentially no filter).
 * - ScanMode.LowLatency is used for highest duty cycle (fastest detection).
 */

import { BleManager, Device, State, ScanMode } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import createLogger from '../utils/logger';

const log = createLogger('BLE');

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
  // Log verbose device info (only in dev)
  VERBOSE_LOGGING: __DEV__,
};

// Background Task Name for keeping app alive
const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

// Define the empty task just to keep the OS happy and the app awake
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  // We don't actually need to do anything with the location data
  // The mere existence of this active task keeps our BLE scanner thread running
});

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
    log.info('Manager initialized');
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
      
      log.info('Android 12+ permissions:', granted ? 'GRANTED' : 'DENIED');
      return granted;
    } else {
      // Android < 12
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      const granted = result === 'granted';
      log.info('Android < 12 permission:', granted ? 'GRANTED' : 'DENIED');
      return granted;
    }
  }
  
  // iOS permissions are handled in Info.plist
  log.info('iOS - permissions handled by system');
  return true;
};

// Start background keep-awake service
const startBackgroundService = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      log.warn('Location foreground permission denied. Background scan will not work.');
      return;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      log.warn('Location background permission denied. Background scan will not work.');
      return;
    }

    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isTaskRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Low,
        timeInterval: 10000,
        distanceInterval: 100,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Attend-Me Scanner Active",
          notificationBody: "Scanning for student beacons in the background...",
          notificationColor: "#0D9488",
        },
      });
      log.info('Background keep-awake service started');
    }
  } catch (error) {
    log.error('Failed to start background service:', error);
  }
};

// Stop background keep-awake service
const stopBackgroundService = async () => {
  try {
    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isTaskRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      log.info('Background keep-awake service stopped');
    }
  } catch (error) {
    log.error('Failed to stop background service:', error);
  }
};

// Check if BLE is ready
export const isBLEReady = async (): Promise<{ ready: boolean; reason?: string }> => {
  const manager = initBLE();
  const state = await manager.state();
  
  log.debug('Checking readiness, state:', state);
  
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
    log.warn('⚠️ Scan already in progress, ignoring duplicate start');
    return () => {}; // Return no-op stop function
  }
  
  const manager = initBLE();
  const minRSSI = options?.minRSSI ?? BLE_CONFIG.MIN_RSSI;
  const timeout = options?.timeout ?? BLE_CONFIG.MAX_SCAN_DURATION;
  
  // Normalize UUIDs for comparison (lowercase, no dashes for flexibility)
  const normalizedStudentUUIDs = studentUUIDs?.map(normalizeUUID) || [];
  
  log.info('==========================================');
  log.info('Starting BLE scan');
  log.info('Looking for', normalizedStudentUUIDs.length, 'student UUIDs');
  log.info('Min RSSI:', minRSSI);
  log.info('Timeout:', timeout / 1000, 'seconds');
  log.info('==========================================');
  
  if (BLE_CONFIG.VERBOSE_LOGGING && studentUUIDs) {
    log.debug('Student UUIDs:', studentUUIDs.slice(0, 5), '...');
  }
  
  isCurrentlyScanning = true;
  
  // Start background location service to keep app awake during scan
  startBackgroundService();
  
  // Set scan timeout
  if (timeout > 0) {
    scanTimeoutHandle = setTimeout(() => {
      log.info('⏰ Scan timeout reached, stopping');
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
        log.error('❌ Scan Error:', error.message);
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
          // Removed verbose logging for performance
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
              log.info('✅ Matched via Service UUID');
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
            log.info('✅ Matched via Device ID');
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
            log.info('✅ Matched via Device Name:', deviceName);
          }
        }
        
        if (matchedUUID) {
          log.info('✅ MATCHED:', matchedUUID, 'from device:', deviceName || deviceId, 'RSSI:', rssi);
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
  
  log.info('🛑 Stopping scan');
  
  // Clear timeout
  if (scanTimeoutHandle) {
    clearTimeout(scanTimeoutHandle);
    scanTimeoutHandle = null;
  }
  
  // Stop scanning
  if (bleManager) {
    bleManager.stopDeviceScan();
  }
  
  // Stop background location service
  stopBackgroundService();
  
  isCurrentlyScanning = false;
};

// Subscribe to BLE state changes
export const onBLEStateChange = (
  callback: (state: BLEState) => void
): (() => void) => {
  const manager = initBLE();
  
  const subscription = manager.onStateChange((state) => {
    log.info('State changed:', state);
    callback(state.toLowerCase() as BLEState);
  }, true);
  
  return () => subscription.remove();
};

// Destroy BLE Manager (cleanup)
export const destroyBLE = (): void => {
  stopScanning();
  
  if (bleManager) {
    log.info('Destroying manager');
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
