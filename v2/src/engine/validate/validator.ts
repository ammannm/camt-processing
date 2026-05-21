/**
 * §10 Validation
 *
 * Class-agnostic validation rules applied after the pipeline runs but
 * before export. Each rule is a Condition (or composite any_of/all_of) +
 * a template message. Matching rules append errors to row.errors so the
 * UI can display them and the user can manually correct before export.
 *
 * Validation does NOT influence routing — it is purely informational.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §7 (Validierung-Konfiguration)
 */

import type { AppConfig, Condition, ValidationFilter, ValidationRule } from '../config/schema';
import type { ProcessedRow } from '../../shared/types';
import { readRowField } from '../../shared/types';

/**
 * Applies all validation rules to each row in-place. Returns the input
 * array for chaining (rows are mutated — errors appended).
 */
export function validateRows(rows: ProcessedRow[], config: AppConfig): ProcessedRow[] {
  const rules = config.validation.rules;
  if (rules.length === 0) return rows;
  for (const row of rows) {
    for (const rule of rules) {
      if (!ruleApplies(rule, row.classKey)) continue;
      if (matchesFilter(rule.condition, row)) {
        row.errors.push({
          field: rule.field,
          message: renderMessage(rule.message, row)
        });
      }
    }
  }
  return rows;
}

// ---------- helpers ----------

function ruleApplies(rule: ValidationRule, classKey: string): boolean {
  if (rule.exclude_classes && rule.exclude_classes.includes(classKey)) return false;
  if (rule.applies_to && rule.applies_to.length > 0 && !rule.applies_to.includes('*')) {
    return rule.applies_to.includes(classKey);
  }
  return true;
}

function matchesFilter(filter: ValidationFilter, row: ProcessedRow): boolean {
  if ('any_of' in filter) return filter.any_of.some((f) => matchesFilter(f, row));
  if ('all_of' in filter) return filter.all_of.every((f) => matchesFilter(f, row));
  return evaluate(filter, row);
}

function evaluate(cond: Condition, row: ProcessedRow): boolean {
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

function renderMessage(template: string, row: ProcessedRow): string {
  return template
    .replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = readRowField(row, name);
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/\s+/g, ' ')
    .trim();
}
