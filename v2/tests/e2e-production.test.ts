import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Excel from 'exceljs';
import { loadConfig } from '../src/engine/config/loader';
import { readCamt053 } from '../src/engine/io/camt-reader';
import { processRows } from '../src/engine/pipeline';
import { exportRows } from '../src/engine/export/exporter';

/**
 * Runs the v2 engine against the real production configuration
 * (config/*.yaml) and the representative CAMT fixture. Verifies that the
 * full chain — load -> classify -> extract -> pipeline -> export — works
 * with the 10 ported classes and the migrated mapping data.
 */

const configDir = path.join(__dirname, '..', 'config');
const fixture = path.join(__dirname, 'fixtures', 'representative_transactions.xml');

const cfg = loadConfig(configDir);
const xml = fs.readFileSync(fixture, 'utf-8');
const { rows } = readCamt053(xml, path.basename(fixture));
const result = processRows(rows, cfg);

function byClass(key: string) {
  return result.rows.filter((r) => r.classKey === key);
}

describe('production E2E against representative fixture', () => {
  it('config loads without cross-reference errors', () => {
    expect(cfg.classes.length).toBeGreaterThan(0);
    expect(Object.keys(cfg.extraction).length).toBeGreaterThan(0);
    expect(Object.keys(cfg.pipeline).length).toBeGreaterThan(0);
    expect(Object.keys(cfg.tables).length).toBeGreaterThan(0);
    expect(Object.keys(cfg.matrices).length).toBeGreaterThan(0);
  });

  it('reads many rows from the fixture', () => {
    expect(rows.length).toBeGreaterThan(50);
  });

  it('classifies the classes that actually appear in the fixture', () => {
    const expectedPresent = [
      'own_account_deposit',
      'transfer',
      'rent',
      'twint',
      'cash_register_system',
      'manual',
      'eft_pos_credit',
      'credit_account_management',
      'credit_cash_deposits'
    ];
    for (const k of expectedPresent) {
      expect(byClass(k).length, `missing rows for ${k}`).toBeGreaterThan(0);
    }
    // eft_pos_expenses (DBIT) is configured but absent from this fixture.
    expect(byClass('eft_pos_expenses').length).toBe(0);
  });

  it('TWINT main rows: 1005 debit, matrix-resolved credit, vat=0, cost center set', () => {
    // emit_row also lands under classKey twint — filter to mains only via payment_type.
    const mains = byClass('twint').filter((r) => r.fields.payment_type === 'TWINT');
    expect(mains.length).toBe(3);
    for (const r of mains) {
      expect(r.fields.out_debit).toBe('1005');
      expect(r.fields.out_vat).toBe('0');
      expect(String(r.fields.out_credit)).toMatch(/^01\d{3}$/);
      expect(r.fields.location).toBeTruthy();
      expect(r.fields.out_cost_center).toBeDefined();
    }
  });

  it('TWINT fee emit_row: BUCHUNGSSPESEN account mapping per fee', () => {
    const tw = byClass('twint');
    // Each TWINT main row has fee_amount > 0, so each emits exactly one fee row.
    const allRows = result.rows;
    const twintIndices = allRows
      .map((r, i) => (r.classKey === 'twint' && r.fields.payment_type === 'TWINT' ? i : -1))
      .filter((i) => i !== -1);

    for (const i of twintIndices) {
      // The fee row sits right after its main row.
      const next = allRows[i + 1];
      expect(next).toBeDefined();
      expect(next!.fields.payment_type).toBe('Buchungsspesen');
      expect(next!.fields.out_debit).toBe('3292');
      expect(next!.fields.out_credit).toBe('1005');
      expect(Number(next!.fields.out_amount)).toBeGreaterThan(0);
    }
  });

  it('own_account_deposit: lookup hits the CARD-ID table key', () => {
    const own = byClass('own_account_deposit');
    expect(own.length).toBeGreaterThan(0);
    for (const r of own) {
      expect(String(r.fields.location)).toMatch(/^CARD-ID: \d+$/);
      expect(r.fields.out_debit).toBe('1005');
      expect(String(r.fields.out_credit)).toMatch(/^01\d{3}$/);
    }
  });

  it('credit_account_management: static lookup → 6840 / 1005', () => {
    const cam = byClass('credit_account_management');
    expect(cam.length).toBeGreaterThan(0);
    for (const r of cam) {
      expect(r.fields.out_debit).toBe('6840');
      expect(r.fields.out_credit).toBe('1005');
      expect(r.fields.out_text).toBe('Preis für Kontoführung');
    }
  });

  it('transfer: static KONTOUEBERTRAG lookup → 2100 / 1005', () => {
    const tr = byClass('transfer');
    expect(tr.length).toBeGreaterThan(0);
    for (const r of tr) {
      expect(r.fields.out_debit).toBe('2100');
      expect(r.fields.out_credit).toBe('1005');
    }
  });

  it('rent: 6000 / 1005 with cost center populated', () => {
    const rent = byClass('rent');
    expect(rent.length).toBeGreaterThan(0);
    for (const r of rent) {
      expect(r.fields.out_debit).toBe('6000');
      expect(r.fields.out_credit).toBe('1005');
      expect(r.fields.out_cost_center).toBeDefined();
    }
  });

  it('cash_register_system main rows: 1005 debit, matrix-resolved credit when location parsed', () => {
    const mains = byClass('cash_register_system').filter(
      (r) => r.fields.payment_type !== 'Buchungsspesen'
    );
    const withLocation = mains.filter((r) => r.fields.location);
    expect(withLocation.length).toBeGreaterThan(0);
    for (const r of withLocation) {
      expect(r.fields.out_debit).toBe('1005');
      // out_credit may be undefined if the (location × payment_type)
      // combination has no entry in the matrix — fine, just diagnostic.
      if (r.fields.out_credit) {
        expect(String(r.fields.out_credit)).toMatch(/^0\d{4}$/);
      }
    }
  });

  it('CRDT EFT/POS gets eft_pos_credit (filter splits credit vs expenses)', () => {
    const credit = byClass('eft_pos_credit');
    expect(credit.length).toBeGreaterThan(0);
    for (const r of credit) {
      expect(r.fields.payment_type).toBe('EFT/POS Gutschrift');
    }
  });

  // ----- closes the chain: file in -> Excel out, with the production export.yaml -----
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-prod-'));
  const outPath = path.join(outDir, 'output.xlsx');
  afterAll(() => {
    try {
      fs.unlinkSync(outPath);
      fs.rmdirSync(outDir);
    } catch {
      // ignore
    }
  });

  it('exports all ProcessedRows to a single xlsx with the production columns', async () => {
    const results = await exportRows(result.rows, cfg, outPath);

    // Production config defines one output (validity routing has moved to
    // §10 validation). Total rows in the file must equal the input rows.
    expect(results).toHaveLength(1);
    expect(results[0]!.rowCount).toBe(result.rows.length);

    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(results[0]!.filePath!);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Buchungsdatum');
    expect(sheet.getRow(1).getCell(4).value).toBe('Konto Soll');
    expect(sheet.getRow(1).getCell(5).value).toBe('Konto Haben');
    expect(sheet.getRow(1).getCell(16).value).toBe('Fehler');
  });
});
