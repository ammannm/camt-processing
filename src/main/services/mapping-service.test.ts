import { describe, it, expect } from 'vitest';
import { convertTextToBoolean, cleanAccountValue } from './mapping-service';

// Helper functions exported for testing
describe('convertTextToBoolean', () => {
  it('should return true for ja/yes/true', () => {
    expect(convertTextToBoolean('ja')).toBe(true);
    expect(convertTextToBoolean('yes')).toBe(true);
    expect(convertTextToBoolean('true')).toBe(true);
    expect(convertTextToBoolean(' JA ')).toBe(true);
  });

  it('should return false for nein/no/false', () => {
    expect(convertTextToBoolean('nein')).toBe(false);
    expect(convertTextToBoolean('no')).toBe(false);
    expect(convertTextToBoolean('false')).toBe(false);
  });

  it('should return false for other values', () => {
    expect(convertTextToBoolean('')).toBe(false);
    expect(convertTextToBoolean('maybe')).toBe(false);
    expect(convertTextToBoolean(123)).toBe(false);
  });
});

describe('cleanAccountValue', () => {
  it('should remove trailing .0 from numbers', () => {
    expect(cleanAccountValue('1005.0')).toBe('1005');
    expect(cleanAccountValue('1234.0')).toBe('1234');
  });

  it('should keep non-.0 numbers unchanged', () => {
    expect(cleanAccountValue('1005')).toBe('1005');
    expect(cleanAccountValue('12.34')).toBe('12.34');
  });

  it('should handle null/undefined', () => {
    expect(cleanAccountValue(null)).toBe('');
    expect(cleanAccountValue(undefined)).toBe('');
  });

  it('should trim whitespace', () => {
    expect(cleanAccountValue('  1005  ')).toBe('1005');
  });
});
