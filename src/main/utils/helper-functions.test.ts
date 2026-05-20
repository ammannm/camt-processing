import { describe, it, expect } from 'vitest';
import { normaliseUmlauts, normalizeText } from './helper-functions';

describe('normaliseUmlauts', () => {
  it('should return empty string for null/undefined', () => {
    expect(normaliseUmlauts('')).toBe('');
  });

  it('should replace German umlauts correctly', () => {
    expect(normaliseUmlauts('ÄÖÜ')).toBe('AEOEUE');
    expect(normaliseUmlauts('äöü')).toBe('aeoeue');
    expect(normaliseUmlauts('ß')).toBe('ss');
  });

  it('should handle mixed text', () => {
    expect(normaliseUmlauts('München Zürich')).toBe('Muenchen Zuerich');
    expect(normaliseUmlauts('Straße')).toBe('Strasse');
  });

  it('should leave non-umlaut text unchanged', () => {
    expect(normaliseUmlauts('Hello World')).toBe('Hello World');
  });
});

describe('normalizeText', () => {
  it('should uppercase and collapse whitespace', () => {
    expect(normalizeText('hello   world')).toBe('HELLO WORLD');
  });

  it('should fix EFT/POS spacing', () => {
    expect(normalizeText('EFT /POS WARENBEZUG')).toBe('EFT/POS WARENBEZUG');
  });

  it('should trim result', () => {
    expect(normalizeText('  test  ')).toBe('TEST');
  });
});
