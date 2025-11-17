import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  scanFolder: () => electronAPI.ipcRenderer.invoke('scan-folder'),
  fetchThumbnail: (filepath, output_dir) => electronAPI.ipcRenderer.invoke('fetch-thumbnail', filepath, output_dir),
  indexVideo: (apiKey, filepath) => electronAPI.ipcRenderer.invoke('index-video', apiKey, filepath),
  getVideoContent: (apiKey, hash) => electronAPI.ipcRenderer.invoke('get-video-content', apiKey, hash),
  getVideoHash: (filepath) => electronAPI.ipcRenderer.invoke('get-video-hash', filepath),
  getVideoGist: (apiKey, videoId, indexId) => electronAPI.ipcRenderer.invoke('get-video-gist', apiKey, videoId, indexId),
  promptStrandsAgent: (prompt, twelveLabsApiKey, slack_bot_token, slack_app_token, chat_history, videoId) => electronAPI.ipcRenderer.invoke('prompt-strands-agent', prompt, twelveLabsApiKey, slack_bot_token, slack_app_token, chat_history, videoId),
  promptStrandsAgentComplete: (callback) => electronAPI.ipcRenderer.on('prompt-strands-agent-complete', (event) => {
    callback()
  }),
  promptStrandsAgentError: (callback) => electronAPI.ipcRenderer.on('prompt-strands-agent-error', (event, errorMsg) => {
    callback(errorMsg)
  }),
  promptStrandsAgentResponse: (callback) => electronAPI.ipcRenderer.on('prompt-strands-agent-response', (event, chunk) => {
    callback(chunk)
  }),
  uploadVideo: (filePath, targetFileName) => electronAPI.ipcRenderer.invoke('upload-video', filePath, targetFileName),
  showOpenDialog: (options) => electronAPI.ipcRenderer.invoke('show-open-dialog', options),
  deleteVideo: (apiKey, filePath) => electronAPI.ipcRenderer.invoke('delete-video', apiKey, filePath),
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
