/**
 * Domain-free types for V2.
 *
 * Hard rule: no domain vocabulary leaks into TypeScript. Field names are
 * opaque strings driven by YAML. Class identifiers are opaque strings.
 * Output schemas are configured, not declared in code.
 *
 * See ../../../GENERIC_PRIMITIVES.md for the spec these types implement.
 */

/** Opaque class identifier produced by classification (§1). YAML-defined. */
export type ClassKey = string & { readonly __brand: 'ClassKey' };
export const asClassKey = (s: string): ClassKey => s as ClassKey;

/**
 * A generic field bag. The engine treats it as opaque — only YAML rules
 * know which field names exist for a given class.
 */
export type FieldBag = Record<string, unknown>;

/**
 * Raw input row produced by an IO reader. Field names are conventions of
 * the reader; the engine reads them only via configured field references.
 * The `raw` slot carries the original parsed payload for diagnostics.
 */
export interface RawRow {
  fields: FieldBag;
  raw?: unknown;
}

/** Result of classification (§1). */
export interface ClassifiedRow extends RawRow {
  classKey: ClassKey;
  classificationScore: number;
  /** §7. Only populated when the run requested diagnostics. */
  diagnostics?: RowDiagnostics;
}

/** A diagnostic message attached to a row (§7). */
export interface RowError {
  field?: string;
  message: string;
  source?: string;
}

/** Result of extraction + pipeline run (§2/§3/§5/§6). */
export interface ProcessedRow {
  /** Class chosen during §1. */
  classKey: ClassKey;
  /** All fields populated by extraction + pipeline steps. Schema is YAML-driven. */
  fields: FieldBag;
  /** Errors and warnings collected along the way. */
  errors: RowError[];
  /** Optional structured per-row diagnostics (§7). */
  diagnostics?: RowDiagnostics;
  /** Reference to the input row that produced this (for traceability). */
  source: RawRow;
}

/** Per-row diagnostic record (§7). */
export interface RowDiagnostics {
  classification: { winner?: string; allScores: { class: string; score: number }[] };
  extraction: Record<string, ExtractionTrace>;
  pipeline: PipelineStepTrace[];
}

export interface ExtractionTrace {
  matched: string | number | undefined;
  via: string; // "regex" | "template" | "token:last_two_words" | ...
}

/**
 * Reads a field from a ProcessedRow with three layers of lookup:
 *   1. Synthetic pseudo-fields exposed by the engine — _class, _has_errors,
 *      _errors (joined message string), _error_count.
 *   2. Fields produced by extraction / pipeline (row.fields).
 *   3. Raw input fields (row.source.fields) as fallback.
 *
 * Used by step-runner templates / conditions and by the exporter for both
 * column reads and filter evaluation, so every consumer sees the same view.
 */
export function readRowField(row: ProcessedRow, name: string): unknown {
  switch (name) {
    case '_class':
      return row.classKey;
    case '_has_errors':
      return row.errors.length > 0;
    case '_errors':
      return row.errors.map((e) => e.message).join('; ');
    case '_error_count':
      return row.errors.length;
  }
  if (name in row.fields) return row.fields[name];
  return row.source.fields[name];
}

export interface PipelineStepTrace {
  step: string; // "lookup_in_table:tables.foo" | "set" | "when" | "emit_row"
  result: 'applied' | 'skipped' | 'missed' | 'error';
  detail?: Record<string, unknown>;
}

/** Final processing result for a batch of input rows. */
export interface ProcessingResult {
  rows: ProcessedRow[];
  unclassified: { row: RawRow; allScores: { class: string; score: number }[] }[];
}
