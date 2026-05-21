/**
 * §6 Mehrfach-Ausgabe
 *
 * Implementation note: emit_row evaluation is intertwined with step
 * execution (the snapshot must be taken at the precise point in the
 * pipeline where the emit_row step appears), so the actual fan-out logic
 * lives in `../run/step-runner.ts`.
 *
 * This module re-exports `runPipeline` under the spec-aligned name `multiply`
 * to keep external callers consistent with the spec sections. Both refer to
 * the same function — only the name differs.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §6
 */

export { runPipeline as multiply } from '../run/step-runner';
