import { contextBridge, ipcRenderer } from 'electron';
import { StartProcessingRequest, ProcessingProgress, ProcessingResult, InputFileStatus } from '../shared/ipc-contract';

const electronAPI = {
  startProcessing: (request: StartProcessingRequest) =>
    ipcRenderer.invoke('start-processing', request),

  getInputFileStatus: (): Promise<InputFileStatus> =>
    ipcRenderer.invoke('get-input-file-status'),

  onProgress: (callback: (progress: ProcessingProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ProcessingProgress) => callback(progress);
    ipcRenderer.on('processing-progress', handler);
    return () => ipcRenderer.removeListener('processing-progress', handler);
  },

  onResult: (callback: (result: ProcessingResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ProcessingResult) => callback(result);
    ipcRenderer.on('processing-result', handler);
    return () => ipcRenderer.removeListener('processing-result', handler);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
