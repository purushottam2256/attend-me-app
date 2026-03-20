import { trackEvent, trackScreen, getStoredEvents, clearStoredEvents, Events } from '../src/services/analyticsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('Analytics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('tracks a screen view correctly', async () => {
    trackScreen('Home');

    // Due to the async nature of the internal trackEvent call, we wait a tick
    await new Promise(process.nextTick);

    expect(AsyncStorage.getItem).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('screen_view')
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Home')
    );
  });

  it('tracks a custom event securely without crashing', async () => {
    await trackEvent(Events.ATTENDANCE_SUBMITTED, { count: 5 });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(Events.ATTENDANCE_SUBMITTED)
    );
  });

  it('clears stored events successfully', async () => {
    await clearStoredEvents();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@attend_me/analytics_events');
  });
});
