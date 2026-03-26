/**
 * BLE Service - Bluetooth Low Energy scanning for student attendance
 * 
 * Features:
 * - Initialize BLE manager
 * - Scan for student device UUIDs
 * - Match detected UUIDs with student records
 * - RSSI threshold filtering
 * - Scan timeout protection
 * - IN-MEMORY EVENT QUEUE: BLE scanner does NOT directly update UI.
 *   Results are queued and batch-processed every 500ms for stability.
 * - All BLE logic wrapped in try/catch — never crashes the app.
 */

import { BleManager, Device, State, ScanMode } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import createLogger from '../utils/logger';

const log = createLogger('BLE');

// Singleton BLE Manager
let bleManager: BleManager | null = null;

// Track if scan is currently active
let isCurrentlyScanning = false;

// Scan timeout handle
let scanTimeoutHandle: NodeJS.Timeout | null = null;

// ============================================================================
// IN-MEMORY EVENT QUEUE
// ============================================================================
let bleEventQueue: DetectedStudent[] = [];
let bleQueueInterval: NodeJS.Timeout | null = null;
let bleQueueCallback: ((devices: DetectedStudent[]) => void) | null = null;

// Deduplication set — tracks UUIDs already delivered in this scan session
const deliveredUUIDs = new Set<string>();

// Configuration
const BLE_CONFIG = {
  // Minimum signal strength to accept (-120 = practically no filter, max range)
  MIN_RSSI: -120,
  // Maximum scan duration in milliseconds (60 minutes - full class period)
  MAX_SCAN_DURATION: 60 * 60 * 1000,
  // Queue processing interval (ms)
  QUEUE_INTERVAL: 500,
  // Log verbose device info (only in dev)
  VERBOSE_LOGGING: __DEV__,
};

export interface DetectedStudent {
  uuid: string;
  rssi: number;
  deviceName: string | null;
}

export type BLEState = 'unknown' | 'resetting' | 'unsupported' | 'unauthorized' | 'off' | 'on';

// Initialize BLE Manager
export const initBLE = (): BleManager => {
  try {
    if (!bleManager) {
      bleManager = new BleManager();
      log.info('Manager initialized');
    }
    return bleManager;
  } catch (error: any) {
    log.error('Failed to initialize BLE Manager:', error);
    throw error;
  }
};

// Get BLE state
export const getBLEState = async (): Promise<BLEState> => {
  try {
    const manager = initBLE();
    const state = await manager.state();
    return state.toLowerCase() as BLEState;
  } catch (error: any) {
    log.error('Failed to get BLE state:', error);
    return 'unknown';
  }
};

// Normalize UUID for comparison (removes dashes, lowercases)
export const normalizeUUID = (uuid: string): string => {
  return uuid.toLowerCase().replace(/[-:]/g, '');
};

// Request BLE permissions (Android)
export const requestBLEPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      
      if (apiLevel >= 31) {
        // Android 12+
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        
        const granted = (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
        );
        
        log.info('Android 12+ permissions:', granted ? 'GRANTED' : 'DENIED');
        return granted;
      } else {
        log.info('Android < 12 Location permission bypassed');
        return true;
      }
    }
    
    // iOS permissions are handled in Info.plist
    log.info('iOS - permissions handled by system');
    return true;
  } catch (error: any) {
    log.error('Failed to request BLE permissions:', error);
    return false;
  }
};

// Check if BLE is ready
export const isBLEReady = async (): Promise<{ ready: boolean; reason?: string }> => {
  try {
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
  } catch (error: any) {
    log.error('BLE readiness check failed:', error);
    return { ready: false, reason: 'Bluetooth check failed' };
  }
};

// Enable Bluetooth programmatically (Android only)
export const enableBluetooth = async (): Promise<boolean> => {
  try {
    if (Platform.OS !== 'android') {
      log.info('enableBluetooth: Not supported on iOS');
      return false;
    }
    
    const manager = initBLE();
    const state = await manager.state();
    
    if (state === State.PoweredOn) {
      log.info('enableBluetooth: Already enabled');
      return true;
    }
    
    log.info('enableBluetooth: Attempting to enable Bluetooth...');
    await manager.enable();
    
    // Wait briefly for state change to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newState = await manager.state();
    const success = newState === State.PoweredOn;
    log.info('enableBluetooth:', success ? 'SUCCESS' : 'FAILED (user denied or error)');
    return success;
  } catch (err: any) {
    log.error('enableBluetooth: Error:', err?.message || err);
    return false;
  }
};

// Check if scanning is active
export const isScanningActive = (): boolean => {
  return isCurrentlyScanning;
};

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process the BLE event queue — deduplicates, validates, and batch-delivers results.
 * Runs on a 500ms interval while scanning is active.
 */
function processBLEQueue(): void {
  try {
    if (bleEventQueue.length === 0 || !bleQueueCallback) return;

    // Grab and clear the queue atomically
    const batch = bleEventQueue.splice(0, bleEventQueue.length);

    // Deduplicate within the batch — keep the strongest RSSI for each UUID
    const bestByUUID = new Map<string, DetectedStudent>();
    for (const device of batch) {
      // VALIDATION: Skip devices with invalid/missing UUIDs
      if (!device.uuid || typeof device.uuid !== 'string' || device.uuid.trim().length === 0) {
        continue;
      }

      const normalized = normalizeUUID(device.uuid);
      
      // Skip if already delivered in this scan session
      if (deliveredUUIDs.has(normalized)) {
        continue;
      }

      const existing = bestByUUID.get(normalized);
      if (!existing || device.rssi > existing.rssi) {
        bestByUUID.set(normalized, device);
      }
    }

    // Deliver new unique results
    for (const [normalized, device] of bestByUUID) {
      deliveredUUIDs.add(normalized);
      try {
        bleQueueCallback([device]);
      } catch (callbackError) {
        log.error('BLE queue callback error:', callbackError);
      }
    }
  } catch (error) {
    log.error('BLE queue processing error:', error);
  }
}

/**
 * Start the queue processing interval
 */
function startQueueProcessing(callback: (devices: DetectedStudent[]) => void): void {
  bleQueueCallback = callback;
  deliveredUUIDs.clear();
  bleEventQueue = [];

  if (bleQueueInterval) {
    clearInterval(bleQueueInterval);
  }
  bleQueueInterval = setInterval(processBLEQueue, BLE_CONFIG.QUEUE_INTERVAL);
}

/**
 * Stop the queue processing interval
 */
function stopQueueProcessing(): void {
  if (bleQueueInterval) {
    clearInterval(bleQueueInterval);
    bleQueueInterval = null;
  }
  // Process any remaining items
  processBLEQueue();
  
  bleQueueCallback = null;
  bleEventQueue = [];
  deliveredUUIDs.clear();
}

// ============================================================================
// SCANNING
// ============================================================================

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
  try {
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

    // Start queue processing — devices are delivered via the queue, not directly
    startQueueProcessing((devices) => {
      for (const device of devices) {
        onDeviceFound(device);
      }
    });
    
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
        try {
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
              if (BLE_CONFIG.VERBOSE_LOGGING) {
                log.debug('📱 Device found:', {
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
              // Push to queue instead of calling onDeviceFound directly
              bleEventQueue.push({
                uuid: matchedUUID,
                rssi,
                deviceName,
              });
            }
          }
        } catch (scanCallbackError) {
          // NEVER let a scan callback crash the app
          log.error('Scan callback error (swallowed):', scanCallbackError);
        }
      }
    );
    
    // Return stop function
    return () => {
      stopScanning();
    };
  } catch (error: any) {
    log.error('Failed to start scanning:', error);
    isCurrentlyScanning = false;
    stopQueueProcessing();
    options?.onError?.(error instanceof Error ? error : new Error(String(error)));
    return () => {};
  }
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
  
  // Stop queue processing
  stopQueueProcessing();
  
  // Stop scanning
  try {
    if (bleManager) {
      bleManager.stopDeviceScan();
    }
  } catch (error) {
    log.error('Error stopping device scan:', error);
  }
  
  isCurrentlyScanning = false;
};

// Subscribe to BLE state changes
export const onBLEStateChange = (
  callback: (state: BLEState) => void
): (() => void) => {
  try {
    const manager = initBLE();
    
    const subscription = manager.onStateChange((state) => {
      log.info('State changed:', state);
      callback(state.toLowerCase() as BLEState);
    }, true);
    
    return () => subscription.remove();
  } catch (error) {
    log.error('Failed to subscribe to BLE state changes:', error);
    return () => {};
  }
};

// Destroy BLE Manager (cleanup)
export const destroyBLE = (): void => {
  stopScanning();
  
  try {
    if (bleManager) {
      log.info('Destroying manager');
      bleManager.destroy();
      bleManager = null;
    }
  } catch (error) {
    log.error('Error destroying BLE manager:', error);
    bleManager = null;
  }
};

// Get scan status info (for debugging)
export const getScanStatus = () => ({
  isScanning: isCurrentlyScanning,
  hasManager: bleManager !== null,
  hasTimeout: scanTimeoutHandle !== null,
  queueSize: bleEventQueue.length,
  deliveredCount: deliveredUUIDs.size,
});

export default {
  initBLE,
  getBLEState,
  normalizeUUID,
  requestBLEPermissions,
  isBLEReady,
  enableBluetooth,
  isScanningActive,
  startScanning,
  stopScanning,
  onBLEStateChange,
  destroyBLE,
  getScanStatus,
  BLE_CONFIG,
};
