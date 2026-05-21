/**
 * §9 Ausgabe-Mapping
 *
 * Splits ProcessedRows into one or more output buckets via configured
 * filters, then writes each non-empty bucket as a file.
 *
 * The engine itself has no opinion about output schemas — only this
 * module reads `config.export` and produces files.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §9
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import Excel from 'exceljs';
import type {
  AppConfig,
  ColumnFormat,
  Condition,
  ExportColumn,
  ExportFilter,
  ExportOutput,
  ExportProfile
} from '../config/schema';
import type { ProcessedRow } from '../../shared/types';
import { readRowField } from '../../shared/types';

export interface ExportTable {
  headers: string[];
  rows: (string | number | boolean)[][];
}

export interface ExportWriteResult {
  /** Profile name (from export_profiles map key). */
  profile: string;
  /** Output suffix within the profile (from output.name), or "" if unnamed. */
  bucket: string;
  /** Absolute path of the written file (omitted when the bucket was empty). */
  filePath?: string;
  table: ExportTable;
  rowCount: number;
}

export interface ExportOptions {
  /** Which profiles to run. If omitted or empty, all configured profiles run. */
  profiles?: string[];
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

/**
 * Runs the selected (or all) export profiles. Each profile produces one
 * or more files based on its outputs. Returns the per-bucket result list.
 *
 * Filename composition: `<stem>_<profile><output_name><ext>` — both
 * profile and output_name are appended only when non-empty. Used together,
 * they let one base path produce e.g. `out_dt_import.xlsx` plus
 * `out_analytics.json` in a single invocation.
 */
export async function exportRows(
  rows: ProcessedRow[],
  config: AppConfig,
  outputBasePath: string,
  options: ExportOptions = {}
): Promise<ExportWriteResult[]> {
  const allProfiles = config.export_profiles;
  const allNames = Object.keys(allProfiles);
  if (allNames.length === 0) {
    throw new ExportError(
      'No export profiles defined in export.yaml. Add at least one entry under `export_profiles:`.'
    );
  }

  const selectedNames = options.profiles && options.profiles.length > 0 ? options.profiles : allNames;
  // Validate selection up front so a typo doesn't silently skip a profile.
  for (const name of selectedNames) {
    if (!(name in allProfiles)) {
      throw new ExportError(
        `Unknown export profile "${name}". Known: [${allNames.join(', ')}]`
      );
    }
  }

  // Apply profile-name suffix only when multiple profiles are selected;
  // single-profile runs use the chosen base path as-is so the UX matches
  // "user picked a filename".
  const useProfileSuffix = selectedNames.length > 1;

  const results: ExportWriteResult[] = [];
  for (const name of selectedNames) {
    const profile = allProfiles[name]!;
    results.push(
      ...(await runProfile(name, profile, rows, outputBasePath, useProfileSuffix))
    );
  }
  return results;
}

async function runProfile(
  profileName: string,
  profile: ExportProfile,
  rows: ProcessedRow[],
  outputBasePath: string,
  useProfileSuffix: boolean
): Promise<ExportWriteResult[]> {
  const buckets = routeRows(rows, profile.outputs);
  // Bucket suffix only matters when the profile produces multiple outputs.
  // For a single unnamed output the file lands at the unmodified path.
  const useBucketSuffix = profile.outputs.length > 1;
  const results: ExportWriteResult[] = [];
  for (let i = 0; i < profile.outputs.length; i++) {
    const out = profile.outputs[i]!;
    const bucketRows = buckets[i]!;
    const table = buildTable(bucketRows, out.columns);
    const result: ExportWriteResult = {
      profile: profileName,
      bucket: out.name ?? '',
      table,
      rowCount: bucketRows.length
    };
    if (bucketRows.length > 0) {
      const filePath = resolveOutputPath(
        outputBasePath,
        useProfileSuffix ? profileName : '',
        useBucketSuffix ? out.name : undefined
      );
      await writeOne(table, filePath, profile.format);
      result.filePath = filePath;
    }
    results.push(result);
  }
  return results;
}

// ---------- routing ----------

function routeRows(rows: ProcessedRow[], outputs: ExportOutput[]): ProcessedRow[][] {
  const buckets: ProcessedRow[][] = outputs.map(() => []);
  for (const row of rows) {
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i]!;
      if (out.filter === undefined || matchesFilter(out.filter, row)) {
        buckets[i]!.push(row);
        break; // first-match-wins
      }
    }
  }
  return buckets;
}

function matchesFilter(filter: ExportFilter, row: ProcessedRow): boolean {
  if ('any_of' in filter) return filter.any_of.some((f) => matchesFilter(f, row));
  if ('all_of' in filter) return filter.all_of.every((f) => matchesFilter(f, row));
  return evaluateExportCondition(filter as Condition, row);
}

/**
 * Filter-side condition evaluator. Identical semantics to the §5 step
 * evaluator. Both share `readRowField` so the same pseudo-fields
 * (_class, _has_errors, _errors, _error_count) work everywhere.
 */
function evaluateExportCondition(cond: Condition, row: ProcessedRow): boolean {
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

// ---------- file path resolution ----------

/**
 * Composes the output file path as `<stem>_<profile><bucket><ext>`.
 * Profile and bucket suffixes are appended only when non-empty, so a
 * single-profile single-output config writes plain `<basePath>` and a
 * multi-profile config produces distinct sibling files.
 */
function resolveOutputPath(basePath: string, profileName: string, bucketName: string | undefined): string {
  const ext = path.extname(basePath);
  const stem = basePath.slice(0, basePath.length - ext.length);
  const profilePart = profileName ? `_${profileName}` : '';
  const bucketPart = bucketName ?? '';
  return `${stem}${profilePart}${bucketPart}${ext}`;
}

// ---------- table assembly ----------

export function buildTable(rows: ProcessedRow[], columns: ExportColumn[]): ExportTable {
  const headers = columns.map((c) => c.header);
  const tableRows = rows.map((row) =>
    columns.map((col) => formatValue(readRowField(row, col.from_field), col.format))
  );
  return { headers, rows: tableRows };
}

// ---------- formatters ----------

export function formatValue(value: unknown, format: ColumnFormat | undefined): string | number | boolean {
  if (value === undefined || value === null) return '';
  if (!format) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value);
  }
  switch (format) {
    case 'date_ddmmyyyy':
      return formatDateDdmmyyyy(String(value));
    case 'number_two_decimals':
      return formatNumber(value, 2);
    case 'number_no_decimals':
      return formatNumber(value, 0);
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'trim':
      return String(value).trim();
  }
}

function formatDateDdmmyyyy(s: string): string {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  return s;
}

function formatNumber(value: unknown, decimals: number): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(decimals);
}

// ---------- writers ----------

async function writeOne(table: ExportTable, outputPath: string, format: 'xlsx' | 'csv' | 'json'): Promise<void> {
  if (format === 'xlsx') return writeXlsx(table, outputPath);
  if (format === 'csv') return writeCsv(table, outputPath);
  return writeJson(table, outputPath);
}

async function writeXlsx(table: ExportTable, outputPath: string): Promise<void> {
  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(table.headers);
  for (const r of table.rows) sheet.addRow(r);
  await workbook.xlsx.writeFile(outputPath);
}

async function writeCsv(table: ExportTable, outputPath: string): Promise<void> {
  const lines: string[] = [];
  lines.push(table.headers.map(csvCell).join(','));
  for (const r of table.rows) lines.push(r.map((v) => csvCell(v)).join(','));
  await fs.writeFile(outputPath, lines.join('\n') + '\n', 'utf-8');
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function writeJson(table: ExportTable, outputPath: string): Promise<void> {
  const records = table.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    table.headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  await fs.writeFile(outputPath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
}
