/**
 * §3 Werttransformation
 *
 * Each transform is a pure function:
 *   (currentValue, params, ctx) → newValue
 *
 * Returning undefined drops the value. Returning a number switches the field
 * to numeric for downstream transforms.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §3
 */

import type { TransformSpec } from '../config/schema';

export interface TransformContext {
  rawFields: Record<string, unknown>;
  extractedFields: Record<string, unknown>;
  registries: Record<string, string[]>;
  /** Renders a template against extractedFields + rawFields. */
  renderTemplate: (template: string) => string;
}

/** Side-effects (rare): one transform may set another field — collected here. */
export interface TransformSideEffects {
  /** Field name → value to assign after the transform chain completes. */
  fieldAssignments: Record<string, unknown>;
}

/**
 * Apply one transform. Reports value + side-effects (e.g. max_length with
 * move_overflow_to_field needs to set another field on the row).
 */
export function applyTransform(
  spec: TransformSpec,
  value: string | number | undefined,
  ctx: TransformContext,
  side: TransformSideEffects
): string | number | undefined {
  if (value === undefined) return undefined;

  if ('to_decimal' in spec) return tToDecimal(value, spec.to_decimal.decimal_separator);
  if ('absolute_value' in spec) return tAbsoluteValue(value);
  if ('max_length' in spec) return tMaxLength(value, spec.max_length, ctx, side);
  if ('take_last_n_chars' in spec) return tTakeLastNChars(value, spec.take_last_n_chars);
  if ('remove_pattern' in spec) return tRemovePattern(value, spec.remove_pattern);
  if ('replace_literal' in spec) return tReplaceLiteral(value, spec.replace_literal);
  if ('prefix' in spec) return String(value).length === 0 ? value : spec.prefix + String(value);
  if ('suffix' in spec) return String(value).length === 0 ? value : String(value) + spec.suffix;
  if ('conditional_prefix' in spec) return tConditionalPrefix(value, spec.conditional_prefix, ctx);
  if ('strip_known_prefixes' in spec) return tStripKnownPrefixes(value, spec.strip_known_prefixes, ctx);
  if ('trim' in spec) return String(value).trim();

  return value;
}

// ---------- per-transform implementations ----------

function tToDecimal(value: string | number, decSeparator: string | undefined): number {
  if (typeof value === 'number') return value;
  const sep = decSeparator ?? '.';
  const normalized = sep === '.' ? value : value.split(sep).join('.');
  const n = parseFloat(normalized);
  if (Number.isNaN(n)) throw new Error(`to_decimal: cannot parse "${value}"`);
  return n;
}

function tAbsoluteValue(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(n)) throw new Error(`absolute_value: not a number ("${value}")`);
  return Math.abs(n);
}

function tMaxLength(
  value: string | number,
  params: {
    limit: number;
    fallback_template?: string;
    move_field_to_overflow?: { from_field: string; to_field: string };
  },
  ctx: TransformContext,
  side: TransformSideEffects
): string {
  const s = String(value);
  if (s.length <= params.limit) return s;

  if (params.move_field_to_overflow) {
    // Copy the *current value of `from_field`* into `to_field`. The fallback
    // template typically drops that field, so the move preserves it.
    const fromValue = ctx.extractedFields[params.move_field_to_overflow.from_field];
    if (fromValue !== undefined) {
      side.fieldAssignments[params.move_field_to_overflow.to_field] = fromValue;
    }
  }

  if (params.fallback_template) {
    return ctx.renderTemplate(params.fallback_template).slice(0, params.limit);
  }
  return s.slice(0, params.limit);
}

function tTakeLastNChars(value: string | number, n: number): string {
  return String(value).slice(-n);
}

function tRemovePattern(value: string | number, pattern: string): string {
  return String(value).replace(new RegExp(pattern, 'g'), '').trim();
}

function tReplaceLiteral(
  value: string | number,
  params: { from: string; to: string }
): string {
  return String(value).split(params.from).join(params.to);
}

function tConditionalPrefix(
  value: string | number,
  params: { from_field: string; when_value: string | number | boolean; then: string; else?: string },
  ctx: TransformContext
): string {
  const actual = ctx.rawFields[params.from_field] ?? ctx.extractedFields[params.from_field];
  const matches =
    typeof params.when_value === 'boolean'
      ? actual === params.when_value
      : String(actual) === String(params.when_value);
  const pre = matches ? params.then : (params.else ?? '');
  return pre + String(value);
}

function tStripKnownPrefixes(
  value: string | number,
  params: { registry: string },
  ctx: TransformContext
): string {
  const list = ctx.registries[params.registry];
  if (!list) throw new Error(`strip_known_prefixes: unknown registry "${params.registry}"`);
  let s = String(value);
  // Strip case-insensitively; repeat once if a longer prefix uncovers a
  // shorter one underneath (e.g. "PREFIX A PREFIX B value").
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of list) {
      if (s.toUpperCase().startsWith(p.toUpperCase())) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
  }
  return s;
}
