import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Excel from 'exceljs';
import { loadConfig } from '../src/engine/config/loader';
import { readCamt053 } from '../src/engine/io/camt-reader';
import { processRows } from '../src/engine/pipeline';

/**
 * Regression-Test gegen die V1-Baseline.
 *
 * Im Verzeichnis `beispiel_daten/` liegen die drei Excels, die V1 aus
 * `representative_transactions.xml` erzeugt hat (erfolgreich /
 * fehlgeschlagene / zu_prüfen). Dieser Test fährt V2 gegen dieselbe XML
 * und vergleicht das Ergebnis spaltenseitig.
 *
 * Erwartung:
 *   - Identische Zeilenzahl
 *   - Identische Gesamtsumme
 *   - Identische Aggregate pro (Soll, Haben) — MIT EINER bewussten Abweichung,
 *     die als V2-Verbesserung dokumentiert ist (siehe Test ganz unten).
 */

interface Booking {
  debit: string;
  credit: string;
  amount: number;
  text: string;
}

const v1BaseDir = path.join(__dirname, '..', '..', 'beispiel_daten');
const v1Files = [
  '20052026_1150_erfolgreich_dt_import.xlsx',
  '20052026_1150_fehlgeschlagene_dt_import.xlsx',
  '20052026_1150_zu_prüfen_dt_import.xlsx'
];

async function loadV1Baseline(): Promise<Booking[]> {
  const out: Booking[] = [];
  for (const file of v1Files) {
    const wb = new Excel.Workbook();
    await wb.xlsx.readFile(path.join(v1BaseDir, file));
    const ws = wb.worksheets[0]!;
    ws.eachRow({ includeEmpty: false }, (row, i) => {
      if (i === 1) return; // header
      out.push({
        debit: String(row.getCell(4).value ?? '').trim(),
        credit: String(row.getCell(5).value ?? '').trim(),
        amount: Number(row.getCell(8).value) || 0,
        text: String(row.getCell(11).value ?? '')
      });
    });
  }
  return out;
}

function buildV2Output(): Booking[] {
  const cfg = loadConfig(path.join(__dirname, '..', 'config'));
  const xml = fs.readFileSync(path.join(v1BaseDir, 'representative_transactions.xml'), 'utf-8');
  const { rows } = readCamt053(xml, 'representative_transactions.xml');
  const result = processRows(rows, cfg);
  return result.rows.map((r) => ({
    debit: String(r.fields.out_debit ?? ''),
    credit: String(r.fields.out_credit ?? ''),
    amount: Number(r.fields.out_amount) || 0,
    text: String(r.fields.out_text ?? '')
  }));
}

interface Aggregate {
  count: number;
  sum: number;
}
function aggregate(rows: Booking[]): Map<string, Aggregate> {
  const out = new Map<string, Aggregate>();
  for (const r of rows) {
    const key = `${r.debit || '?'}|${r.credit || '?'}`;
    const cur = out.get(key) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += r.amount;
    out.set(key, cur);
  }
  return out;
}

describe('V1 baseline regression', () => {
  const v2 = buildV2Output();

  it('produces the same number of booking rows as V1', async () => {
    const v1 = await loadV1Baseline();
    expect(v2.length).toBe(v1.length);
    expect(v2.length).toBe(136);
  });

  it('produces the same total amount as V1', async () => {
    const v1 = await loadV1Baseline();
    const sumV1 = v1.reduce((s, r) => s + r.amount, 0);
    const sumV2 = v2.reduce((s, r) => s + r.amount, 0);
    expect(sumV2).toBeCloseTo(sumV1, 2);
  });

  it('matches V1 aggregates for entries where the V1 lookup was sound', async () => {
    // V1 has a known bug (documented in the next test) where 30 rows with
    // an undefined location get fuzzy-matched to ARBEDO/CAMORINO/TICINO
    // codes 01112 / 01114 / 01115. For every OTHER (debit, credit) tuple,
    // the aggregates must match V1 exactly.
    const v1 = await loadV1Baseline();
    const aggV1 = aggregate(v1);
    const aggV2 = aggregate(v2);

    const v1BugCredits = new Set(['01112', '01114', '01115']);
    const v1BugUnknown = new Set(['1005|?']); // V1 also had 1 unmapped row

    for (const [key, v1Agg] of aggV1.entries()) {
      const credit = key.split('|')[1] ?? '';
      if (v1BugCredits.has(credit) || v1BugUnknown.has(key)) continue;
      const v2Agg = aggV2.get(key);
      expect(v2Agg, `key=${key}: V2 lacks aggregate`).toBeDefined();
      expect(v2Agg!.count, `key=${key}: count`).toBe(v1Agg.count);
      expect(v2Agg!.sum, `key=${key}: sum`).toBeCloseTo(v1Agg.sum, 2);
    }
  });

  it("documents the V1 bug: 30 'undefined-location' rows got wrongly mapped", async () => {
    // V1 used partial_ratio("undefined/TWINT", "ARBEDO/TWINT") which scores
    // above its 99-threshold (the "/TWINT" substring dominates), so all
    // unknown-location entries got the alphabetically first matching
    // location's credit account. V2 correctly leaves them with out_credit
    // unset and surfaces the data quality problem instead.
    const v1 = await loadV1Baseline();

    const v1WronglyMapped = v1.filter((r) =>
      ['01112', '01114', '01115'].includes(r.credit) && /undefined/.test(r.text)
    );
    expect(v1WronglyMapped.length).toBe(30);

    const v2Equivalents = v2.filter((r) => r.debit === '1005' && r.credit === '');
    // 1 row that was also unmapped by V1 (1005|?) + 30 rows V1 wrongly mapped
    expect(v2Equivalents.length).toBe(31);

    // Sum of all those V2-unmapped rows equals V1's wrong-mapping sum plus
    // V1's one acknowledged unmapped row (313.70).
    const wrongSum = v1WronglyMapped.reduce((s, r) => s + r.amount, 0);
    const v2UnmappedSum = v2Equivalents.reduce((s, r) => s + r.amount, 0);
    expect(v2UnmappedSum).toBeCloseTo(wrongSum + 313.7, 2);
  });

  it('classifies the same SWISSCARD/AMEX block into the manual unmapped bucket as V1', async () => {
    // V1's "zu_prüfen" file contains 21 SWISSCARD AMEX rows with no debit/credit.
    // V2's "manual" class produces the same 21 rows with both columns empty.
    const v1 = await loadV1Baseline();
    const v1Manual = v1.filter((r) => r.debit === '' && r.credit === '');
    const v2Manual = v2.filter((r) => r.debit === '' && r.credit === '');
    expect(v2Manual.length).toBe(v1Manual.length);
    expect(v2Manual.length).toBe(21);
    const sumV1 = v1Manual.reduce((s, r) => s + r.amount, 0);
    const sumV2 = v2Manual.reduce((s, r) => s + r.amount, 0);
    expect(sumV2).toBeCloseTo(sumV1, 2);
  });
});
