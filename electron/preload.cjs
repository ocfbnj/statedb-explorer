// ============================================================
// StateDB Explorer — preload
// 通过 contextBridge 暴露安全的 IPC 接口给渲染进程
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
});
