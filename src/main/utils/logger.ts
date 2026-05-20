import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs';
import os from 'os';

const APP_NAME = 'hockey-finance-app';
const LOG_FILE_NAME = 'app.log';
const LOG_MAX_BYTES = 1 * 1024 * 1024; // 1 MB pro Datei (identisch zu Python)
const LOG_BACKUP_COUNT = 30; // 30 Backups (identisch zu Python)

function getLogDirCandidates(): string[] {
  const candidates: string[] = [];

  // Primär: neben EXE / Script (im Development der Projektroot)
  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean };
  if (process.env.NODE_ENV === 'development' || electronProcess.defaultApp) {
    if (path.basename(process.cwd()) === 'Electron') {
      candidates.push(path.join(path.dirname(process.cwd()), 'logs'));
    } else {
      candidates.push(path.join(process.cwd(), 'logs'));
    }
  } else {
    candidates.push(path.join(path.dirname(process.execPath), 'logs'));
  }

  // Fallbacks je Plattform (identisch zu Python)
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(path.join(localAppData, APP_NAME, 'logs'));
    } else {
      candidates.push(path.join(os.homedir(), 'AppData', 'Local', APP_NAME, 'logs'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', APP_NAME, 'logs'));
  } else {
    candidates.push(path.join(os.homedir(), '.local', 'share', APP_NAME, 'logs'));
  }

  // Letzter Fallback: temp
  candidates.push(path.join(os.tmpdir(), APP_NAME, 'logs'));

  return candidates;
}

function resolveLogFile(): string {
  for (const logDir of getLogDirCandidates()) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const testFile = path.join(logDir, '.write_test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      return path.join(logDir, LOG_FILE_NAME);
    } catch {
      continue;
    }
  }

  // Sollte praktisch nie auftreten, aber bleibt defensiv
  const fallback = path.join(os.tmpdir(), APP_NAME, 'logs');
  fs.mkdirSync(fallback, { recursive: true });
  return path.join(fallback, LOG_FILE_NAME);
}

const logFilePath = resolveLogFile();

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    // Format identisch zu Python: "2024-01-01 12:00:00 | INFO | name | message"
    format.printf(({ timestamp, level, name, message }) =>
      `${timestamp} | ${level.toUpperCase()} | ${name || ''} | ${message}`
    )
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: logFilePath,
      maxsize: LOG_MAX_BYTES,
      maxFiles: LOG_BACKUP_COUNT,
      encoding: 'utf-8'
    })
  ]
});

logger.info(`Logging initialisiert. Log-Datei: ${logFilePath}`);
logger.info(`Log-Rotation aktiv: maxBytes=${LOG_MAX_BYTES}, backupCount=${LOG_BACKUP_COUNT}`);
