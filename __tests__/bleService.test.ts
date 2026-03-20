import { BleManager, State } from 'react-native-ble-plx';
import { BLEService } from '../src/services/bleService';

// Mock react-native-ble-plx
jest.mock('react-native-ble-plx', () => {
  return {
    BleManager: jest.fn().mockImplementation(() => ({
      state: jest.fn().mockResolvedValue('PoweredOn'),
      startDeviceScan: jest.fn(),
      stopDeviceScan: jest.fn(),
      destroy: jest.fn(),
    })),
    State: {
      PoweredOn: 'PoweredOn',
      PoweredOff: 'PoweredOff',
    },
  };
});

// Mock Analytics
jest.mock('../src/services/analyticsService', () => ({
  trackEvent: jest.fn(),
  Events: { BLE_SCAN_STARTED: 'BLE_SCAN_STARTED', BLE_ERROR: 'BLE_ERROR' },
}));

describe('BLE Service (Hardware API)', () => {
  let bleService: BLEService;
  let mockManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    bleService = BLEService.getInstance();
    mockManager = (bleService as any).manager;
  });

  afterAll(() => {
    bleService.destroy(); // Cleanup singleton
  });

  it('initializes the BLE manager successfully without crashing', () => {
    expect(mockManager).toBeDefined();
  });

  it('starts scanning when Bluetooth is powered on', async () => {
    const mockCallback = jest.fn();
    
    // Fake the state as PoweredOn
    (mockManager.state as jest.Mock).mockResolvedValue(State.PoweredOn);

    await bleService.startScanning(['custom-uuid-123'], mockCallback);

    expect(mockManager.startDeviceScan).toHaveBeenCalledWith(
      ['custom-uuid-123'],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('stops scanning successfully and cleans up listeners', () => {
    bleService.stopScanning();
    expect(mockManager.stopDeviceScan).toHaveBeenCalled();
  });

  it('safely handles startup errors when Bluetooth is disabled', async () => {
    // Fake the state as PoweredOff
    (mockManager.state as jest.Mock).mockResolvedValue(State.PoweredOff);
    const mockCallback = jest.fn();

    await expect(bleService.startScanning([], mockCallback))
      .rejects
      .toThrow('Bluetooth is not completely powered on');
      
    expect(mockManager.startDeviceScan).not.toHaveBeenCalled();
  });
});
