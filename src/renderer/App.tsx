import React, { useEffect, useState } from 'react';
import './App.css';
import { FileActions } from './components/FileActions';
import { DataPreview } from './components/DataPreview';
import { ErrorBox } from './components/ErrorBox';

interface ProcessingSummary {
  filesProcessed: number;
  transactionsParsed: number;
  transactionsMapped: number;
  transactionsExported: number;
  errors: number;
}

interface InputFileState {
  inputFolder: string;
  xmlFileCount: number;
  checkedAt: string;
}

const App: React.FC = () => {
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Bereit.');
  const [summary, setSummary] = useState<ProcessingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputFiles, setInputFiles] = useState<InputFileState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshInputFiles = async (updateStatus = true) => {
    setIsRefreshing(true);
    try {
      const fileStatus = await window.electronAPI.getInputFileStatus();
      setInputFiles({
        inputFolder: fileStatus.inputFolder,
        xmlFileCount: fileStatus.xmlFileCount,
        checkedAt: new Date(fileStatus.checkedAt).toLocaleTimeString('de-CH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      });
      if (updateStatus && !isRunning) {
        setStatus(fileStatus.xmlFileCount > 0 ? 'Bereit zur Verarbeitung.' : 'Keine XML-Dateien im Eingangsordner.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cleanupProgress = window.electronAPI.onProgress((p) => {
      setProcessed(p.processed);
      setTotal(p.total);
      setCurrentFile(p.currentFile || '');
      setIsRunning(true);
    });
    const cleanupResult = window.electronAPI.onResult((res) => {
      setIsRunning(false);
      if (res.success) {
        setStatus('Verarbeitung abgeschlossen.');
        setSummary(res.summary || null);
        setError(null);
      } else {
        setStatus('Fehler aufgetreten.');
        setError(res.message || 'Unbekannter Fehler');
      }
    });

    return () => {
      cleanupProgress();
      cleanupResult();
    };
  }, []);

  useEffect(() => {
    refreshInputFiles();
    const intervalId = window.setInterval(() => {
      if (!isRunning) {
        refreshInputFiles();
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  const start = () => {
    setStatus('Verarbeitung läuft…');
    setProcessed(0);
    setTotal(0);
    setCurrentFile('');
    setSummary(null);
    setError(null);
    setIsRunning(true);
    window.electronAPI.startProcessing({}).finally(() => {
      refreshInputFiles(false);
    });
  };

  return (
    <div className="app">
      <h1>Hockey Buchungsdaten</h1>
      <p className="status">{status}</p>
      <FileActions
        onStart={start}
        onRefresh={refreshInputFiles}
        isRunning={isRunning}
        isRefreshing={isRefreshing}
        processed={processed}
        total={total}
        availableFiles={inputFiles?.xmlFileCount ?? 0}
        inputFolder={inputFiles?.inputFolder}
        lastChecked={inputFiles?.checkedAt}
        currentFile={currentFile}
      />
      {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}
      <DataPreview summary={summary} />
    </div>
  );
};

export default App;
