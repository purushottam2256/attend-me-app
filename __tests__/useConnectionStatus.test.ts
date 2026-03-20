import { renderHook, act } from '@testing-library/react-native';
import { useConnectionStatus } from '../src/hooks/useConnectionStatus';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { getQueueCount } from '../src/services/offline/cache';

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(),
}));

jest.mock('../src/services/offline/cache', () => ({
  getQueueCount: jest.fn(),
}));

describe('useConnectionStatus Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate initial online state
    (useNetworkStatus as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
    (getQueueCount as jest.Mock).mockResolvedValue(0);
  });

  it('returns online status when connected with no queue', () => {
    const { result } = renderHook(() => useConnectionStatus());
    
    expect(result.current.status).toBe('online');
    expect(result.current.queueCount).toBe(0);
  });

  it('maintains online status even if there is an offline queue (but sets syncing=true)', async () => {
    (getQueueCount as jest.Mock).mockResolvedValue(5);
    
    const { result, waitForNextUpdate } = renderHook(() => useConnectionStatus());
    
    // Wait for internal async effect to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.status).toBe('online');
    expect(result.current.queueCount).toBe(5);
  });

  it('returns offline status when internet is strictly unreachable', () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: false });

    const { result } = renderHook(() => useConnectionStatus());
    
    expect(result.current.status).toBe('offline');
  });
});
