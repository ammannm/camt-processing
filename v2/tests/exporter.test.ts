import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Excel from 'exceljs';
import { buildTable, exportRows, formatValue } from '../src/engine/export/exporter';
import { appConfigSchema, type AppConfig, type ExportColumn, type ExportOutput } from '../src/engine/config/schema';
import { asClassKey, type ProcessedRow } from '../src/shared/types';

function row(fields: Record<string, unknown>, opts: { classKey?: string; errors?: number } = {}): ProcessedRow {
  return {
    classKey: asClassKey(opts.classKey ?? 'alpha_class'),
    fields,
    errors: Array.from({ length: opts.errors ?? 0 }, (_, i) => ({ message: 'err' + i })),
    source: { fields: {} }
  };
}

/** Convenience: single profile with one unnamed output. */
function singleOutput(columns: ExportColumn[]): AppConfig['export_profiles'] {
  return { default: { format: 'xlsx', outputs: [{ columns }] } };
}

function cfg(profiles: AppConfig['export_profiles']): AppConfig {
  return appConfigSchema.parse({
    classes: [],
    extraction: {},
    tables: {},
    matrices: {},
    pipeline: {},
    registries: {},
    export_profiles: profiles
  });
}

const tmpFiles: string[] = [];
function tmpPath(ext: string): string {
  const p = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'v2-export-')),
    `out.${ext}`
  );
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const p = tmpFiles.pop()!;
    try {
      fs.unlinkSync(p);
      fs.rmdirSync(path.dirname(p));
    } catch {
      // ignore
    }
  }
});

// ---------- formatters (§9 sub-units) ----------

describe('formatValue', () => {
  it('passes through scalars untouched without a formatter', () => {
    expect(formatValue('text', undefined)).toBe('text');
    expect(formatValue(42, undefined)).toBe(42);
    expect(formatValue(true, undefined)).toBe(true);
  });

  it('treats undefined / null as empty string', () => {
    expect(formatValue(undefined, undefined)).toBe('');
    expect(formatValue(null, undefined)).toBe('');
  });

  it('date_ddmmyyyy converts ISO YYYY-MM-DD to DD.MM.YYYY', () => {
    expect(formatValue('2026-05-21', 'date_ddmmyyyy')).toBe('21.05.2026');
    expect(formatValue('2026-05-21T10:00:00', 'date_ddmmyyyy')).toBe('21.05.2026');
  });

  it('date_ddmmyyyy leaves already-formatted values unchanged', () => {
    expect(formatValue('21.05.2026', 'date_ddmmyyyy')).toBe('21.05.2026');
  });

  it('number_two_decimals and number_no_decimals', () => {
    expect(formatValue(12.5, 'number_two_decimals')).toBe('12.50');
    expect(formatValue('7', 'number_two_decimals')).toBe('7.00');
    expect(formatValue(12.7, 'number_no_decimals')).toBe('13');
  });

  it('uppercase / lowercase / trim', () => {
    expect(formatValue('Hello', 'uppercase')).toBe('HELLO');
    expect(formatValue('Hello', 'lowercase')).toBe('hello');
    expect(formatValue('  padded  ', 'trim')).toBe('padded');
  });
});

// ---------- table assembly ----------

describe('buildTable', () => {
  it('maps fields to headers in declared order', () => {
    const table = buildTable(
      [row({ field_x: 'X1', field_y: 'Y1', extra: 'IGNORED' })],
      [
        { header: 'X Header', from_field: 'field_x' },
        { header: 'Y Header', from_field: 'field_y' }
      ]
    );
    expect(table.headers).toEqual(['X Header', 'Y Header']);
    expect(table.rows).toEqual([['X1', 'Y1']]);
  });

  it('fills empty string for missing fields', () => {
    const table = buildTable(
      [row({ field_x: 'X1' })],
      [
        { header: 'X', from_field: 'field_x' },
        { header: 'Missing', from_field: 'not_set' }
      ]
    );
    expect(table.rows[0]).toEqual(['X1', '']);
  });

  it('applies per-column formatters', () => {
    const table = buildTable(
      [row({ d: '2026-05-21', n: 3.5 })],
      [
        { header: 'D', from_field: 'd', format: 'date_ddmmyyyy' },
        { header: 'N', from_field: 'n', format: 'number_two_decimals' }
      ]
    );
    expect(table.rows[0]).toEqual(['21.05.2026', '3.50']);
  });
});

// ---------- file writers ----------

describe('exportRows: csv', () => {
  it('writes a comma-separated file and quotes cells containing commas or quotes', async () => {
    const out = tmpPath('csv');
    await exportRows(
      [row({ a: 'plain', b: 'has,comma', c: 'has "quote"' })],
      cfg({
        default: {
          format: 'csv',
          outputs: [
            {
              columns: [
                { header: 'A', from_field: 'a' },
                { header: 'B', from_field: 'b' },
                { header: 'C', from_field: 'c' }
              ]
            }
          ]
        }
      }),
      out
    );
    const content = fs.readFileSync(out, 'utf-8');
    expect(content).toBe('A,B,C\nplain,"has,comma","has ""quote"""\n');
  });
});

describe('exportRows: json', () => {
  it('writes an array of header-keyed objects', async () => {
    const out = tmpPath('json');
    await exportRows(
      [row({ x: 'X1', y: 42 }), row({ x: 'X2', y: 7 })],
      cfg({
        default: {
          format: 'json',
          outputs: [
            {
              columns: [
                { header: 'X', from_field: 'x' },
                { header: 'Y', from_field: 'y', format: 'number_two_decimals' }
              ]
            }
          ]
        }
      }),
      out
    );
    const parsed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(parsed).toEqual([
      { X: 'X1', Y: '42.00' },
      { X: 'X2', Y: '7.00' }
    ]);
  });
});

describe('exportRows: xlsx', () => {
  it('writes a workbook whose first row is the header and subsequent rows are data', async () => {
    const out = tmpPath('xlsx');
    await exportRows(
      [row({ a: 'A1', b: 'B1' }), row({ a: 'A2', b: 'B2' })],
      cfg(
        singleOutput([
          { header: 'A', from_field: 'a' },
          { header: 'B', from_field: 'b' }
        ])
      ),
      out
    );

    // Single profile + single output → file lands at the base path.
    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(out);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).value).toBe('A');
    expect(sheet.getRow(1).getCell(2).value).toBe('B');
    expect(sheet.getRow(2).getCell(1).value).toBe('A1');
    expect(sheet.getRow(2).getCell(2).value).toBe('B1');
    expect(sheet.getRow(3).getCell(1).value).toBe('A2');
    expect(sheet.getRow(3).getCell(2).value).toBe('B2');
  });
});

// ---------- multi-output routing ----------

describe('exportRows: multi-output routing (§9)', () => {
  const cols: ExportColumn[] = [{ header: 'Value', from_field: 'value' }];
  const threeBuckets: ExportOutput[] = [
    { name: '_zu_pruefen', filter: { field: '_class', equals: 'manual' }, columns: cols },
    {
      name: '_fehlgeschlagen',
      filter: {
        any_of: [
          { field: '_has_errors', equals: true },
          { field: 'value', absent: true }
        ]
      },
      columns: cols
    },
    { name: '_erfolgreich', columns: cols } // catch-all
  ];

  it('routes rows by first-matching filter (manual -> zu_pruefen)', async () => {
    const base = tmpPath('xlsx');
    const results = await exportRows(
      [
        row({ value: 'good' }), // -> erfolgreich
        row({ value: 'bad' }, { classKey: 'manual' }), // -> zu_pruefen
        row({}, { errors: 1 }), // -> fehlgeschlagen (has_errors)
        row({}) // -> fehlgeschlagen (value absent)
      ],
      cfg({ default: { format: 'xlsx', outputs: threeBuckets } }),
      base
    );

    const byBucket = Object.fromEntries(results.map((r) => [r.bucket, r]));
    expect(byBucket['_zu_pruefen']!.rowCount).toBe(1);
    expect(byBucket['_fehlgeschlagen']!.rowCount).toBe(2);
    expect(byBucket['_erfolgreich']!.rowCount).toBe(1);
  });

  it('appends bucket name to the chosen base path (single profile, multi output)', async () => {
    const base = tmpPath('xlsx');
    const results = await exportRows(
      [row({ value: 'ok' }), row({ value: 'm' }, { classKey: 'manual' })],
      cfg({ default: { format: 'xlsx', outputs: threeBuckets } }),
      base
    );
    const erfolgreich = results.find((r) => r.bucket === '_erfolgreich')!;
    const zuPruefen = results.find((r) => r.bucket === '_zu_pruefen')!;
    // Single profile → no profile suffix. Multi-bucket → bucket suffix.
    expect(erfolgreich.filePath!.endsWith('_erfolgreich.xlsx')).toBe(true);
    expect(zuPruefen.filePath!.endsWith('_zu_pruefen.xlsx')).toBe(true);
    if (erfolgreich.filePath) tmpFiles.push(erfolgreich.filePath);
    if (zuPruefen.filePath) tmpFiles.push(zuPruefen.filePath);
  });

  it('does not create a file for an empty bucket', async () => {
    const base = tmpPath('xlsx');
    const results = await exportRows(
      [row({ value: 'ok' })],
      cfg({ default: { format: 'xlsx', outputs: threeBuckets } }),
      base
    );
    const zuPruefen = results.find((r) => r.bucket === '_zu_pruefen')!;
    expect(zuPruefen.rowCount).toBe(0);
    expect(zuPruefen.filePath).toBeUndefined();
  });

  it('runs multiple profiles and applies profile suffix when >1 selected', async () => {
    const base = tmpPath('xlsx');
    const results = await exportRows(
      [row({ value: 'X' }, { classKey: 'alpha_class' })],
      cfg({
        excel_a: { format: 'xlsx', outputs: [{ columns: cols }] },
        json_b: { format: 'json', outputs: [{ columns: cols }] }
      }),
      base
    );
    expect(results.map((r) => r.profile).sort()).toEqual(['excel_a', 'json_b']);
    for (const r of results) {
      expect(r.filePath, `${r.profile}: file path missing`).toBeDefined();
      expect(r.filePath!.includes(`_${r.profile}`), `${r.profile}: missing profile suffix`).toBe(true);
      tmpFiles.push(r.filePath!);
    }
  });

  it('selects a subset of profiles via options.profiles', async () => {
    const base = tmpPath('xlsx');
    const results = await exportRows(
      [row({ value: 'X' }, { classKey: 'alpha_class' })],
      cfg({
        excel_a: { format: 'xlsx', outputs: [{ columns: cols }] },
        json_b: { format: 'json', outputs: [{ columns: cols }] }
      }),
      base,
      { profiles: ['json_b'] }
    );
    // Only json_b runs. Single profile → no profile suffix.
    expect(results).toHaveLength(1);
    expect(results[0]!.profile).toBe('json_b');
    expect(results[0]!.filePath).toBe(base);
    if (results[0]!.filePath) tmpFiles.push(results[0]!.filePath);
  });

  it('throws ExportError on unknown profile name', async () => {
    const base = tmpPath('xlsx');
    await expect(
      exportRows(
        [row({ value: 'X' })],
        cfg({ excel_a: { format: 'xlsx', outputs: [{ columns: cols }] } }),
        base,
        { profiles: ['nope'] }
      )
    ).rejects.toThrow(/Unknown export profile "nope"/);
  });

  it('supports all_of composites', async () => {
    const base = tmpPath('xlsx');
    const outputs: ExportOutput[] = [
      {
        name: '_both',
        filter: {
          all_of: [
            { field: 'value', present: true },
            { field: '_class', equals: 'alpha_class' }
          ]
        },
        columns: cols
      },
      { name: '_rest', columns: cols }
    ];
    const results = await exportRows(
      [
        row({ value: 'X' }), // both
        row({ value: 'Y' }, { classKey: 'manual' }), // rest (class mismatch)
        row({}, { classKey: 'alpha_class' }) // rest (value absent)
      ],
      cfg({ default: { format: 'xlsx', outputs } }),
      base
    );
    const byBucket = Object.fromEntries(results.map((r) => [r.bucket, r]));
    expect(byBucket['_both']!.rowCount).toBe(1);
    expect(byBucket['_rest']!.rowCount).toBe(2);
    if (byBucket['_both']!.filePath) tmpFiles.push(byBucket['_both']!.filePath);
    if (byBucket['_rest']!.filePath) tmpFiles.push(byBucket['_rest']!.filePath);
  });
});
