import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  scanFolder: () => electronAPI.ipcRenderer.invoke('scan-folder'),
  fetchThumbnail: (filepath, output_dir) => electronAPI.ipcRenderer.invoke('fetch-thumbnail', filepath, output_dir),
  indexVideo: (apiKey, filepath) => electronAPI.ipcRenderer.invoke('index-video', apiKey, filepath),
  getVideoContent: (hash) => electronAPI.ipcRenderer.invoke('get-video-content', hash)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
