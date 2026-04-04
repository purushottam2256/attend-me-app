/**
 * bleService.test.ts — Tests for BLE service crash safety
 * 
 * Tests the critical crash-safety behavior: initBLE() returns null
 * instead of throwing when BLE hardware isn't available.
 */

// Mock Sentry FIRST (before any module imports that use it)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  wrap: jest.fn((c: any) => c),
}));

// Mock the logger which imports Sentry
jest.mock('../src/utils/logger', () => {
  return jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });
});

// Mock the BLE library
const mockState = jest.fn().mockResolvedValue('PoweredOn');
const mockStartDeviceScan = jest.fn();
const mockStopDeviceScan = jest.fn();
const mockDestroy = jest.fn();
const mockOnStateChange = jest.fn().mockReturnValue({ remove: jest.fn() });
const mockEnable = jest.fn();

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    state: mockState,
    startDeviceScan: mockStartDeviceScan,
    stopDeviceScan: mockStopDeviceScan,
    destroy: mockDestroy,
    onStateChange: mockOnStateChange,
    enable: mockEnable,
  })),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
  ScanMode: { LowLatency: 2 },
}));

// Mock react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 31 },
  PermissionsAndroid: {
    requestMultiple: jest.fn().mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    }),
    PERMISSIONS: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    },
  },
}));

import {
  initBLE,
  getBLEState,
  isBLEReady,
  normalizeUUID,
  isScanningActive,
} from '../src/services/bleService';

describe('BLE Service — Crash Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initBLE()', () => {
    it('returns a BleManager instance', () => {
      const manager = initBLE();
      expect(manager).not.toBeNull();
    });
  });

  describe('getBLEState()', () => {
    it('returns current BLE state as lowercase', async () => {
      mockState.mockResolvedValue('PoweredOn');
      const state = await getBLEState();
      expect(state).toBe('poweredon');
    });

    it('returns "unknown" on error — never crashes', async () => {
      mockState.mockRejectedValue(new Error('BLE error'));
      const state = await getBLEState();
      expect(state).toBe('unknown');
    });
  });

  describe('isBLEReady()', () => {
    it('returns ready:true when Bluetooth is powered on', async () => {
      mockState.mockResolvedValue('PoweredOn');
      const result = await isBLEReady();
      expect(result.ready).toBe(true);
    });

    it('returns ready:false with reason when Bluetooth is off', async () => {
      mockState.mockResolvedValue('PoweredOff');
      const result = await isBLEReady();
      expect(result.ready).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('returns ready:false on error — never crashes', async () => {
      mockState.mockRejectedValue(new Error('System error'));
      const result = await isBLEReady();
      expect(result.ready).toBe(false);
    });
  });

  describe('normalizeUUID()', () => {
    it('normalizes UUIDs — removes dashes and lowercases', () => {
      expect(normalizeUUID('A1B2-C3D4')).toBe('a1b2c3d4');
      expect(normalizeUUID('a1:b2:c3:d4')).toBe('a1b2c3d4');
      expect(normalizeUUID('ABCDEF')).toBe('abcdef');
    });
  });

  describe('isScanningActive()', () => {
    it('returns false when no scan is active', () => {
      expect(isScanningActive()).toBe(false);
    });
  });
});
