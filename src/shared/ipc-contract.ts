// IPC contract definitions
export interface StartProcessingRequest {
  inputFolder?: string;    // optionaler Pfad zum XML-Input-Ordner
  templatePath?: string;   // optionaler Pfad zum Excel-Template
  outputFolder?: string;   // optionaler Pfad zum Ausgabe-Ordner
}
export interface ProcessingProgress {
  processed: number;
  total: number;
  currentFile?: string;
}
export interface ProcessingResult {
  success: boolean;
  message?: string;
  outputFiles?: string[];
  summary?: {
    filesProcessed: number;
    transactionsParsed: number;
    transactionsMapped: number;
    transactionsExported: number;
    errors: number;
  };
}

export interface InputFileStatus {
  inputFolder: string;
  xmlFileCount: number;
  xmlFiles: string[];
  checkedAt: string;
}
