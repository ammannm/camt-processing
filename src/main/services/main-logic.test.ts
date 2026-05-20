import { describe, it, expect } from 'vitest';
import { formatDateForExport } from './main-logic';

describe('formatDateForExport', () => {
  it('should convert ISO date to DD.MM.YYYY', () => {
    expect(formatDateForExport('2024-01-15')).toBe('15.01.2024');
    expect(formatDateForExport('2024-12-31')).toBe('31.12.2024');
  });

  it('should handle datetime with T separator', () => {
    expect(formatDateForExport('2024-01-15T10:30:00')).toBe('15.01.2024');
  });

  it('should return empty string for empty input', () => {
    expect(formatDateForExport('')).toBe('');
  });

  it('should return original value for non-matching format', () => {
    expect(formatDateForExport('15.01.2024')).toBe('15.01.2024');
    expect(formatDateForExport('invalid')).toBe('invalid');
  });
});
