import path from 'path';
import fs from 'fs';

export const OUTPUT_FOLDER = 'ausgabe';
export const FILE_FOLDER = 'bankdateien';
export const MAPPING_EXCEL_FOLDER = 'excel';
export const TEMPLATE_FILE_NAME = 'template.xlsx';
export const PROCESSED_INPUT_SUBFOLDER = 'verarbeitet';
export const FAILED_INPUT_SUBFOLDER = 'fehlerhaft';

function getAppRoot(): string {
  // Basisverzeichnis für Ressourcen: im Development der Projektroot, paketiert neben der EXE.
  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean };
  if (process.env.NODE_ENV === 'development' || electronProcess.defaultApp) {
    if (path.basename(process.cwd()) === 'Electron') {
      return path.dirname(process.cwd());
    }
    return process.cwd();
  }

  return path.dirname(process.execPath);
}

export function getReadPath(directory: string, filename: string): string {
  // Pfad zu einer Ressource innerhalb des Programms.
  const appRoot = getAppRoot();
  const externalCandidate = path.join(appRoot, directory, filename);
  if (fs.existsSync(externalCandidate)) {
    return externalCandidate;
  }
  return path.join(appRoot, directory, filename);
}

export function getWritePath(directory: string, filename: string): string {
  // Pfad für Dateien, die geschrieben werden sollen. Verzeichnis wird automatisch erstellt.
  const targetDir = path.join(getAppRoot(), directory);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return path.join(targetDir, filename);
}

export function getAppDir(): string {
  // Liefert das Verzeichnis der laufenden App oder des Entwicklungs-Projektroots.
  return getAppRoot();
}

export function getAppDirPath(directory: string, filename?: string): string {
  // Pfad relativ zum App-Verzeichnis erzeugen.
  const basePath = path.join(getAppRoot(), directory);
  return filename ? path.join(basePath, filename) : basePath;
}

export function ensureAppDir(directory: string): string {
  // Prüft, ob ein Verzeichnis neben der App existiert. Falls nicht, wird es erstellt.
  const targetPath = path.join(getAppRoot(), directory);
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  return targetPath;
}
