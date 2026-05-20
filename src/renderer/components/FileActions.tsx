import React from 'react';

interface FileActionsProps {
  onStart: () => void;
  onRefresh: () => void;
  isRunning: boolean;
  isRefreshing: boolean;
  processed: number;
  total: number;
  availableFiles: number;
  inputFolder?: string;
  lastChecked?: string;
  currentFile?: string;
}

export const FileActions: React.FC<FileActionsProps> = ({
  onStart,
  onRefresh,
  isRunning,
  isRefreshing,
  processed,
  total,
  availableFiles,
  inputFolder,
  lastChecked,
  currentFile
}) => (
  <div className="file-actions">
    <div className="action-row">
      <button onClick={onStart} disabled={isRunning || availableFiles === 0}>
        {isRunning ? 'Verarbeitung läuft...' : 'Start'}
      </button>
      <button className="secondary-btn" onClick={onRefresh} disabled={isRunning || isRefreshing}>
        {isRefreshing ? 'Suche...' : 'Neu laden'}
      </button>
    </div>
    <div className="input-status">
      <strong>{availableFiles}</strong> XML-Dateien im Eingangsordner
      {lastChecked && <span>Stand: {lastChecked}</span>}
    </div>
    {inputFolder && <p className="folder-path">{inputFolder}</p>}
    {currentFile && <p className="current-file">Aktuelle Datei: {currentFile}</p>}
    <p className="progress-text">Verarbeitete Dateien: {processed} / {total}</p>
  </div>
);
