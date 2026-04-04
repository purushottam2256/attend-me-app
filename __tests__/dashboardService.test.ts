/**
 * dashboardService.test.ts — Tests for crash-proof data layer
 * 
 * Verifies that getStudentsForClass returns empty array on failure
 * instead of throwing (which would crash the UI).
 */

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Build a chainable mock for supabase query builder
function createMockQueryBuilder(resolvedValue: { data: any; error: any }) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue(resolvedValue);
  return chain;
}

let mockQueryBuilder = createMockQueryBuilder({ data: [], error: null });

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn(() => mockQueryBuilder),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-id' } } }) },
  },
}));

import { getStudentsForClass } from '../src/services/dashboardService';

describe('dashboardService — Crash Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStudentsForClass()', () => {
    it('returns empty array on Supabase error — never throws', async () => {
      mockQueryBuilder = createMockQueryBuilder({
        data: null,
        error: { message: 'Network error', code: '500', details: '' },
      });

      const result = await getStudentsForClass('CSE', 3, 'A');
      expect(result).toEqual([]);
    });

    it('returns empty array on exception — never throws', async () => {
      // Make from() throw to simulate connection failure
      const { supabase } = require('../src/config/supabase');
      supabase.from.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      const result = await getStudentsForClass('CSE', 3, 'A');
      expect(result).toEqual([]);

      // Restore
      supabase.from.mockImplementation(() => mockQueryBuilder);
    });

    it('returns data on success', async () => {
      const mockStudents = [
        { id: '1', roll_no: '22q91a6601', full_name: 'Test Student', bluetooth_uuid: 'uuid-1', batch: 1, avatar_url: null, is_le: false },
      ];

      mockQueryBuilder = createMockQueryBuilder({ data: mockStudents, error: null });

      const result = await getStudentsForClass('CSE', 3, 'A');
      expect(result).toEqual(mockStudents);
    });
  });
});
