/**
 * Zod schemas for the seven config files. One schema per file, plus a
 * merged `AppConfig`. Cross-file references (e.g. `pipeline.example_class`
 * must have a matching `extraction.example_class`) are checked by the loader.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md
 *
 * NOTE: Schemas are intentionally not yet implemented — this module declares
 * the surface and will be filled in once the first end-to-end slice is wired.
 */

import { z } from 'zod';

// §1 — Klassifikationsregeln
//   id:             Regel-Identifier (Diagnose, eindeutig empfohlen)
//   match_against:  Feldname der Eingabezeile, gegen den fuzzy-gematcht wird
//   keyword:        Referenz-String für den Fuzzy-Vergleich
//   min_similarity: 0..100, Schwellwert
//   filter:         optionaler Vorfilter; Regel greift nur wenn ein anderes
//                   Feld einen erwarteten Wert hat
//   priority:       optional, Tiebreaker bei exaktem Score-Gleichstand
//                   (höher gewinnt; default 0)
//   class:          opaker Klassen-ID-String, der in extraction/pipeline
//                   referenziert wird

const classRuleFilter = z.object({
  field: z.string(),
  equals: z.union([z.string(), z.number(), z.boolean()])
});

const classRule = z.object({
  id: z.string(),
  match_against: z.string(),
  keyword: z.string(),
  min_similarity: z.number().min(0).max(100),
  filter: classRuleFilter.optional(),
  priority: z.number().int().optional(),
  class: z.string()
});

export const classesFileSchema = z.object({ classes: z.array(classRule).default([]) });
export type ClassRule = z.infer<typeof classRule>;

// §2/§3 — Feldextraktion + Transformationen
//
// Pro Klasse eine geordnete Map `<feldname, FeldRegel>`. Reihenfolge ist
// relevant: spätere Felder dürfen via {feldname} auf frühere zugreifen.

const scalarValue = z.union([z.string(), z.number(), z.boolean()]);

// --- Sources (§2) ---------------------------------------------------------
// Genau eine `extract`-Methode pro Feld. Single-key-Objekt-Form pro Source.

const regexSource = z
  .object({
    regex: z.string(),
    capture_group: z.number().int().nonnegative().optional(),
    from_field: z.string().optional()
  })
  .strict();

const staticSource = z.object({ static: scalarValue }).strict();

const templateSource = z.object({ template: z.string() }).strict();

const tokenSource = z
  .object({
    token: z
      .object({
        position: z.enum([
          'first',
          'last',
          'last_n',
          'first_part_last_word',
          'after_delimiter'
        ]),
        count: z.number().int().positive().optional(),
        delimiter: z.string().optional(),
        from_field: z.string().optional()
      })
      .strict()
  })
  .strict();

const conditionalSource = z
  .object({
    conditional: z
      .object({
        from_field: z.string(),
        when_value: scalarValue,
        then: z.string(),
        else: z.string().optional()
      })
      .strict()
  })
  .strict();

const fullTextSource = z
  .object({
    full_text: z.object({ from_field: z.string().optional() }).strict()
  })
  .strict();

const extractSpec = z.union([
  regexSource,
  staticSource,
  templateSource,
  tokenSource,
  conditionalSource,
  fullTextSource
]);

// --- Transforms (§3) ------------------------------------------------------
// Liste von Single-key-Objekten. Reihenfolge in der Liste = Anwendungsreihenfolge.

const toDecimalT = z
  .object({
    to_decimal: z.object({ decimal_separator: z.string().optional() }).strict()
  })
  .strict();

const absoluteValueT = z.object({ absolute_value: z.literal(true) }).strict();

const maxLengthT = z
  .object({
    max_length: z
      .object({
        limit: z.number().int().positive(),
        fallback_template: z.string().optional(),
        // When the value exceeds `limit` and fallback_template fires, copy
        // the *current value of `from_field`* into `to_field` so that the
        // part dropped by the fallback isn't lost. Matches the spec's
        // "Teil-Wert in anderes Feld verschoben".
        move_field_to_overflow: z
          .object({ from_field: z.string(), to_field: z.string() })
          .strict()
          .optional()
      })
      .strict()
  })
  .strict();

const takeLastNCharsT = z
  .object({ take_last_n_chars: z.number().int().positive() })
  .strict();

const removePatternT = z.object({ remove_pattern: z.string() }).strict();

const replaceLiteralT = z
  .object({ replace_literal: z.object({ from: z.string(), to: z.string() }).strict() })
  .strict();

const prefixT = z.object({ prefix: z.string() }).strict();
const suffixT = z.object({ suffix: z.string() }).strict();

const conditionalPrefixT = z
  .object({
    conditional_prefix: z
      .object({
        from_field: z.string(),
        when_value: scalarValue,
        then: z.string(),
        else: z.string().optional()
      })
      .strict()
  })
  .strict();

const stripKnownPrefixesT = z
  .object({
    strip_known_prefixes: z.object({ registry: z.string() }).strict()
  })
  .strict();

const trimT = z.object({ trim: z.literal(true) }).strict();

const transformSpec = z.union([
  toDecimalT,
  absoluteValueT,
  maxLengthT,
  takeLastNCharsT,
  removePatternT,
  replaceLiteralT,
  prefixT,
  suffixT,
  conditionalPrefixT,
  stripKnownPrefixesT,
  trimT
]);

// --- Field rule -----------------------------------------------------------

const fieldRule = z
  .object({
    extract: extractSpec,
    transform: z.array(transformSpec).optional(),
    required: z.boolean().optional(),
    /** Optional custom message for the `required` error. Templates may
     *  reference the row's raw fields (e.g. `{source_text}`). If omitted,
     *  the engine produces "Pflichtfeld '<field>' konnte nicht extrahiert
     *  werden". */
    required_message: z.string().optional(),
    include_source_on_error: z.boolean().optional()
  })
  .strict();

const classExtraction = z.record(z.string(), fieldRule);

export const extractionFileSchema = z.object({
  extraction: z.record(z.string(), classExtraction).default({})
});

export type ExtractSpec = z.infer<typeof extractSpec>;
export type TransformSpec = z.infer<typeof transformSpec>;
export type FieldRule = z.infer<typeof fieldRule>;

// §4.1 — Einschlüssel-Tabellen
//   columns: deklarative Spaltenliste (nur für Validierung/UI)
//   rows:    Schlüssel -> Record mit den deklarierten Spalten
const cellValue = z.union([z.string(), z.number(), z.boolean()]);

const tableSchema = z
  .object({
    columns: z.array(z.string()).min(1),
    rows: z.record(z.string(), z.record(z.string(), cellValue))
  })
  .superRefine((table, ctx) => {
    const declared = new Set(table.columns);
    for (const [rowKey, row] of Object.entries(table.rows)) {
      for (const col of Object.keys(row)) {
        if (!declared.has(col)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rows', rowKey, col],
            message: `Column "${col}" is not declared in table.columns [${table.columns.join(', ')}]`
          });
        }
      }
    }
  });

export const tablesFileSchema = z.object({
  tables: z.record(z.string(), tableSchema).default({})
});

// §4.2 — Zweischlüssel-Matrizen
//   row_label / col_label: nur Doku/UI
//   cells: Zeilenschlüssel -> Spaltenschlüssel -> Wert
const matrixSchema = z.object({
  row_label: z.string().optional(),
  col_label: z.string().optional(),
  cells: z.record(z.string(), z.record(z.string(), cellValue))
});

export const matricesFileSchema = z.object({
  matrices: z.record(z.string(), matrixSchema).default({})
});

export type TableDef = z.infer<typeof tableSchema>;
export type MatrixDef = z.infer<typeof matrixSchema>;
export type CellValue = z.infer<typeof cellValue>;

// §5 + §6 — Pipeline-Schritte
//
// Pro Klasse `steps: Step[]`. Step ist eines von:
//   lookup_in_table, lookup_in_matrix, set, when, emit_row
// Jeder Step ist ein Single-key-Objekt (gleicher Stil wie Sources/Transforms).
// `when` und `emit_row` enthalten verschachtelte Schritte — daher z.lazy.

const matchSpec = z
  .object({
    mode: z.enum(['exact', 'exact_normalized', 'fuzzy', 'fuzzy_normalized']),
    min_similarity: z.number().min(0).max(100).optional()
  })
  .strict();

// --- Conditions (discriminated union) ---
const condition = z.union([
  z.object({ field: z.string(), equals: scalarValue }).strict(),
  z.object({ field: z.string(), not_equals: scalarValue }).strict(),
  z.object({ field: z.string(), present: z.literal(true) }).strict(),
  z.object({ field: z.string(), absent: z.literal(true) }).strict(),
  z.object({ field: z.string(), greater_than: z.number() }).strict(),
  z.object({ field: z.string(), less_than: z.number() }).strict()
]);

// --- Lookup steps ---
const lookupInTableStep = z
  .object({
    lookup_in_table: z
      .object({
        table: z.string(),
        key_from_field: z.string().optional(),
        key_from_static: z.string().optional(),
        match: matchSpec,
        /** output_field_name -> table_column_name */
        assign: z.record(z.string(), z.string())
      })
      .strict()
      .refine(
        (s) => (s.key_from_field === undefined) !== (s.key_from_static === undefined),
        { message: 'Exactly one of key_from_field / key_from_static is required' }
      )
  })
  .strict();

const lookupInMatrixStep = z
  .object({
    lookup_in_matrix: z
      .object({
        matrix: z.string(),
        row_from_field: z.string().optional(),
        row_from_static: z.string().optional(),
        col_from_field: z.string().optional(),
        col_from_static: z.string().optional(),
        match: matchSpec.optional(),
        row_match: matchSpec.optional(),
        col_match: matchSpec.optional(),
        into_field: z.string()
      })
      .strict()
      .refine(
        (s) => (s.row_from_field === undefined) !== (s.row_from_static === undefined),
        { message: 'Exactly one of row_from_field / row_from_static is required' }
      )
      .refine(
        (s) => (s.col_from_field === undefined) !== (s.col_from_static === undefined),
        { message: 'Exactly one of col_from_field / col_from_static is required' }
      )
      .refine(
        (s) => s.match !== undefined || (s.row_match !== undefined && s.col_match !== undefined),
        { message: 'Provide `match` for both axes, or `row_match` and `col_match` explicitly' }
      )
  })
  .strict();

// --- set step ---
const setStep = z
  .object({
    set: z.record(z.string(), scalarValue)
  })
  .strict();

// --- error_if step ---
// Pushes a structured error onto row.errors when the condition matches.
// `message` is a template that may reference row fields plus the engine's
// pseudo-fields (_class, _has_errors, _errors, _error_count).
const errorIfStep = z
  .object({
    error_if: z
      .object({
        condition: condition,
        message: z.string(),
        /** Optional field name attached to the RowError for diagnostics. */
        field: z.string().optional()
      })
      .strict()
  })
  .strict();

// --- Recursive shapes (when, emit_row) ---
// We need a recursive type for steps. z.lazy + explicit type annotation.

export type Step =
  | { lookup_in_table: LookupInTableStepBody }
  | { lookup_in_matrix: LookupInMatrixStepBody }
  | { set: Record<string, z.infer<typeof scalarValue>> }
  | { when: { condition: z.infer<typeof condition>; do: Step[] } }
  | { emit_row: { condition?: z.infer<typeof condition>; row: { steps: Step[] } } }
  | { error_if: { condition: z.infer<typeof condition>; message: string; field?: string } };

type LookupInTableStepBody = z.infer<typeof lookupInTableStep>['lookup_in_table'];
type LookupInMatrixStepBody = z.infer<typeof lookupInMatrixStep>['lookup_in_matrix'];

const stepSchema: z.ZodType<Step> = z.lazy(() =>
  z.union([lookupInTableStep, lookupInMatrixStep, setStep, whenStep, emitRowStep, errorIfStep])
);

const whenStep = z
  .object({
    when: z
      .object({
        condition,
        do: z.array(stepSchema)
      })
      .strict()
  })
  .strict();

const emitRowStep = z
  .object({
    emit_row: z
      .object({
        condition: condition.optional(),
        row: z.object({ steps: z.array(stepSchema) }).strict()
      })
      .strict()
  })
  .strict();

const classPipeline = z
  .object({
    steps: z.array(stepSchema).default([])
  })
  .strict();

export const pipelineFileSchema = z.object({
  pipeline: z.record(z.string(), classPipeline).default({})
});

export type Condition = z.infer<typeof condition>;
export type MatchSpec = z.infer<typeof matchSpec>;

// §8 — to be implemented
export const registriesFileSchema = z.object({
  registries: z.record(z.string(), z.array(z.string())).default({})
});

// §7/§10 — Validation (separate layer; class-agnostic by default).
//   condition:        Same Condition / composite shape as §5/§9 filters.
//   message:          Template; references row fields and pseudo-fields.
//   field:            Optional — attached to RowError for diagnostics.
//   applies_to:       Optional list of class IDs the rule applies to.
//                     Default: all classes (including _unclassified).
//   exclude_classes:  Optional list of class IDs to skip.
type ValidationFilter =
  | Condition
  | { any_of: ValidationFilter[] }
  | { all_of: ValidationFilter[] };

const validationFilter: z.ZodType<ValidationFilter> = z.lazy(() =>
  z.union([
    condition,
    z.object({ any_of: z.array(validationFilter) }).strict(),
    z.object({ all_of: z.array(validationFilter) }).strict()
  ])
);

const validationRule = z
  .object({
    condition: validationFilter,
    message: z.string(),
    field: z.string().optional(),
    applies_to: z.array(z.string()).optional(),
    exclude_classes: z.array(z.string()).optional()
  })
  .strict();

export const validationFileSchema = z.object({
  validation: z
    .object({
      rules: z.array(validationRule).default([])
    })
    .default({ rules: [] })
});

export type ValidationRule = z.infer<typeof validationRule>;
export type { ValidationFilter };

// §9 — Ausgabe-Mapping
//
// Eine Export-Konfiguration definiert eine Liste von Outputs (Buckets).
// Jede ProcessedRow wird beim ersten matchenden Filter genau einem Output
// zugeordnet (first-match-wins). Ein Output ohne Filter ist der Auffang.
//
// Filter-Bedingungen verwenden dieselben Felder wie der Pipeline-`when`-
// Schritt plus zwei Pseudo-Felder, die vom Exporter eingespielt werden:
//   _class        — der ClassKey der Row (oder "_unclassified" für
//                    Rohzeilen, die keine Klassifikation gefunden haben)
//   _has_errors   — true, wenn ProcessedRow.errors nicht leer ist

const columnFormat = z.enum([
  'date_ddmmyyyy',
  'number_two_decimals',
  'number_no_decimals',
  'uppercase',
  'lowercase',
  'trim'
]);

const exportColumn = z
  .object({
    header: z.string(),
    from_field: z.string(),
    format: columnFormat.optional()
  })
  .strict();

// Filter: single Condition (gleiche Form wie pipeline §5) ODER Composite
// (any_of / all_of). Recursion via z.lazy für verschachtelte Komposite.
type ExportFilter =
  | Condition
  | { any_of: ExportFilter[] }
  | { all_of: ExportFilter[] };

const exportFilter: z.ZodType<ExportFilter> = z.lazy(() =>
  z.union([
    condition,
    z.object({ any_of: z.array(exportFilter) }).strict(),
    z.object({ all_of: z.array(exportFilter) }).strict()
  ])
);

const exportOutput = z
  .object({
    /** Dateinamen-Suffix für diesen Bucket (z.B. "_erfolgreich"). Erforderlich
     *  bei mehreren Outputs. Bei genau einem Output kann er entfallen — der
     *  Output landet dann direkt unter dem vom Aufrufer gewählten Pfad. */
    name: z.string().optional(),
    filter: exportFilter.optional(),
    columns: z.array(exportColumn).default([])
  })
  .strict();

/**
 * Ein Export-Profil bündelt ein vollständiges Ausgabeziel: Format,
 * Spaltenlayout, optionale Sub-Outputs mit Filtern. Mehrere Profile in
 * derselben Konfig erlauben es, in einem Lauf z.B. Excel UND JSON zu
 * erzeugen. Der Aufrufer (UI/CLI) wählt, welche Profile ausgeführt werden.
 */
const exportProfile = z
  .object({
    description: z.string().optional(),
    format: z.enum(['xlsx', 'csv', 'json']).default('xlsx'),
    outputs: z.array(exportOutput).default([{ columns: [] }])
  })
  .strict();

export const exportFileSchema = z.object({
  export_profiles: z.record(z.string(), exportProfile).default({})
});

export type ExportColumn = z.infer<typeof exportColumn>;
export type ColumnFormat = z.infer<typeof columnFormat>;
export type ExportOutput = z.infer<typeof exportOutput>;
export type ExportProfile = z.infer<typeof exportProfile>;
export type { ExportFilter };

export const appConfigSchema = z.object({
  classes: classesFileSchema.shape.classes,
  extraction: extractionFileSchema.shape.extraction,
  tables: tablesFileSchema.shape.tables,
  matrices: matricesFileSchema.shape.matrices,
  pipeline: pipelineFileSchema.shape.pipeline,
  registries: registriesFileSchema.shape.registries,
  validation: validationFileSchema.shape.validation,
  export_profiles: exportFileSchema.shape.export_profiles
});

export type AppConfig = z.infer<typeof appConfigSchema>;
