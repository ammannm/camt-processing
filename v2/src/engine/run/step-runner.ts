/**
 * §5 + §6 — Pipeline-Schrittausführung
 *
 * Per ProcessedRow:
 *   1. Lade die Schrittliste der Klasse aus `config.pipeline[classKey].steps`.
 *   2. Führe jeden Schritt in Reihenfolge aus.
 *   3. `emit_row` erzeugt eine zusätzliche Ergebniszeile aus einem Snapshot
 *      der aktuellen Felder. Die Zusatzzeile durchläuft ihre eigene
 *      Sub-Schrittliste, kann selbst weitere `emit_row` enthalten.
 *
 * Liefert die Hauptzeile + alle emittierten Zusatzzeilen als Array.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §5/§6
 */

import type { AppConfig, Condition, Step } from '../config/schema';
import type { PipelineStepTrace, ProcessedRow, RowError } from '../../shared/types';
import { readRowField } from '../../shared/types';
import { lookupInTable, lookupInMatrix, type MatchSpec } from './lookups';

export interface RunPipelineOptions {
  /** §7. Append step-by-step traces to row.diagnostics.pipeline. */
  trace?: boolean;
}

export function runPipeline(
  row: ProcessedRow,
  config: AppConfig,
  opts: RunPipelineOptions = {}
): ProcessedRow[] {
  const classPipeline = (config.pipeline as Record<string, { steps?: Step[] }>)[row.classKey];
  const steps = classPipeline?.steps ?? [];
  const emitted: ProcessedRow[] = [];
  runSteps(steps, row, config, emitted, opts);
  return [row, ...emitted];
}

// ---------- step dispatch ----------

function runSteps(
  steps: Step[],
  row: ProcessedRow,
  config: AppConfig,
  emitted: ProcessedRow[],
  opts: RunPipelineOptions
): void {
  for (const step of steps) {
    try {
      runStep(step, row, config, emitted, opts);
    } catch (err) {
      row.errors.push({
        field: stepLabel(step),
        message: (err as Error).message
      });
      trace(row, opts, { step: stepLabel(step), result: 'error', detail: { message: (err as Error).message } });
    }
  }
}

function runStep(
  step: Step,
  row: ProcessedRow,
  config: AppConfig,
  emitted: ProcessedRow[],
  opts: RunPipelineOptions
): void {
  if ('lookup_in_table' in step) return runLookupInTable(step.lookup_in_table, row, config, opts);
  if ('lookup_in_matrix' in step) return runLookupInMatrix(step.lookup_in_matrix, row, config, opts);
  if ('set' in step) {
    runSet(step.set, row);
    trace(row, opts, { step: 'set', result: 'applied', detail: { fields: Object.keys(step.set) } });
    return;
  }
  if ('when' in step) {
    if (evaluateCondition(step.when.condition, row)) {
      trace(row, opts, { step: 'when', result: 'applied' });
      runSteps(step.when.do, row, config, emitted, opts);
    } else {
      trace(row, opts, { step: 'when', result: 'skipped' });
    }
    return;
  }
  if ('emit_row' in step) return runEmitRow(step.emit_row, row, config, emitted, opts);
  if ('error_if' in step) return runErrorIf(step.error_if, row, opts);
}

function runErrorIf(
  body: { condition: Condition; message: string; field?: string },
  row: ProcessedRow,
  opts: RunPipelineOptions
): void {
  if (!evaluateCondition(body.condition, row)) {
    trace(row, opts, { step: 'error_if', result: 'skipped' });
    return;
  }
  const rendered = renderTemplate(body.message, row);
  row.errors.push({ message: rendered, field: body.field });
  trace(row, opts, { step: 'error_if', result: 'applied', detail: { message: rendered } });
}

// ---------- individual step implementations ----------

interface LookupInTableBody {
  table: string;
  key_from_field?: string;
  key_from_static?: string;
  match: MatchSpec;
  assign: Record<string, string>;
}

function runLookupInTable(
  body: LookupInTableBody,
  row: ProcessedRow,
  config: AppConfig,
  opts: RunPipelineOptions
): void {
  const key = body.key_from_static ?? String(row.fields[body.key_from_field!] ?? '');
  if (!key) {
    trace(row, opts, { step: `lookup_in_table:${body.table}`, result: 'skipped', detail: { reason: 'empty_key' } });
    return;
  }
  const record = lookupInTable(body.table, key, body.match, config);
  if (!record) {
    trace(row, opts, { step: `lookup_in_table:${body.table}`, result: 'missed', detail: { key } });
    return;
  }
  for (const [outputField, columnName] of Object.entries(body.assign)) {
    const v = record[columnName];
    if (v !== undefined) row.fields[outputField] = v;
  }
  trace(row, opts, {
    step: `lookup_in_table:${body.table}`,
    result: 'applied',
    detail: { key, assigned: Object.keys(body.assign) }
  });
}

interface LookupInMatrixBody {
  matrix: string;
  row_from_field?: string;
  row_from_static?: string;
  col_from_field?: string;
  col_from_static?: string;
  match?: MatchSpec;
  row_match?: MatchSpec;
  col_match?: MatchSpec;
  into_field: string;
}

function runLookupInMatrix(
  body: LookupInMatrixBody,
  row: ProcessedRow,
  config: AppConfig,
  opts: RunPipelineOptions
): void {
  const rowKey = body.row_from_static ?? String(row.fields[body.row_from_field!] ?? '');
  const colKey = body.col_from_static ?? String(row.fields[body.col_from_field!] ?? '');
  if (!rowKey || !colKey) {
    trace(row, opts, { step: `lookup_in_matrix:${body.matrix}`, result: 'skipped', detail: { reason: 'empty_key' } });
    return;
  }
  const rowMatch = body.row_match ?? body.match!;
  const colMatch = body.col_match ?? body.match!;
  const value = lookupInMatrix(body.matrix, rowKey, colKey, rowMatch, config, colMatch);
  if (value === undefined) {
    trace(row, opts, { step: `lookup_in_matrix:${body.matrix}`, result: 'missed', detail: { rowKey, colKey } });
    return;
  }
  row.fields[body.into_field] = value;
  trace(row, opts, {
    step: `lookup_in_matrix:${body.matrix}`,
    result: 'applied',
    detail: { rowKey, colKey, into_field: body.into_field }
  });
}

function runSet(values: Record<string, string | number | boolean>, row: ProcessedRow): void {
  for (const [field, raw] of Object.entries(values)) {
    if (typeof raw === 'string' && raw.includes('{')) {
      row.fields[field] = renderTemplate(raw, row);
    } else {
      row.fields[field] = raw;
    }
  }
}

interface EmitRowBody {
  condition?: Condition;
  row: { steps: Step[] };
}

function runEmitRow(
  body: EmitRowBody,
  parent: ProcessedRow,
  config: AppConfig,
  emitted: ProcessedRow[],
  opts: RunPipelineOptions
): void {
  if (body.condition && !evaluateCondition(body.condition, parent)) {
    trace(parent, opts, { step: 'emit_row', result: 'skipped' });
    return;
  }

  // Snapshot parent fields at the time of the emit. The new row starts with
  // the same field values AND inherits the parent's errors — semantically
  // the emitted row is a derived booking of the same source, so a problem
  // on the source affects both. The sub-pipeline can override fields and
  // append further errors.
  const child: ProcessedRow = {
    classKey: parent.classKey,
    fields: { ...parent.fields },
    errors: [...parent.errors] as RowError[],
    source: parent.source,
    diagnostics: opts.trace
      ? { classification: parent.diagnostics?.classification ?? { allScores: [] }, extraction: {}, pipeline: [] }
      : undefined
  };

  const childEmitted: ProcessedRow[] = [];
  runSteps(body.row.steps, child, config, childEmitted, opts);

  trace(parent, opts, { step: 'emit_row', result: 'applied' });
  emitted.push(child, ...childEmitted);
}

// ---------- helpers ----------

export function evaluateCondition(cond: Condition, row: ProcessedRow): boolean {
  const v = readRowField(row, cond.field);
  if ('equals' in cond) {
    return typeof cond.equals === 'boolean' ? v === cond.equals : String(v) === String(cond.equals);
  }
  if ('not_equals' in cond) {
    return typeof cond.not_equals === 'boolean'
      ? v !== cond.not_equals
      : String(v) !== String(cond.not_equals);
  }
  if ('present' in cond) return v !== undefined && v !== null && String(v).length > 0;
  if ('absent' in cond) return v === undefined || v === null || String(v).length === 0;
  if ('greater_than' in cond) return typeof v === 'number' && v > cond.greater_than;
  if ('less_than' in cond) return typeof v === 'number' && v < cond.less_than;
  return false;
}

function renderTemplate(template: string, row: ProcessedRow): string {
  return template
    .replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = readRowField(row, name);
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function trace(row: ProcessedRow, opts: RunPipelineOptions, entry: PipelineStepTrace): void {
  if (!opts.trace || !row.diagnostics) return;
  row.diagnostics.pipeline.push(entry);
}

function stepLabel(step: Step): string {
  if ('lookup_in_table' in step) return `lookup_in_table:${step.lookup_in_table.table}`;
  if ('lookup_in_matrix' in step) return `lookup_in_matrix:${step.lookup_in_matrix.matrix}`;
  if ('set' in step) return 'set';
  if ('when' in step) return 'when';
  if ('emit_row' in step) return 'emit_row';
  if ('error_if' in step) return 'error_if';
  return 'unknown';
}
