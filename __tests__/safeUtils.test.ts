/**
 * safeUtils.test.ts — Tests for core crash-prevention utilities
 * These are the most critical utils in the app: if they fail, everything fails.
 */

// Mock Sentry BEFORE importing safeUtils
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import {
  safeJsonParse,
  safeJsonStringify,
} from '../src/utils/safeUtils';

describe('safeJsonParse', () => {
  it('parses valid JSON correctly', () => {
    expect(safeJsonParse('{"name":"test"}', {})).toEqual({ name: 'test' });
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(safeJsonParse('"hello"', '')).toBe('hello');
  });

  it('returns fallback for invalid JSON — never throws', () => {
    expect(safeJsonParse('not-json', { safe: true })).toEqual({ safe: true });
    expect(safeJsonParse('{broken:', [])).toEqual([]);
    expect(safeJsonParse('', 'default')).toBe('default');
  });

  it('returns fallback for null/undefined — never throws', () => {
    expect(safeJsonParse(null, 'fallback')).toBe('fallback');
    expect(safeJsonParse(undefined, [])).toEqual([]);
  });

  it('returns null as default fallback', () => {
    expect(safeJsonParse(null)).toBeNull();
    expect(safeJsonParse('bad-json')).toBeNull();
  });
});

describe('safeJsonStringify', () => {
  it('stringifies valid objects', () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
    expect(safeJsonStringify([1, 2])).toBe('[1,2]');
  });

  it('returns fallback for circular references — never throws', () => {
    const circular: any = {};
    circular.self = circular;
    expect(safeJsonStringify(circular)).toBe('{}');
    expect(safeJsonStringify(circular, '[]')).toBe('[]');
  });
});
