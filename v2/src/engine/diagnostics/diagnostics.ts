/**
 * §7 Validierung und Diagnose
 *
 * Helper functions for:
 *   - attaching errors to a row (`required` field missing, lookup miss, etc.)
 *   - structured per-row tracing (which classifier score, which step did what)
 *   - writing a diagnostics file when enabled
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §7
 */

import type { ProcessedRow, RowError, PipelineStepTrace } from '../../shared/types';

export function attachError(row: ProcessedRow, error: RowError): void {
  row.errors.push(error);
}

export function traceStep(row: ProcessedRow, trace: PipelineStepTrace): void {
  if (!row.diagnostics) return;
  row.diagnostics.pipeline.push(trace);
}

export function writeDiagnosticsFile(
  _result: { rows: ProcessedRow[] },
  _outputPath: string
): void {
  throw new Error('writeDiagnosticsFile not yet implemented');
}
