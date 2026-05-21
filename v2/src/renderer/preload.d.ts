import type {
  ConfigFileId,
  EditableMatrix,
  EditableTable,
  ExportPreviewedRequest,
  LoadConfigFileResponse,
  LoadEditableResponse,
  PreviewResponse,
  ProfileInfo,
  RunRequest,
  RunResponse,
  SaveConfigFileRequest,
  SaveResponse
} from '../shared/ipc-contract';

declare global {
  interface Window {
    api: {
      chooseInputFile: () => Promise<string | null>;
      chooseOutputFile: () => Promise<string | null>;
      listProfiles: () => Promise<ProfileInfo[]>;
      previewRun: (inputFilePath: string) => Promise<PreviewResponse>;
      runPipeline: (req: RunRequest) => Promise<RunResponse>;
      exportPreviewedRows: (req: ExportPreviewedRequest) => Promise<RunResponse>;
      loadTables: () => Promise<LoadEditableResponse<EditableTable>>;
      saveTables: (data: Record<string, EditableTable>) => Promise<SaveResponse>;
      loadMatrices: () => Promise<LoadEditableResponse<EditableMatrix>>;
      saveMatrices: (data: Record<string, EditableMatrix>) => Promise<SaveResponse>;
      loadConfigFile: (id: ConfigFileId) => Promise<LoadConfigFileResponse>;
      saveConfigFile: (req: SaveConfigFileRequest) => Promise<SaveResponse>;
    };
  }
}

export {};
