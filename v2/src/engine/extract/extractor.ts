/**
 * §2 + §3 + §7 — orchestrator
 *
 * For each ClassifiedRow, walk the field rules of its class in YAML order:
 *   1. Resolve the source spec to an initial value.
 *   2. Apply transforms in declared order.
 *   3. If the result is undefined / empty and the field is `required`,
 *      record an error; otherwise write the value into ProcessedRow.fields.
 *   4. Collect any side-effects (e.g. max_length.move_overflow_to_field).
 *
 * Templates may reference any previously-extracted field on this row plus
 * any field already present in the raw input.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §2/§3/§7
 */

import type { AppConfig, FieldRule } from '../config/schema';
import type { ClassifiedRow, ProcessedRow, RowError } from '../../shared/types';
import { applySource, type SourceContext } from './sources';
import { applyTransform, type TransformContext, type TransformSideEffects } from './transforms';

export interface ExtractOptions {
  /** §7. Carry classification trace forward and record per-field extraction trace. */
  trace?: boolean;
}

export function extractAll(
  rows: ClassifiedRow[],
  config: AppConfig,
  opts: ExtractOptions = {}
): ProcessedRow[] {
  return rows.map((row) => extractOne(row, config, opts));
}

export function extractOne(
  row: ClassifiedRow,
  config: AppConfig,
  opts: ExtractOptions = {}
): ProcessedRow {
  const classRules =
    (config.extraction as Record<string, Record<string, FieldRule>>)[row.classKey] ?? {};
  const extractedFields: Record<string, unknown> = {};
  const errors: RowError[] = [];

  for (const [fieldName, rule] of Object.entries(classRules)) {
    try {
      const value = runField(rule, fieldName, row, extractedFields, config, errors);
      if (value !== undefined && value !== '') {
        extractedFields[fieldName] = value;
        if (opts.trace && row.diagnostics) {
          row.diagnostics.extraction[fieldName] = {
            matched: value,
            via: identifyExtractSource(rule)
          };
        }
      } else if (rule.required) {
        const customMessage = (rule as { required_message?: string }).required_message;
        errors.push({
          field: fieldName,
          message: customMessage
            ? renderRequiredTemplate(customMessage, row, fieldName)
            : `Pflichtfeld '${fieldName}' konnte nicht extrahiert werden`,
          source: rule.include_source_on_error
            ? String(row.fields[defaultSourceField(rule)] ?? '')
            : undefined
        });
      }
    } catch (err) {
      errors.push({
        field: fieldName,
        message: (err as Error).message,
        source: rule.include_source_on_error
          ? String(row.fields[defaultSourceField(rule)] ?? '')
          : undefined
      });
    }
  }

  return {
    classKey: row.classKey,
    fields: extractedFields,
    errors,
    source: { fields: row.fields, raw: row.raw },
    diagnostics: opts.trace ? row.diagnostics : undefined
  };
}

function identifyExtractSource(rule: FieldRule): string {
  const spec = rule.extract as Record<string, unknown>;
  if ('regex' in spec) return 'regex';
  if ('static' in spec) return 'static';
  if ('template' in spec) return 'template';
  if ('token' in spec) {
    const t = spec.token as { position?: string };
    return `token:${t.position ?? '?'}`;
  }
  if ('conditional' in spec) return 'conditional';
  if ('full_text' in spec) return 'full_text';
  return 'unknown';
}

// ---------- internals ----------

function runField(
  rule: FieldRule,
  _fieldName: string,
  row: ClassifiedRow,
  extractedFields: Record<string, unknown>,
  config: AppConfig,
  _errors: RowError[]
): string | number | undefined {
  const srcCtx: SourceContext = { rawFields: row.fields, extractedFields };
  let value = applySource(rule.extract, srcCtx);
  if (value === undefined) return undefined;

  if (rule.transform && rule.transform.length > 0) {
    const transformCtx: TransformContext = {
      rawFields: row.fields,
      extractedFields,
      registries: config.registries,
      renderTemplate: (template: string) =>
        template.replace(/\{(\w+)\}/g, (_, name: string) => {
          const v = extractedFields[name] ?? row.fields[name];
          return v === undefined || v === null ? '' : String(v);
        })
    };
    const side: TransformSideEffects = { fieldAssignments: {} };
    for (const tspec of rule.transform) {
      value = applyTransform(tspec, value, transformCtx, side);
      if (value === undefined) return undefined;
    }
    // Merge side-effect assignments into extractedFields. They land directly
    // so subsequent fields can see them.
    for (const [k, v] of Object.entries(side.fieldAssignments)) {
      extractedFields[k] = v;
    }
  }

  return value;
}

/**
 * Renders a `required_message` template against the row's raw fields plus
 * a synthetic `{field}` placeholder (the offending field name).
 */
function renderRequiredTemplate(template: string, row: ClassifiedRow, fieldName: string): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (name === 'field') return fieldName;
    const v = row.fields[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Best-effort guess at which raw field a rule reads from, used purely for
 * the `include_source_on_error` diagnostic. Defaults to the conventional
 * "source_text" if the extract spec has no `from_field`.
 */
function defaultSourceField(rule: FieldRule): string {
  const spec = rule.extract as Record<string, unknown>;
  if (typeof spec.from_field === 'string') return spec.from_field;
  if (typeof spec.token === 'object' && spec.token !== null) {
    const t = spec.token as { from_field?: string };
    if (typeof t.from_field === 'string') return t.from_field;
  }
  if (typeof spec.full_text === 'object' && spec.full_text !== null) {
    const f = spec.full_text as { from_field?: string };
    if (typeof f.from_field === 'string') return f.from_field;
  }
  return 'source_text';
}
