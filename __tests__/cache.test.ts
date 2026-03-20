import { cachePermissions, getCachedPermissions, purgeExpiredPermissions } from '../src/services/offline/cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/services/offline/types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('Offline Cache Service - Permissions', () => {
  const MOCK_DATE = '2026-03-20';
  const MOCK_PERMISSIONS = [
    { student_id: '1', type: 'od', start_date: '2026-03-19', end_date: '2026-03-21' },
    { student_id: '2', type: 'leave', start_date: '2026-03-20', end_date: '2026-03-20' }
  ] as any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Required to mock InteractionManager.runAfterInteractions which cachePermissions uses
    jest.mock('react-native', () => ({
      InteractionManager: {
        runAfterInteractions: (cb: any) => cb(),
      },
    }));
  });

  describe('getCachedPermissions', () => {
    it('returns empty array when cache is empty', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
      const result = await getCachedPermissions(MOCK_DATE);
      expect(result).toEqual([]);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.PERMISSIONS);
    });

    it('returns permissions for the specified date', async () => {
      const mockStorage = JSON.stringify({ [MOCK_DATE]: MOCK_PERMISSIONS });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(mockStorage);
      
      const result = await getCachedPermissions(MOCK_DATE);
      expect(result).toEqual(MOCK_PERMISSIONS);
    });

    it('returns empty array if date not in cache', async () => {
      const mockStorage = JSON.stringify({ '2026-03-19': MOCK_PERMISSIONS });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(mockStorage);
      
      const result = await getCachedPermissions('2026-03-25');
      expect(result).toEqual([]);
    });

    it('returns empty array and logs error if JSON parse fails', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('invalid json');
      const result = await getCachedPermissions(MOCK_DATE);
      expect(result).toEqual([]);
    });
  });
});
