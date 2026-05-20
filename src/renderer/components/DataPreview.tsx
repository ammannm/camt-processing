import React from 'react';

interface ProcessingSummary {
  filesProcessed: number;
  transactionsParsed: number;
  transactionsMapped: number;
  transactionsExported: number;
  errors: number;
}

interface DataPreviewProps {
  summary: ProcessingSummary | null;
}

export const DataPreview: React.FC<DataPreviewProps> = ({ summary }) => {
  if (!summary) return null;

  return (
    <div className="data-preview">
      <h3>Ergebnis</h3>
      <table>
        <tbody>
          <tr><td>Dateien verarbeitet:</td><td>{summary.filesProcessed}</td></tr>
          <tr><td>Transaktionen eingelesen:</td><td>{summary.transactionsParsed}</td></tr>
          <tr><td>Transaktionen gemappt:</td><td>{summary.transactionsMapped}</td></tr>
          <tr><td>Exportierte Zeilen:</td><td>{summary.transactionsExported}</td></tr>
          <tr><td>Fehler:</td><td>{summary.errors}</td></tr>
        </tbody>
      </table>
    </div>
  );
};
