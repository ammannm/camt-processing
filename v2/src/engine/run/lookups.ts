/**
 * §4 Tabellen-Lookup
 *
 * Two generic primitives that know nothing about domain:
 *   - lookupInTable:  single-key table, returns the matching row's record
 *                     (all declared columns).
 *   - lookupInMatrix: row-key × col-key, returns the matching cell value.
 *
 * Match modes shared by both:
 *   - exact:              keys equal as-is
 *   - exact_normalized:   keys equal after whitespace collapse, uppercase,
 *                         German umlaut replacement
 *   - fuzzy:              partial_ratio (no preprocessing) above
 *                         match.min_similarity; highest score wins.
 *
 * For matrices the row and column axes are matched independently. The
 * caller may pass two distinct match specs (one per axis) — if only one is
 * passed it is applied to both axes.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §4
 */

import { partial_ratio } from 'fuzzball';
import type { AppConfig, CellValue, MatrixDef, TableDef } from '../config/schema';

export type MatchMode = 'exact' | 'exact_normalized' | 'fuzzy' | 'fuzzy_normalized';

export interface MatchSpec {
  mode: MatchMode;
  /** Required for `fuzzy`. Ignored otherwise. */
  min_similarity?: number;
}

export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupError';
  }
}

/**
 * Look up a row in a single-key table.
 * @returns the row's column record, or `undefined` if no key matched.
 * @throws  LookupError if the table does not exist (config-validation bug).
 */
export function lookupInTable(
  tableName: string,
  key: string,
  match: MatchSpec,
  config: AppConfig
): Record<string, CellValue> | undefined {
  const table = (config.tables as Record<string, TableDef>)[tableName];
  if (!table) {
    throw new LookupError(`Unknown table "${tableName}"`);
  }
  const winner = findBestKey(Object.keys(table.rows), key, match);
  return winner === undefined ? undefined : table.rows[winner];
}

/**
 * Look up a cell in a two-key matrix. `colMatch` defaults to `rowMatch`.
 * @returns the cell value, or `undefined` if either axis missed.
 * @throws  LookupError if the matrix does not exist.
 */
export function lookupInMatrix(
  matrixName: string,
  rowKey: string,
  colKey: string,
  rowMatch: MatchSpec,
  config: AppConfig,
  colMatch: MatchSpec = rowMatch
): CellValue | undefined {
  const matrix = (config.matrices as Record<string, MatrixDef>)[matrixName];
  if (!matrix) {
    throw new LookupError(`Unknown matrix "${matrixName}"`);
  }
  const rowWinner = findBestKey(Object.keys(matrix.cells), rowKey, rowMatch);
  if (rowWinner === undefined) return undefined;
  const rowObj = matrix.cells[rowWinner];
  if (!rowObj) return undefined;
  const colWinner = findBestKey(Object.keys(rowObj), colKey, colMatch);
  return colWinner === undefined ? undefined : rowObj[colWinner];
}

// ---------- internals ----------

/**
 * Find the best-matching key in `candidates` against `needle`, respecting
 * the given match mode. For `fuzzy`, returns the highest-scoring candidate
 * that meets `min_similarity`. Ties resolve to the first candidate found
 * (stable to YAML insertion order).
 */
function findBestKey(candidates: string[], needle: string, match: MatchSpec): string | undefined {
  if (match.mode === 'exact') {
    return candidates.find((k) => k === needle);
  }
  if (match.mode === 'exact_normalized') {
    const target = normalize(needle);
    return candidates.find((k) => normalize(k) === target);
  }
  // fuzzy / fuzzy_normalized
  if (match.min_similarity === undefined) {
    throw new LookupError(`Match mode "${match.mode}" requires min_similarity`);
  }
  const threshold = match.min_similarity;
  const normalized = match.mode === 'fuzzy_normalized';
  const needleN = normalized ? normalize(needle) : needle;
  let best: { key: string; score: number } | undefined;
  for (const k of candidates) {
    const kN = normalized ? normalize(k) : k;
    const score = partial_ratio(needleN, kN, { full_process: false, force_ascii: false });
    if (score >= threshold && (best === undefined || score > best.score)) {
      best = { key: k, score };
    }
  }
  return best?.key;
}

function normalize(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .toUpperCase();
}
