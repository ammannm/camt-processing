import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Excel from 'exceljs';
import { readCamt053, NonCamt053Error } from '../src/engine/io/camt-reader';
import { processRows } from '../src/engine/pipeline';
import { exportRows } from '../src/engine/export/exporter';
import { appConfigSchema, type AppConfig } from '../src/engine/config/schema';

const fixture = path.join(__dirname, 'fixtures', 'representative_transactions.xml');

describe('CAMT reader', () => {
  it('parses the fixture into RawRows with conventional fields', () => {
    const xml = fs.readFileSync(fixture, 'utf-8');
    const { rows, account, messageId } = readCamt053(xml, path.basename(fixture));
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof messageId).toBe('string');
    expect(typeof account).toBe('string');

    const sample = rows[0]!;
    expect(typeof sample.fields.source_text).toBe('string');
    expect(typeof sample.fields.amount).toBe('number');
    expect(['CRDT', 'DBIT']).toContain(sample.fields.direction);
  });

  it('rejects non-CAMT.053 XML', () => {
    expect(() => readCamt053('<Foo/>', 'foo.xml')).toThrow(NonCamt053Error);
  });
});

describe('end-to-end: file -> classify -> extract -> pipeline', () => {
  // Minimal config defined in-test. The class name "example_class" and the
  // field names below have no domain meaning to the engine — the YAML
  // could just as well call them "alpha_class" / "foo_field" / etc.
  const cfg: AppConfig = appConfigSchema.parse({
    classes: [
      {
        id: 'r_example',
        match_against: 'source_text',
        keyword: 'EINZAHLUNG AUF EIGENES KONTO',
        min_similarity: 95,
        class: 'example_class'
      }
    ],
    extraction: {
      example_class: {
        text_date: {
          extract: { regex: 'VOM\\s*(\\d{2}\\.\\d{2}\\.\\d{4})' }
        },
        card_id: {
          extract: { regex: 'CARD-ID:\\s*(\\d+)' }
        },
        composed: {
          extract: { template: 'card {card_id} on {text_date}' }
        }
      }
    },
    tables: {
      card_to_account: {
        columns: ['account'],
        rows: {
          '8': { account: 'ACC-FOR-8' },
          '12': { account: 'ACC-FOR-12' },
          '23': { account: 'ACC-FOR-23' }
        }
      }
    },
    matrices: {},
    pipeline: {
      example_class: {
        steps: [
          {
            lookup_in_table: {
              table: 'card_to_account',
              key_from_field: 'card_id',
              match: { mode: 'exact' },
              assign: { mapped_account: 'account' }
            }
          },
          {
            set: { output_summary: '{composed} -> {mapped_account}' }
          }
        ]
      }
    },
    registries: {},
    export_profiles: {
      default: {
        format: 'xlsx',
        outputs: [
          {
            columns: [
              { header: 'BookingDate', from_field: 'booking_date', format: 'date_ddmmyyyy' },
              { header: 'CardId', from_field: 'card_id' },
              { header: 'Account', from_field: 'mapped_account' },
              { header: 'Summary', from_field: 'output_summary' },
              { header: 'Amount', from_field: 'amount', format: 'number_two_decimals' }
            ]
          }
        ]
      }
    }
  });

  const xml = fs.readFileSync(fixture, 'utf-8');
  const { rows } = readCamt053(xml, path.basename(fixture));
  const result = processRows(rows, cfg);

  it('produces ProcessedRows for the example class', () => {
    const matches = result.rows.filter((r) => r.classKey === 'example_class');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('populates extracted fields and the looked-up account', () => {
    const matches = result.rows.filter((r) => r.classKey === 'example_class');
    for (const m of matches) {
      expect(String(m.fields.text_date)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      expect(String(m.fields.card_id)).toMatch(/^\d+$/);
      // composed template was rendered
      expect(String(m.fields.composed)).toContain(String(m.fields.card_id));
      // pipeline set step rendered output_summary from current fields
      expect(String(m.fields.output_summary)).toContain(String(m.fields.composed));
    }
  });

  it('looks up the mapped_account when the card id is in the table', () => {
    const matches = result.rows.filter((r) => r.classKey === 'example_class');
    const knownIds = ['8', '12', '23'];
    const hits = matches.filter((m) => knownIds.includes(String(m.fields.card_id)));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(String(h.fields.mapped_account)).toMatch(/^ACC-FOR-/);
    }
  });

  it('the rest of the file lands in unclassified (no rule matches them)', () => {
    // With only one classification rule, the vast majority of the fixture
    // will be unclassified. That's the expected behaviour — no silent loss.
    expect(result.unclassified.length).toBeGreaterThan(0);
    // Each unclassified row carries the per-rule scores for diagnosis.
    const sample = result.unclassified[0]!;
    expect(sample.allScores[0]!.class).toBe('example_class');
  });

  // ----- closes the chain: file in -> Excel out -----
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-e2e-'));
  const outPath = path.join(outDir, 'output.xlsx');
  afterAll(() => {
    try {
      fs.unlinkSync(outPath);
      fs.rmdirSync(outDir);
    } catch {
      // ignore
    }
  });

  it('exports ProcessedRows to xlsx and re-reads expected columns', async () => {
    await exportRows(result.rows, cfg, outPath);

    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(outPath);
    const sheet = wb.worksheets[0]!;

    // Header row matches export.columns in order
    expect(sheet.getRow(1).getCell(1).value).toBe('BookingDate');
    expect(sheet.getRow(1).getCell(2).value).toBe('CardId');
    expect(sheet.getRow(1).getCell(3).value).toBe('Account');
    expect(sheet.getRow(1).getCell(4).value).toBe('Summary');
    expect(sheet.getRow(1).getCell(5).value).toBe('Amount');

    // Data rows: one row per ProcessedRow returned by processRows
    expect(sheet.rowCount).toBe(result.rows.length + 1);

    // First data row has a DD.MM.YYYY-formatted date and a numeric Amount
    // formatted to two decimals.
    const firstData = sheet.getRow(2);
    expect(String(firstData.getCell(1).value)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(String(firstData.getCell(5).value)).toMatch(/^\d+\.\d{2}$/);
  });
});
