/**
 * IPC contract between renderer and main process. Kept intentionally
 * minimal — UI triggers a run and gets a summary back.
 */

export interface RunRequest {
  inputFilePath: string;
  outputFilePath: string;
  /** Profile names to export. Empty/omitted = all configured profiles. */
  profiles?: string[];
}

export interface RunSummary {
  /** Total number of ProcessedRows written across all profiles/buckets. */
  exportedRows: number;
  /** Number of input rows that no classification rule matched. */
  unclassifiedRows: number;
  /** Per-output-file summary. */
  outputs: Array<{ profile: string; bucket: string; rowCount: number; filePath?: string }>;
}

export interface RunResponse {
  ok: boolean;
  summary?: RunSummary;
  error?: string;
}

export interface ProfileInfo {
  name: string;
  description?: string;
  format: 'xlsx' | 'csv' | 'json';
}

/**
 * Slim per-row payload sent to the renderer for preview. Excludes the
 * raw parsed XML node (which is significant in size) but keeps the
 * conventional source fields needed for context display.
 */
export interface PreviewRow {
  classKey: string;
  fields: Record<string, unknown>;
  sourceFields: Record<string, unknown>;
  errors: { field?: string; message: string }[];
}

export interface PreviewSummary {
  total: number;
  withErrors: number;
  byClass: Record<string, number>;
}

export interface PreviewResponse {
  ok: boolean;
  rows?: PreviewRow[];
  summary?: PreviewSummary;
  error?: string;
}

// ---------- editor (tables + matrices) ----------

/** Raw editable shape — all values are strings as edited in inputs. */
export interface EditableTable {
  columns: string[];
  rows: Record<string, Record<string, string | number | boolean>>;
}
export interface EditableMatrix {
  row_label?: string;
  col_label?: string;
  cells: Record<string, Record<string, string | number | boolean>>;
}

export interface LoadEditableResponse<T> {
  ok: boolean;
  data?: Record<string, T>;
  error?: string;
}

export interface SaveResponse {
  ok: boolean;
  /** Resolved path of the written file (when ok). */
  filePath?: string;
  /** Human-readable error message (when not ok). */
  error?: string;
}

// ---------- universal config editor ----------

export type ConfigFileId =
  | 'classes'
  | 'extraction'
  | 'tables'
  | 'matrices'
  | 'pipeline'
  | 'registries'
  | 'validation'
  | 'export';

export interface LoadConfigFileResponse {
  ok: boolean;
  /** YAML text. Empty string when the file does not exist on disk. */
  content?: string;
  error?: string;
}

export interface SaveConfigFileRequest {
  id: ConfigFileId;
  content: string;
}

// ---------- export of previewed (and possibly user-edited) rows ----------

export interface ExportPreviewedRequest {
  rows: PreviewRow[];
  outputFilePath: string;
  profiles?: string[];
}

export const IPC_CHANNELS = {
  chooseInputFile: 'dialog:chooseInputFile',
  chooseOutputFile: 'dialog:chooseOutputFile',
  listProfiles: 'config:listProfiles',
  previewRun: 'pipeline:preview',
  runPipeline: 'pipeline:run',
  exportPreviewedRows: 'pipeline:exportPreviewed',
  loadTables: 'editor:loadTables',
  saveTables: 'editor:saveTables',
  loadMatrices: 'editor:loadMatrices',
  saveMatrices: 'editor:saveMatrices',
  loadConfigFile: 'editor:loadConfigFile',
  saveConfigFile: 'editor:saveConfigFile'
} as const;
