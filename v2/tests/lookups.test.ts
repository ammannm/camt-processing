import { describe, it, expect } from 'vitest';
import { lookupInTable, lookupInMatrix, LookupError } from '../src/engine/run/lookups';
import { appConfigSchema, type AppConfig } from '../src/engine/config/schema';

/**
 * Domain-free fixtures: keys like GROUP_ALPHA and column names like col_a
 * make it impossible to accidentally bake any business meaning into the
 * tests. If the engine ever needs to know what GROUP_ALPHA means, the
 * abstraction has leaked.
 */
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return appConfigSchema.parse({
    classes: [],
    extraction: {},
    tables: {},
    matrices: {},
    pipeline: {},
    registries: {},
    export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } },
    ...overrides
  });
}

const baseTables = {
  alpha_table: {
    columns: ['col_a', 'col_b', 'col_c'],
    rows: {
      GROUP_ALPHA: { col_a: '100', col_b: '200', col_c: true },
      GROUP_BETA: { col_a: '300', col_b: '400', col_c: false },
      'ITEM WITH SPACE': { col_a: '500', col_b: '600' }
    }
  },
  german_keys: {
    columns: ['val'],
    rows: {
      ZÜRICH: { val: 'z' },
      'BERN OST': { val: 'b' }
    }
  }
};

const baseMatrices = {
  ab_matrix: {
    row_label: 'row_dim',
    col_label: 'col_dim',
    cells: {
      ROW_A: { COL_X: 'v-ax', COL_Y: 'v-ay' },
      ROW_B: { COL_X: 'v-bx' }
    }
  }
};

describe('§4.1 lookupInTable', () => {
  const cfg = makeConfig({ tables: baseTables });

  it('returns the full row record on exact match', () => {
    const row = lookupInTable('alpha_table', 'GROUP_ALPHA', { mode: 'exact' }, cfg);
    expect(row).toEqual({ col_a: '100', col_b: '200', col_c: true });
  });

  it('returns undefined when exact match fails (case differs)', () => {
    const row = lookupInTable('alpha_table', 'group_alpha', { mode: 'exact' }, cfg);
    expect(row).toBeUndefined();
  });

  it('exact_normalized: matches across case, whitespace, umlauts', () => {
    const row1 = lookupInTable('alpha_table', '  item   with   space  ', { mode: 'exact_normalized' }, cfg);
    expect(row1?.col_a).toBe('500');

    const row2 = lookupInTable('german_keys', 'zuerich', { mode: 'exact_normalized' }, cfg);
    expect(row2?.val).toBe('z');
  });

  it('fuzzy: matches above threshold, highest score wins', () => {
    const row = lookupInTable(
      'alpha_table',
      'GROUP_ALPH',
      { mode: 'fuzzy', min_similarity: 90 },
      cfg
    );
    expect(row?.col_a).toBe('100');
  });

  it('fuzzy: returns undefined below threshold', () => {
    const row = lookupInTable(
      'alpha_table',
      'TOTALLY_DIFFERENT',
      { mode: 'fuzzy', min_similarity: 90 },
      cfg
    );
    expect(row).toBeUndefined();
  });

  it('fuzzy: throws if min_similarity is missing', () => {
    expect(() =>
      lookupInTable('alpha_table', 'GROUP_ALPHA', { mode: 'fuzzy' }, cfg)
    ).toThrow(LookupError);
  });

  it('throws LookupError for unknown table name', () => {
    expect(() =>
      lookupInTable('does_not_exist', 'KEY', { mode: 'exact' }, cfg)
    ).toThrow(LookupError);
  });
});

describe('§4.2 lookupInMatrix', () => {
  const cfg = makeConfig({ matrices: baseMatrices });

  it('returns cell value on exact row+col match', () => {
    expect(lookupInMatrix('ab_matrix', 'ROW_A', 'COL_Y', { mode: 'exact' }, cfg)).toBe('v-ay');
  });

  it('returns undefined when row missing', () => {
    expect(lookupInMatrix('ab_matrix', 'ROW_Z', 'COL_X', { mode: 'exact' }, cfg)).toBeUndefined();
  });

  it('returns undefined when column missing within matched row', () => {
    expect(lookupInMatrix('ab_matrix', 'ROW_B', 'COL_Y', { mode: 'exact' }, cfg)).toBeUndefined();
  });

  it('fuzzy on both axes', () => {
    expect(
      lookupInMatrix('ab_matrix', 'ROW_AAA', 'COL_XX', { mode: 'fuzzy', min_similarity: 70 }, cfg)
    ).toBe('v-ax');
  });

  it('allows different match specs per axis', () => {
    const v = lookupInMatrix(
      'ab_matrix',
      'row_a',
      'COL_X',
      { mode: 'exact_normalized' },
      cfg,
      { mode: 'exact' }
    );
    expect(v).toBe('v-ax');
  });

  it('throws LookupError for unknown matrix name', () => {
    expect(() =>
      lookupInMatrix('nope', 'R', 'C', { mode: 'exact' }, cfg)
    ).toThrow(LookupError);
  });
});

describe('§4 schema validation', () => {
  it('rejects rows that reference columns not declared in `columns`', () => {
    expect(() =>
      appConfigSchema.parse({
        classes: [],
        extraction: {},
        tables: {
          bad: {
            columns: ['col_a'],
            rows: { K1: { col_a: '1', undeclared_col: 'oops' } }
          }
        },
        matrices: {},
        pipeline: {},
        registries: {},
        export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
      })
    ).toThrow();
  });

  it('accepts string, number and boolean cell values', () => {
    expect(() =>
      appConfigSchema.parse({
        classes: [],
        extraction: {},
        tables: {
          mixed: {
            columns: ['s', 'n', 'b'],
            rows: { K: { s: 'text', n: 42, b: true } }
          }
        },
        matrices: {},
        pipeline: {},
        registries: {},
        export_profiles: { default: { format: 'xlsx', outputs: [{ columns: [] }] } }
      })
    ).not.toThrow();
  });
});
