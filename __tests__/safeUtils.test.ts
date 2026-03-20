import { safeJsonParse, safeJsonStringify, safeArray, safeGet } from '../src/utils/safeUtils';

describe('safeUtils', () => {
  describe('safeJsonParse', () => {
    it('parses valid JSON successfully', () => {
      const json = '{"key":"value","num":42}';
      const result = safeJsonParse(json, null);
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('returns fallback for invalid JSON instead of throwing', () => {
      const json = '{invalid_json:true}'; // Missing quotes
      const fallback = { fallback: true };
      const result = safeJsonParse(json, fallback);
      expect(result).toBe(fallback);
    });

    it('returns fallback for null string', () => {
      const result = safeJsonParse(null, 'default');
      expect(result).toBe('default');
    });

    it('returns fallback for undefined string', () => {
      const result = safeJsonParse(undefined, []);
      expect(result).toEqual([]);
    });
  });

  describe('safeJsonStringify', () => {
    it('stringifies valid objects', () => {
      const obj = { start: true };
      expect(safeJsonStringify(obj)).toBe('{"start":true}');
    });

    it('returns fallback for circular references (which cause stringify to throw)', () => {
      const circular: any = {};
      circular.self = circular;
      expect(safeJsonStringify(circular, 'fallback_string')).toBe('fallback_string');
    });
  });

  describe('safeArray', () => {
    it('returns the same array if input is an array', () => {
      const arr = [1, 2, 3];
      expect(safeArray(arr)).toBe(arr);
    });

    it('returns empty array if input is not an array', () => {
      expect(safeArray(null)).toEqual([]);
      expect(safeArray(undefined)).toEqual([]);
      expect(safeArray("string")).toEqual([]);
      expect(safeArray({ key: "val" })).toEqual([]);
    });
  });

  describe('safeGet', () => {
    it('returns value when defined', () => {
      expect(safeGet("data", "fallback")).toBe("data");
      expect(safeGet(0, 10)).toBe(0); // 0 is falsy but not nullish!
      expect(safeGet(false, true)).toBe(false);
    });

    it('returns fallback when value is null or undefined', () => {
      expect(safeGet(null, "fallback")).toBe("fallback");
      expect(safeGet(undefined, 123)).toBe(123);
    });
  });
});
