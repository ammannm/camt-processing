/**
 * UI editor helpers — load + save tables.yaml and matrices.yaml.
 *
 * The renderer edits data as a Record<string, Record<string, string>> bag
 * (text inputs everywhere). Before writing back we:
 *   1. Coerce each cell value into the most natural primitive type
 *      (boolean / number / string) using a small, deterministic heuristic.
 *   2. Strip empty values entirely (a missing key in YAML is cleaner than
 *      an empty string).
 *   3. Validate the result against the same Zod schema the engine uses,
 *      so an invalid edit is caught before it ever hits disk.
 *
 * YAML round-trip is via the `yaml` package's stringify — block style,
 * default indent. Comments in the original file are not preserved (a known
 * trade-off; the UI/LLM-driven workflow doesn't need them).
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md §4.1 (tables) / §4.2 (matrices).
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  appConfigSchema,
  classesFileSchema,
  extractionFileSchema,
  exportFileSchema,
  matricesFileSchema,
  pipelineFileSchema,
  registriesFileSchema,
  tablesFileSchema,
  validationFileSchema,
  type CellValue,
  type MatrixDef,
  type TableDef
} from '../config/schema';
import { loadConfig, validateCrossReferences, ConfigError } from '../config/loader';
import type { ZodTypeAny, z } from 'zod';

export class SaveError extends Error {
  constructor(message: string, public readonly issues?: unknown) {
    super(message);
    this.name = 'SaveError';
  }
}

// ---------- value coercion ----------

/**
 * Coerces a user-entered string into the natural primitive type:
 *   - "true" / "false" (case-insensitive) → boolean
 *   - matches /^-?\d+(\.\d+)?$/                → number
 *   - everything else                          → string (trimmed)
 *
 * Non-string inputs (already typed) are returned unchanged.
 */
export function coerceCellValue(input: unknown): CellValue | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'boolean' || typeof input === 'number') return input;
  if (typeof input !== 'string') return String(input);
  const s = input.trim();
  if (s === '') return undefined;
  const low = s.toLowerCase();
  if (low === 'true') return true;
  if (low === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// ---------- tables ----------

/**
 * User edits arrive as `{ tableName: { columns, rows: { key: { col: raw }}}}`.
 * We coerce each cell, drop empty ones, validate, and stringify.
 */
export function buildTablesYaml(raw: unknown): { yaml: string; parsed: Record<string, TableDef> } {
  const cleaned = cleanTables(raw);
  const validated = tablesFileSchema.safeParse({ tables: cleaned });
  if (!validated.success) {
    throw new SaveError(
      `Tables validation failed:\n${formatIssues(validated.error.issues)}`,
      validated.error.issues
    );
  }
  const yaml = stringifyYaml({ tables: validated.data.tables });
  return { yaml, parsed: validated.data.tables };
}

function cleanTables(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [tableName, table] of Object.entries(raw)) {
    if (!isObject(table)) continue;
    const columns = Array.isArray(table.columns) ? table.columns.map(String) : [];
    const rows = isObject(table.rows) ? table.rows : {};
    const cleanedRows: Record<string, Record<string, CellValue>> = {};
    for (const [key, row] of Object.entries(rows)) {
      if (!isObject(row)) continue;
      const cleanedRow: Record<string, CellValue> = {};
      for (const [col, val] of Object.entries(row)) {
        const coerced = coerceCellValue(val);
        if (coerced !== undefined) cleanedRow[col] = coerced;
      }
      // A row with no non-empty cells is dropped — UI artifact of an
      // unfinished new row.
      if (Object.keys(cleanedRow).length > 0) cleanedRows[key.trim()] = cleanedRow;
    }
    out[tableName.trim()] = { columns, rows: cleanedRows };
  }
  return out;
}

// ---------- matrices ----------

export function buildMatricesYaml(raw: unknown): { yaml: string; parsed: Record<string, MatrixDef> } {
  const cleaned = cleanMatrices(raw);
  const validated = matricesFileSchema.safeParse({ matrices: cleaned });
  if (!validated.success) {
    throw new SaveError(
      `Matrices validation failed:\n${formatIssues(validated.error.issues)}`,
      validated.error.issues
    );
  }
  const yaml = stringifyYaml({ matrices: validated.data.matrices });
  return { yaml, parsed: validated.data.matrices };
}

function cleanMatrices(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [matrixName, matrix] of Object.entries(raw)) {
    if (!isObject(matrix)) continue;
    const cells = isObject(matrix.cells) ? matrix.cells : {};
    const cleanedCells: Record<string, Record<string, CellValue>> = {};
    for (const [rowKey, row] of Object.entries(cells)) {
      if (!isObject(row)) continue;
      const cleanedRow: Record<string, CellValue> = {};
      for (const [colKey, val] of Object.entries(row)) {
        const coerced = coerceCellValue(val);
        if (coerced !== undefined) cleanedRow[colKey] = coerced;
      }
      if (Object.keys(cleanedRow).length > 0) cleanedCells[rowKey.trim()] = cleanedRow;
    }
    out[matrixName.trim()] = {
      row_label: typeof matrix.row_label === 'string' ? matrix.row_label : undefined,
      col_label: typeof matrix.col_label === 'string' ? matrix.col_label : undefined,
      cells: cleanedCells
    };
  }
  return out;
}

// ---------- file write ----------

/**
 * Writes a YAML string to a file under `configDir`. Path is constrained
 * to that directory — no caller can write outside of it.
 */
export function writeConfigFile(configDir: string, fileName: string, content: string): string {
  const fullPath = path.resolve(configDir, fileName);
  const expectedPrefix = path.resolve(configDir) + path.sep;
  if (!fullPath.startsWith(expectedPrefix)) {
    throw new SaveError(`Refusing to write outside config directory: ${fullPath}`);
  }
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// ---------- universal config file save ----------

/**
 * The seven editable config files. Each has its own Zod schema and a
 * top-level key inside the appConfigSchema that the resulting data is
 * spliced into when building the hypothetical merged config used for
 * cross-reference validation.
 */
const CONFIG_FILES: Record<
  string,
  { fileName: string; schema: ZodTypeAny; topKey: keyof z.infer<typeof appConfigSchema> }
> = {
  classes:     { fileName: 'classes.yaml',     schema: classesFileSchema,     topKey: 'classes' },
  extraction:  { fileName: 'extraction.yaml',  schema: extractionFileSchema,  topKey: 'extraction' },
  tables:      { fileName: 'tables.yaml',      schema: tablesFileSchema,      topKey: 'tables' },
  matrices:    { fileName: 'matrices.yaml',    schema: matricesFileSchema,    topKey: 'matrices' },
  pipeline:    { fileName: 'pipeline.yaml',    schema: pipelineFileSchema,    topKey: 'pipeline' },
  registries:  { fileName: 'registries.yaml',  schema: registriesFileSchema,  topKey: 'registries' },
  validation:  { fileName: 'validation.yaml',  schema: validationFileSchema,  topKey: 'validation' },
  export:      { fileName: 'export.yaml',      schema: exportFileSchema,      topKey: 'export_profiles' }
};

export type ConfigFileId = keyof typeof CONFIG_FILES;

export const CONFIG_FILE_IDS: ConfigFileId[] = Object.keys(CONFIG_FILES) as ConfigFileId[];

function specFor(id: ConfigFileId): { fileName: string; schema: ZodTypeAny; topKey: keyof z.infer<typeof appConfigSchema> } {
  const spec = CONFIG_FILES[id];
  if (!spec) throw new SaveError(`Unknown config file id: "${id}"`);
  return spec;
}

/**
 * Returns the on-disk YAML content of one of the editable config files.
 * If the file does not exist (allowed for optional files like validation.yaml),
 * returns an empty string.
 */
export function readConfigFile(configDir: string, id: ConfigFileId): string {
  const fileName = specFor(id).fileName;
  const abs = path.join(configDir, fileName);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf-8');
}

/**
 * Validates the YAML text of `id` against its own schema AND against the
 * cross-reference rules of the full merged config (other files loaded
 * fresh from disk). Writes the file only when both pass.
 */
export function saveConfigFile(configDir: string, id: ConfigFileId, content: string): string {
  const spec = specFor(id);

  // 1. YAML parse
  let parsed: unknown;
  try {
    parsed = parseYaml(content) ?? {};
  } catch (err) {
    throw new SaveError(`YAML-Parse-Fehler in ${spec.fileName}: ${(err as Error).message}`);
  }

  // 2. File-specific schema
  const fileResult = spec.schema.safeParse(parsed);
  if (!fileResult.success) {
    throw new SaveError(
      `Schema-Fehler in ${spec.fileName}:\n${formatIssues(fileResult.error.issues)}`,
      fileResult.error.issues
    );
  }

  // 3. Cross-reference check: load the OTHER files fresh, then merge in
  // the edited one and re-validate.
  let merged;
  try {
    const others = loadConfig(configDir);
    // Pull the relevant sub-field out of the freshly-parsed result and
    // splice it into the merged shape.
    const sub = (fileResult.data as Record<string, unknown>)[
      // For most files the file-schema's top key equals the appConfig top key
      // (`classes`, `extraction`, …). For export, the file's top key is
      // `export_profiles` (same as appConfig). So either way: same name.
      spec.topKey as string
    ];
    merged = appConfigSchema.parse({ ...others, [spec.topKey]: sub });
    validateCrossReferences(merged);
  } catch (err) {
    if (err instanceof ConfigError) {
      throw new SaveError(`Querverweis-Fehler beim Speichern von ${spec.fileName}:\n${err.message}`);
    }
    throw err;
  }

  // 4. Write
  return writeConfigFile(configDir, spec.fileName, content);
}

// ---------- internals ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formatIssues(
  issues: { path: (string | number)[]; message: string }[]
): string {
  return issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
