/**
 * Multi-file YAML loader for the seven config files.
 *
 * Responsibilities:
 *   - Read each file under the configured directory.
 *   - Validate each file against its Zod schema (clear error messages).
 *   - Merge into a single `AppConfig`.
 *   - Validate cross-references (class IDs referenced consistently across
 *     classes/extraction/pipeline; tables/matrices/registries referenced by
 *     pipeline must exist; etc.).
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ZodIssue, ZodTypeAny, z } from 'zod';
import {
  appConfigSchema,
  classesFileSchema,
  extractionFileSchema,
  tablesFileSchema,
  matricesFileSchema,
  pipelineFileSchema,
  registriesFileSchema,
  validationFileSchema,
  exportFileSchema,
  type AppConfig
} from './schema';

export class ConfigError extends Error {
  constructor(message: string, public readonly issues?: unknown) {
    super(message);
    this.name = 'ConfigError';
  }
}

const FILES = {
  classes: 'classes.yaml',
  extraction: 'extraction.yaml',
  tables: 'tables.yaml',
  matrices: 'matrices.yaml',
  pipeline: 'pipeline.yaml',
  registries: 'registries.yaml',
  validation: 'validation.yaml',
  export: 'export.yaml'
} as const;

export function loadConfig(configDir: string): AppConfig {
  const dir = path.resolve(configDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new ConfigError(`Config directory not found: ${dir}`);
  }

  const classes = parseFile(dir, FILES.classes, classesFileSchema);
  const extraction = parseFile(dir, FILES.extraction, extractionFileSchema);
  const tables = parseFile(dir, FILES.tables, tablesFileSchema);
  const matrices = parseFile(dir, FILES.matrices, matricesFileSchema);
  const pipeline = parseFile(dir, FILES.pipeline, pipelineFileSchema);
  const registries = parseFile(dir, FILES.registries, registriesFileSchema);
  const validation = parseFileOptional(dir, FILES.validation, validationFileSchema);
  const exportFile = parseFile(dir, FILES.export, exportFileSchema);

  const merged = appConfigSchema.parse({
    classes: classes.classes,
    extraction: extraction.extraction,
    tables: tables.tables,
    matrices: matrices.matrices,
    pipeline: pipeline.pipeline,
    registries: registries.registries,
    validation: validation.validation,
    export_profiles: exportFile.export_profiles
  });

  validateCrossReferences(merged);
  return merged;
}

function parseFile<T extends ZodTypeAny>(dir: string, file: string, schema: T): z.infer<T> {
  const abs = path.join(dir, file);
  if (!fs.existsSync(abs)) {
    throw new ConfigError(`Missing config file: ${abs}`);
  }
  const data = parseYaml(fs.readFileSync(abs, 'utf-8')) ?? {};
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(
      `Invalid configuration in ${file}:\n${formatIssues(result.error.issues)}`,
      result.error.issues
    );
  }
  return result.data;
}

/**
 * Same as parseFile but treats the file as optional — uses the schema's
 * defaults if the file is missing. Used for files that didn't exist in
 * earlier config layouts so existing setups don't break on upgrade.
 */
function parseFileOptional<T extends ZodTypeAny>(dir: string, file: string, schema: T): z.infer<T> {
  const abs = path.join(dir, file);
  if (!fs.existsSync(abs)) return schema.parse({});
  const data = parseYaml(fs.readFileSync(abs, 'utf-8')) ?? {};
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(
      `Invalid configuration in ${file}:\n${formatIssues(result.error.issues)}`,
      result.error.issues
    );
  }
  return result.data;
}

/**
 * Cross-reference checks. Each check is activated once the schema for the
 * referenced section is real (not z.unknown()).
 *
 *   §1 ✅ Every classes[i].class must appear as a key in extraction and pipeline.
 *   §4 ⏳ Every lookup_in_table.table must exist in tables (pipeline schema).
 *   §4 ⏳ Every lookup_in_matrix.matrix must exist in matrices (pipeline schema).
 *   §8 ⏳ Every strip_known_prefixes.registry must exist in registries.
 *   §9 ⏳ Every export.columns[].from_field should be set by some step.
 */
/**
 * Public so save handlers can run the same cross-checks against a
 * hypothetical merged config (one file edited, the others untouched).
 */
export function validateCrossReferences(cfg: AppConfig): void {
  const errors: string[] = [];

  // §1: class IDs must have extraction + pipeline entries.
  const classIds = new Set(cfg.classes.map((c) => c.class));
  for (const id of classIds) {
    if (!(id in cfg.extraction)) {
      errors.push(`class "${id}" defined in classes.yaml has no entry in extraction.yaml`);
    }
    if (!(id in cfg.pipeline)) {
      errors.push(`class "${id}" defined in classes.yaml has no entry in pipeline.yaml`);
    }
  }

  // §4 + §5: lookup_in_table.table and lookup_in_matrix.matrix references
  // must point to defined tables / matrices. Walk recursively because
  // `when` and `emit_row` can hold nested steps.
  const tableNames = new Set(Object.keys(cfg.tables));
  const matrixNames = new Set(Object.keys(cfg.matrices));
  for (const [classKey, pipeline] of Object.entries(cfg.pipeline)) {
    const steps = (pipeline as { steps?: unknown[] }).steps ?? [];
    walkSteps(steps, (step, path) => {
      if (step && typeof step === 'object' && 'lookup_in_table' in step) {
        const body = (step as { lookup_in_table: { table: string } }).lookup_in_table;
        if (!tableNames.has(body.table)) {
          errors.push(
            `pipeline.${classKey}${path} references table "${body.table}" which is not defined in tables.yaml`
          );
        }
      }
      if (step && typeof step === 'object' && 'lookup_in_matrix' in step) {
        const body = (step as { lookup_in_matrix: { matrix: string } }).lookup_in_matrix;
        if (!matrixNames.has(body.matrix)) {
          errors.push(
            `pipeline.${classKey}${path} references matrix "${body.matrix}" which is not defined in matrices.yaml`
          );
        }
      }
    });
  }

  // §3 + §8: strip_known_prefixes.registry references must exist.
  const registryNames = new Set(Object.keys(cfg.registries));
  for (const [classKey, fields] of Object.entries(cfg.extraction)) {
    for (const [fieldName, rule] of Object.entries(fields as Record<string, unknown>)) {
      const transforms = (rule as { transform?: unknown[] }).transform ?? [];
      for (const t of transforms) {
        if (t && typeof t === 'object' && 'strip_known_prefixes' in t) {
          const ref = (t as { strip_known_prefixes: { registry: string } }).strip_known_prefixes
            .registry;
          if (!registryNames.has(ref)) {
            errors.push(
              `extraction.${classKey}.${fieldName} references registry "${ref}" which is not defined in registries.yaml`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(`Cross-reference errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * Walk a pipeline's step list recursively, descending into `when.do` and
 * `emit_row.row.steps`. `visit` is called for every step in document order.
 * `path` is a human-readable suffix like ".steps[2].when.do[0]".
 */
function walkSteps(
  steps: unknown[],
  visit: (step: unknown, path: string) => void,
  prefix = '.steps'
): void {
  steps.forEach((step, i) => {
    const path = `${prefix}[${i}]`;
    visit(step, path);
    if (step && typeof step === 'object') {
      if ('when' in step) {
        const w = (step as { when: { do?: unknown[] } }).when;
        if (Array.isArray(w.do)) walkSteps(w.do, visit, `${path}.when.do`);
      }
      if ('emit_row' in step) {
        const e = (step as { emit_row: { row?: { steps?: unknown[] } } }).emit_row;
        if (Array.isArray(e.row?.steps)) walkSteps(e.row!.steps!, visit, `${path}.emit_row.row.steps`);
      }
    }
  });
}

function formatIssues(issues: ZodIssue[]): string {
  return issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
