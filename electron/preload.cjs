// ============================================================
// StateDB Explorer — preload
// Expose a safe IPC interface to the renderer process via contextBridge.
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stateDB', {
  init: () => ipcRenderer.invoke('db:init'),
  autoload: () => ipcRenderer.invoke('db:autoload'),
  pick: () => ipcRenderer.invoke('db:pick'),
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  queryOne: (sql, params) => ipcRenderer.invoke('db:queryOne', sql, params),
  exec: (sql) => ipcRenderer.invoke('db:exec', sql),
  reload: () => ipcRenderer.invoke('db:reload'),
  meta: () => ipcRenderer.invoke('db:meta'),
  listApiCalls: (sessionId) => ipcRenderer.invoke('api:listApiCalls', sessionId),
  getApiCallPayload: (apiRequestId) => ipcRenderer.invoke('api:getApiCallPayload', apiRequestId),
  hookAvailable: () => ipcRenderer.invoke('api:hookAvailable'),
});
