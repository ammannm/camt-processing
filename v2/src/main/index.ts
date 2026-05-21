import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../engine/config/loader';
import { readCamt053 } from '../engine/io/camt-reader';
import { processRows } from '../engine/pipeline';
import { exportRows } from '../engine/export/exporter';
import {
  IPC_CHANNELS,
  type ConfigFileId,
  type EditableMatrix,
  type EditableTable,
  type ExportPreviewedRequest,
  type LoadConfigFileResponse,
  type LoadEditableResponse,
  type PreviewResponse,
  type PreviewRow,
  type ProfileInfo,
  type RunRequest,
  type RunResponse,
  type SaveConfigFileRequest,
  type SaveResponse
} from '../shared/ipc-contract';
import {
  buildMatricesYaml,
  buildTablesYaml,
  readConfigFile,
  saveConfigFile,
  writeConfigFile,
  SaveError
} from '../engine/editor/yaml-saver';
import { asClassKey, type ProcessedRow } from '../shared/types';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Fail-fast: validate the config at startup. If something's wrong, the
  // engine wouldn't run anyway — better to surface it now than mid-click.
  const configDir = path.join(process.cwd(), 'config');
  loadConfig(configDir);

  ipcMain.handle(IPC_CHANNELS.chooseInputFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CAMT.053 XML', extensions: ['xml'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.chooseOutputFile, async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'output.xlsx',
      filters: [
        { name: 'Excel', extensions: ['xlsx'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.previewRun, async (_e, inputFilePath: string): Promise<PreviewResponse> => {
    try {
      const config = loadConfig(configDir);
      const xml = fs.readFileSync(inputFilePath, 'utf-8');
      const { rows } = readCamt053(xml, path.basename(inputFilePath));
      const result = processRows(rows, config);

      // Slim each row for transport: drop the raw XML AST, keep only the
      // primitive source fields the UI might display (booking_date,
      // source_text, etc.).
      const previewRows = result.rows.map((r) => ({
        classKey: String(r.classKey),
        fields: r.fields,
        sourceFields: r.source.fields,
        errors: r.errors.map((e) => ({ field: e.field, message: e.message }))
      }));

      const byClass: Record<string, number> = {};
      for (const r of result.rows) {
        const k = String(r.classKey);
        byClass[k] = (byClass[k] ?? 0) + 1;
      }
      return {
        ok: true,
        rows: previewRows,
        summary: {
          total: result.rows.length,
          withErrors: result.rows.filter((r) => r.errors.length > 0).length,
          byClass
        }
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listProfiles, async (): Promise<ProfileInfo[]> => {
    const config = loadConfig(configDir);
    return Object.entries(config.export_profiles).map(([name, profile]) => ({
      name,
      description: profile.description,
      format: profile.format
    }));
  });

  ipcMain.handle(IPC_CHANNELS.loadTables, async (): Promise<LoadEditableResponse<EditableTable>> => {
    try {
      const config = loadConfig(configDir);
      // The Zod-parsed shape already matches EditableTable closely; explicit
      // copy keeps the renderer-facing type stable even if engine internals
      // grow extra fields later.
      const data: Record<string, EditableTable> = {};
      for (const [name, t] of Object.entries(config.tables)) {
        data[name] = { columns: t.columns, rows: t.rows };
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.saveTables, async (_e, raw: Record<string, EditableTable>): Promise<SaveResponse> => {
    try {
      const { yaml } = buildTablesYaml(raw);
      const filePath = writeConfigFile(configDir, 'tables.yaml', yaml);
      return { ok: true, filePath };
    } catch (err) {
      if (err instanceof SaveError) return { ok: false, error: err.message };
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.loadMatrices, async (): Promise<LoadEditableResponse<EditableMatrix>> => {
    try {
      const config = loadConfig(configDir);
      const data: Record<string, EditableMatrix> = {};
      for (const [name, m] of Object.entries(config.matrices)) {
        data[name] = { row_label: m.row_label, col_label: m.col_label, cells: m.cells };
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.saveMatrices, async (_e, raw: Record<string, EditableMatrix>): Promise<SaveResponse> => {
    try {
      const { yaml } = buildMatricesYaml(raw);
      const filePath = writeConfigFile(configDir, 'matrices.yaml', yaml);
      return { ok: true, filePath };
    } catch (err) {
      if (err instanceof SaveError) return { ok: false, error: err.message };
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.loadConfigFile, async (_e, id: ConfigFileId): Promise<LoadConfigFileResponse> => {
    try {
      const content = readConfigFile(configDir, id);
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.saveConfigFile, async (_e, req: SaveConfigFileRequest): Promise<SaveResponse> => {
    try {
      const filePath = saveConfigFile(configDir, req.id, req.content);
      return { ok: true, filePath };
    } catch (err) {
      if (err instanceof SaveError) return { ok: false, error: err.message };
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.exportPreviewedRows, async (_e, req: ExportPreviewedRequest): Promise<RunResponse> => {
    try {
      const config = loadConfig(configDir);
      // Reconstruct ProcessedRow shapes from the slim PreviewRow payload.
      // raw is unused by the exporter; source.fields is read for fallback.
      const rows: ProcessedRow[] = req.rows.map((r: PreviewRow) => ({
        classKey: asClassKey(r.classKey),
        fields: r.fields,
        errors: r.errors,
        source: { fields: r.sourceFields }
      }));
      const writeResults = await exportRows(rows, config, req.outputFilePath, {
        profiles: req.profiles
      });
      return {
        ok: true,
        summary: {
          exportedRows: rows.length,
          unclassifiedRows: rows.filter((r) => String(r.classKey) === '_unclassified').length,
          outputs: writeResults.map((w) => ({
            profile: w.profile,
            bucket: w.bucket,
            rowCount: w.rowCount,
            filePath: w.filePath
          }))
        }
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.runPipeline, async (_e, req: RunRequest): Promise<RunResponse> => {
    try {
      const config = loadConfig(configDir);
      const xml = fs.readFileSync(req.inputFilePath, 'utf-8');
      const { rows } = readCamt053(xml, path.basename(req.inputFilePath));
      const result = processRows(rows, config);
      const writeResults = await exportRows(result.rows, config, req.outputFilePath, {
        profiles: req.profiles
      });
      return {
        ok: true,
        summary: {
          exportedRows: result.rows.length,
          unclassifiedRows: result.unclassified.length,
          outputs: writeResults.map((w) => ({
            profile: w.profile,
            bucket: w.bucket,
            rowCount: w.rowCount,
            filePath: w.filePath
          }))
        }
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
