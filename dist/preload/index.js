let electron = require("electron");
//#region src/preload/index.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	startProcessing: (request) => electron.ipcRenderer.invoke("start-processing", request),
	getInputFileStatus: () => electron.ipcRenderer.invoke("get-input-file-status"),
	onProgress: (callback) => {
		const handler = (_event, progress) => callback(progress);
		electron.ipcRenderer.on("processing-progress", handler);
		return () => electron.ipcRenderer.removeListener("processing-progress", handler);
	},
	onResult: (callback) => {
		const handler = (_event, result) => callback(result);
		electron.ipcRenderer.on("processing-result", handler);
		return () => electron.ipcRenderer.removeListener("processing-result", handler);
	}
});
//#endregion
