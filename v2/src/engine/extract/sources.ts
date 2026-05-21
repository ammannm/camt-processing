/**
 * §2 Feldextraktion — value sources.
 *
 * One pure function per source type. All sources return string | number |
 * undefined. Undefined means "nothing extracted" — the orchestrator decides
 * whether that is an error (via the field's `required` flag).
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §2
 */

import type { ExtractSpec } from '../config/schema';

export const DEFAULT_SOURCE_FIELD = 'source_text';

export interface SourceContext {
  /** Raw row fields (as produced by the IO reader). */
  rawFields: Record<string, unknown>;
  /** Fields already extracted earlier in the same class — for templates. */
  extractedFields: Record<string, unknown>;
}

/**
 * Apply a single extraction spec. Returns the raw extracted value before
 * any transformation. Caller is responsible for running transforms.
 */
export function applySource(spec: ExtractSpec, ctx: SourceContext): string | number | undefined {
  if ('regex' in spec) return sourceRegex(spec, ctx);
  if ('static' in spec) return spec.static as string | number;
  if ('template' in spec) return sourceTemplate(spec.template, ctx);
  if ('token' in spec) return sourceToken(spec.token, ctx);
  if ('conditional' in spec) return sourceConditional(spec.conditional, ctx);
  if ('full_text' in spec) return sourceFullText(spec.full_text, ctx);
  return undefined;
}

// ---------- per-source implementations ----------

function sourceRegex(
  spec: Extract<ExtractSpec, { regex: string }>,
  ctx: SourceContext
): string | undefined {
  const text = readSourceField(spec.from_field, ctx);
  if (!text) return undefined;
  const match = text.match(new RegExp(spec.regex));
  if (!match) return undefined;
  const idx = spec.capture_group ?? 1;
  return match[idx];
}

function sourceTemplate(template: string, ctx: SourceContext): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = ctx.extractedFields[name] ?? ctx.rawFields[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

function sourceToken(
  spec: Extract<ExtractSpec, { token: unknown }>['token'],
  ctx: SourceContext
): string {
  const text = readSourceField(spec.from_field, ctx);
  if (!text) return '';

  switch (spec.position) {
    case 'first': {
      const t = tokens(text);
      return t[0] ?? '';
    }
    case 'last': {
      const t = tokens(text);
      return t[t.length - 1] ?? '';
    }
    case 'last_n': {
      const t = tokens(text);
      const n = spec.count ?? 1;
      return t.slice(Math.max(0, t.length - n)).join(' ');
    }
    case 'first_part_last_word': {
      const delim = spec.delimiter ?? '  ';
      const idx = text.indexOf(delim);
      const firstPart = idx === -1 ? text : text.slice(0, idx);
      const t = tokens(firstPart);
      return t[t.length - 1] ?? '';
    }
    case 'after_delimiter': {
      const delim = spec.delimiter ?? '  ';
      const idx = text.indexOf(delim);
      if (idx === -1) return '';
      return text.slice(idx + delim.length).trim();
    }
  }
}

function sourceConditional(
  spec: Extract<ExtractSpec, { conditional: unknown }>['conditional'],
  ctx: SourceContext
): string {
  const actual = ctx.rawFields[spec.from_field] ?? ctx.extractedFields[spec.from_field];
  const matches =
    typeof spec.when_value === 'boolean'
      ? actual === spec.when_value
      : String(actual) === String(spec.when_value);
  return matches ? spec.then : (spec.else ?? '');
}

function sourceFullText(
  spec: Extract<ExtractSpec, { full_text: unknown }>['full_text'],
  ctx: SourceContext
): string {
  return readSourceField(spec.from_field, ctx);
}

// ---------- helpers ----------

function readSourceField(fromField: string | undefined, ctx: SourceContext): string {
  const name = fromField ?? DEFAULT_SOURCE_FIELD;
  const v = ctx.rawFields[name];
  return v === undefined || v === null ? '' : String(v);
}

function tokens(text: string): string[] {
  return text.trim().split(/\s+/).filter((t) => t.length > 0);
}
