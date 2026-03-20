import { processBackgroundSync } from '../src/services/backgroundSync';
import { supabase } from '../src/config/supabase';
import { fetchQueue, getQueueCount, updateQueueStatus } from '../src/services/offline/cache';

// Mock DB and Cache
jest.mock('../src/config/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

jest.mock('../src/services/offline/cache', () => ({
  fetchQueue: jest.fn(),
  getQueueCount: jest.fn(),
  updateQueueStatus: jest.fn(),
  getOfflineSession: jest.fn().mockResolvedValue({ start_time: new Date().toISOString() }),
}));

describe('Background Sync Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aborts sync immediately if the queue is empty', async () => {
    (fetchQueue as jest.Mock).mockResolvedValue([]);
    
    const result = await processBackgroundSync();
    
    expect(result).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('processes pending queue items via RPC and marks them as synced', async () => {
    (fetchQueue as jest.Mock).mockResolvedValue([
      { id: 'item-1', operation: 'sync_attendance', payload: { session_id: 's-1', students: [] } },
    ]);
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    const result = await processBackgroundSync();

    expect(result).toBe(1);
    expect(supabase.rpc).toHaveBeenCalledWith('sync_offline_attendance', expect.any(Object));
    expect(updateQueueStatus).toHaveBeenCalledWith('item-1', 'synced');
  });

  it('safely catches server failures and leaves queue tasks in pending state', async () => {
    (fetchQueue as jest.Mock).mockResolvedValue([
      { id: 'item-1', operation: 'sync_attendance', payload: { session_id: 's-1' } },
    ]);
    // Mock an RPC error
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: { message: 'Network Timeout' } });

    const result = await processBackgroundSync();

    // 0 items completed
    expect(result).toBe(0);
    expect(updateQueueStatus).toHaveBeenCalledWith('item-1', 'failed');
  });
});
