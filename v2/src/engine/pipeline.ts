/**
 * Top-level pipeline orchestrator.
 *
 * Sequence (all sections from ../../../GENERIC_PRIMITIVES.md):
 *   IO read          (boundary, e.g. io/camt-reader)  — caller does this
 *   §1 classify      (classify/classifier)
 *   §2/§3 extract    (extract/extractor)
 *   §5 + §6 run+fan-out (run/step-runner)
 *   §9 export        (export/exporter — caller does this if writing to disk)
 *
 * Each row goes through classify → extract → runPipeline; results from
 * runPipeline can be more than one row (emit_row fan-out). All output rows
 * are collected into ProcessingResult.rows; unclassified rows go into a
 * separate bucket with the per-rule scores for diagnostics.
 */

import type { AppConfig } from './config/schema';
import type { ProcessedRow, ProcessingResult, RawRow } from '../shared/types';
import { asClassKey } from '../shared/types';
import { classifyAll } from './classify/classifier';
import { extractOne } from './extract/extractor';
import { runPipeline } from './run/step-runner';
import { validateRows } from './validate/validator';

export interface RunOptions {
  /** Reserved for §7 — structured per-row diagnostics. */
  collectDiagnostics?: boolean;
}

/**
 * Synthetic class key assigned to rows that no classification rule matched.
 * Lets them flow through extraction (no-op, no rules) and pipeline (no-op),
 * so they still land in the final result list and can be routed by export
 * filters (e.g. `{ field: _class, equals: "_unclassified" }`).
 */
export const UNCLASSIFIED_KEY = '_unclassified';

export function processRows(
  rows: RawRow[],
  config: AppConfig,
  options: RunOptions = {}
): ProcessingResult {
  const trace = options.collectDiagnostics === true;
  const { classified, unclassified } = classifyAll(rows, config, { trace });
  const out: ProcessedRow[] = [];

  for (const row of classified) {
    const processed = extractOne(row, config, { trace });
    const expanded = runPipeline(processed, config, { trace });
    out.push(...expanded);
  }

  // Unclassified rows are turned into pass-through ProcessedRows so they
  // can be routed by export filters alongside the classified ones.
  for (const u of unclassified) {
    out.push({
      classKey: asClassKey(UNCLASSIFIED_KEY),
      fields: {},
      errors: [{ field: '*', message: 'no classification rule matched' }],
      source: { fields: u.row.fields, raw: u.row.raw }
    });
  }

  // §10: run validation rules across all rows (classified + unclassified).
  // Appends errors in-place. Does not influence row routing — the export
  // layer decides on its own whether/how to filter.
  validateRows(out, config);

  return { rows: out, unclassified };
}
