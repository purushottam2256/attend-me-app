import { checkForUpdates, getUpdateInfo } from '../src/services/updateService';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

// Mock Expo Updates
jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  channel: 'production',
  updateId: 'test-id-123',
  isEmbeddedLaunch: false,
}));

// Mock Alert
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  Platform: { OS: 'android' },
}));

describe('OTA Update Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__DEV__ = false; // Updates only run in production
  });

  afterAll(() => {
    global.__DEV__ = true; // Restore
  });

  it('checks for updates but does nothing if none are available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });

    await checkForUpdates();

    expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('fetches updates and prompts the user if one is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValue({ isNew: true });

    await checkForUpdates();

    expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Update Available',
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    );
  });

  it('returns formatted update info for the settings screen', () => {
    const info = getUpdateInfo();
    expect(info.channel).toBe('production');
    expect(info.updateId).toBe('test-id-123');
    expect(info.isEmbeddedLaunch).toBe(false);
  });
});
