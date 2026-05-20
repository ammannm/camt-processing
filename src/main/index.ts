import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger';
import { MainLogic, ProcessingProgress, ProcessingSummary } from './services/main-logic';
import { InputFileStatus, StartProcessingRequest } from '../shared/ipc-contract';
import { ensureAppDir, OUTPUT_FOLDER, FILE_FOLDER, MAPPING_EXCEL_FOLDER, getAppDirPath } from './utils/path-helper';

let mainWindow: BrowserWindow | null = null;
let mainLogic: MainLogic | null = null;

async function getInputFileStatus(): Promise<InputFileStatus> {
  const inputFolder = ensureAppDir(FILE_FOLDER);
  const entries = await fs.promises.readdir(inputFolder, { withFileTypes: true });
  const xmlFiles = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.xml')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    inputFolder: getAppDirPath(FILE_FOLDER),
    xmlFileCount: xmlFiles.length,
    xmlFiles,
    checkedAt: new Date().toISOString()
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  if (process.env.NODE_ENV !== 'development') {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
          ]
        }
      });
    });
  }

  ensureAppDir(OUTPUT_FOLDER);
  ensureAppDir(FILE_FOLDER);
  ensureAppDir(MAPPING_EXCEL_FOLDER);

  mainLogic = new MainLogic();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-input-file-status', async () => getInputFileStatus());

ipcMain.handle('start-processing', async (_event, request: StartProcessingRequest) => {
  if (!mainLogic) {
    return { success: false, message: 'MainLogic nicht initialisiert.' };
  }

  try {
    const summary = await mainLogic.process((progress: ProcessingProgress) => {
      mainWindow?.webContents.send('processing-progress', {
        processed: progress.filesHandled,
        total: progress.filesTotal,
        currentFile: progress.message
      });
    });

    const result = {
      success: !summary.hadError,
      message: summary.statusMessage,
      summary: {
        filesProcessed: summary.inputProcessedFiles,
        transactionsParsed: summary.transactionsTotal,
        transactionsMapped: summary.transactionsParsedSuccess,
        transactionsExported: summary.bookingRowsSuccess,
        errors: summary.inputFailedFiles + summary.bookingRowsFailed
      },
      outputFiles: summary.outputFiles
    };

    mainWindow?.webContents.send('processing-result', result);
    return result;
  } catch (e) {
    logger.error(`Processing failed: ${e}`);
    const errorResult = { success: false, message: String(e) };
    mainWindow?.webContents.send('processing-result', errorResult);
    return errorResult;
  }
});
