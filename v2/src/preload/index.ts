import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ConfigFileId,
  type EditableMatrix,
  type EditableTable,
  type ExportPreviewedRequest,
  type LoadConfigFileResponse,
  type LoadEditableResponse,
  type PreviewResponse,
  type ProfileInfo,
  type RunRequest,
  type RunResponse,
  type SaveConfigFileRequest,
  type SaveResponse
} from '../shared/ipc-contract';

contextBridge.exposeInMainWorld('api', {
  chooseInputFile: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.chooseInputFile),
  chooseOutputFile: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.chooseOutputFile),
  listProfiles: (): Promise<ProfileInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.listProfiles),
  previewRun: (inputFilePath: string): Promise<PreviewResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.previewRun, inputFilePath),
  runPipeline: (req: RunRequest): Promise<RunResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.runPipeline, req),
  loadTables: (): Promise<LoadEditableResponse<EditableTable>> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadTables),
  saveTables: (data: Record<string, EditableTable>): Promise<SaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveTables, data),
  loadMatrices: (): Promise<LoadEditableResponse<EditableMatrix>> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadMatrices),
  saveMatrices: (data: Record<string, EditableMatrix>): Promise<SaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveMatrices, data),
  loadConfigFile: (id: ConfigFileId): Promise<LoadConfigFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadConfigFile, id),
  saveConfigFile: (req: SaveConfigFileRequest): Promise<SaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveConfigFile, req),
  exportPreviewedRows: (req: ExportPreviewedRequest): Promise<RunResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportPreviewedRows, req)
});
