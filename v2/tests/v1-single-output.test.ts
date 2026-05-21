import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Excel from 'exceljs';
import { loadConfig } from '../src/engine/config/loader';
import { readCamt053 } from '../src/engine/io/camt-reader';
import { processRows } from '../src/engine/pipeline';
import { exportRows } from '../src/engine/export/exporter';

/**
 * After the §10 split, the export config produces ONE file (no validity-
 * based bucket routing). Validation lives in its own layer and surfaces
 * problems as the "Fehler" column. This test verifies:
 *   - single-file output with all rows (matches V1 total of 136)
 *   - the right rows carry validation errors (i.e. the ones V1 routed to
 *     fehlgeschlagene / zu_pruefen)
 */

const v2Root = path.join(__dirname, '..');
const v1BaseDir = path.join(v2Root, '..', 'beispiel_daten');

const cfg = loadConfig(path.join(v2Root, 'config'));
const xml = fs.readFileSync(path.join(v1BaseDir, 'representative_transactions.xml'), 'utf-8');
const { rows } = readCamt053(xml, 'representative_transactions.xml');
const result = processRows(rows, cfg);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-single-out-'));
const outPath = path.join(outDir, 'out.xlsx');

afterAll(() => {
  try {
    for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
    fs.rmdirSync(outDir);
  } catch {
    // ignore
  }
});

describe('single-file production output (export decoupled from validity)', () => {
  it('produces a single output file with all 136 V1-equivalent rows', async () => {
    const results = await exportRows(result.rows, cfg, outPath);
    expect(results).toHaveLength(1);
    expect(results[0]!.rowCount).toBe(136);
    expect(fs.existsSync(results[0]!.filePath!)).toBe(true);
  });

  it('uses the V1 column layout plus Klasse / Fehler columns', async () => {
    const results = await exportRows(result.rows, cfg, outPath);
    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(results[0]!.filePath!);
    const header = wb.worksheets[0]!.getRow(1);
    expect(header.getCell(1).value).toBe('Buchungsdatum');
    expect(header.getCell(4).value).toBe('Konto Soll');
    expect(header.getCell(5).value).toBe('Konto Haben');
    expect(header.getCell(11).value).toBe('Text');
    expect(header.getCell(15).value).toBe('Klasse');
    expect(header.getCell(16).value).toBe('Fehler');
  });

  it('flags as invalid only the rows where mapping was expected but failed', async () => {
    // V1 lumped manual (no mapping expected) and failed-mapping together
    // into 82 "needs attention" rows. V2 separates them: manual rows have
    // no validation errors because their class is excluded; only rows that
    // attempted mapping and missed are flagged.
    //
    // Expected:
    //   valid     ≈ V1 erfolgreich (54) + V1 zu_pruefen (21) = 75
    //   invalid   ≈ V1 fehlgeschlagene (61)
    const invalid = result.rows.filter((r) => r.errors.length > 0);
    const valid = result.rows.filter((r) => r.errors.length === 0);
    expect(invalid.length + valid.length).toBe(136);
    expect(Math.abs(valid.length - 75)).toBeLessThanOrEqual(5);
    expect(Math.abs(invalid.length - 61)).toBeLessThanOrEqual(5);
  });

  it('every invalid row has a non-empty "Fehler" message in the Excel', async () => {
    const results = await exportRows(result.rows, cfg, outPath);
    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(results[0]!.filePath!);
    const sheet = wb.worksheets[0]!;
    let invalidRowsInExcel = 0;
    for (let i = 2; i <= sheet.rowCount; i++) {
      const fehler = String(sheet.getRow(i).getCell(16).value ?? '');
      if (fehler !== '') invalidRowsInExcel++;
    }
    const invalidRowsInResult = result.rows.filter((r) => r.errors.length > 0).length;
    expect(invalidRowsInExcel).toBe(invalidRowsInResult);
  });

  it('manual-class rows are NOT flagged by validation (excluded by class)', () => {
    const manualRows = result.rows.filter((r) => r.classKey === 'manual');
    expect(manualRows.length).toBe(21);
    // No "Sollkonto fehlt" / "Habenkonto fehlt" errors on manual rows.
    for (const r of manualRows) {
      const accountErrors = r.errors.filter(
        (e) => e.field === 'out_debit' || e.field === 'out_credit'
      );
      expect(accountErrors).toEqual([]);
    }
  });
});
