import type { StartProcessingRequest, ProcessingProgress, ProcessingResult, InputFileStatus } from '../shared/ipc-contract';

declare global {
  interface Window {
    electronAPI: {
      startProcessing: (request: StartProcessingRequest) => Promise<ProcessingResult>;
      getInputFileStatus: () => Promise<InputFileStatus>;
      onProgress: (callback: (progress: ProcessingProgress) => void) => () => void;
      onResult: (callback: (result: ProcessingResult) => void) => () => void;
    };
  }
}

export {};
