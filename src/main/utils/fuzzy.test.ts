import { describe, it, expect } from 'vitest';
import { partialRatio } from './fuzzy';

describe('partialRatio', () => {
  it('should return 100 for exact match', () => {
    expect(partialRatio('HELLO', 'HELLO')).toBe(100);
  });

  it('should return 100 when short string is contained in long string', () => {
    expect(partialRatio('HELLO', 'SAY HELLO WORLD')).toBe(100);
  });

  it('should return 0 for empty string', () => {
    expect(partialRatio('', 'HELLO')).toBe(0);
    expect(partialRatio('HELLO', '')).toBe(0);
  });

  it('should return high score for similar strings', () => {
    const score = partialRatio('EINZAHLUNG AUF EIGENES KONTO', 'EINZAHLUNG AUF EIGENES KONTO CARD-ID: 19');
    expect(score).toBeGreaterThan(95);
  });

  it('should return low score for different strings', () => {
    const score = partialRatio('TWINT ACQUIRING AG', 'MIETE SHOP KLOTEN');
    expect(score).toBeLessThan(50);
  });

  it('should mirror Python rapidfuzz partial_ratio behavior', () => {
    // Test cases from Python default_parser.py (with normalized text)
    expect(partialRatio('EINZAHLUNG AUF EIGENES KONTO', 'EINZAHLUNG AUF EIGENES KONTO CARD-ID: 19 VOM 01.01.2024')).toBeGreaterThan(95);
    expect(partialRatio('KONTOUEBERTRAG AUF', 'KONTOUEBERTRAG AUF 12345')).toBeGreaterThan(95);
    expect(partialRatio('MIETE SHOP', 'MIETE SHOP KLOTEN')).toBeGreaterThan(96);
    expect(partialRatio('TWINT ACQUIRING AG', 'TWINT ACQUIRING AG PAYOUT')).toBeGreaterThan(95);
    // EFT/POS gets normalized to remove space before slash
    expect(partialRatio('EFT/POS', 'GUTSCHRIFT EFT/POS WARENBEZUG')).toBeGreaterThan(95);
  });
});
