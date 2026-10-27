/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { contextBridge, ipcRenderer } = require('electron');

// Used only by the startup shell (electron/loading.html) to re-trigger a failed load.
contextBridge.exposeInMainWorld('appShell', {
  retry: () => ipcRenderer.invoke('shell:retry-load'),
});

contextBridge.exposeInMainWorld('vault', {
  getName: () => ipcRenderer.invoke('vault:getName'),
  getPath: () => ipcRenderer.invoke('vault:getPath'),
  initialize: (options) => ipcRenderer.invoke('vault:initialize', options),
  readFile: (path) => ipcRenderer.invoke('vault:readFile', path),
  readBinaryFile: (path) => ipcRenderer.invoke('vault:readBinaryFile', path),
  writeFile: (path, content, exclusive) => ipcRenderer.invoke('vault:writeFile', path, content, exclusive),
  writeBinaryFile: (path, content) => ipcRenderer.invoke('vault:writeBinaryFile', path, content),
  deleteFile: (path) => ipcRenderer.invoke('vault:deleteFile', path),
  listFiles: (directoryPath) => ipcRenderer.invoke('vault:listFiles', directoryPath),
  createFullBackup: () => ipcRenderer.invoke('vault:createFullBackup'),
  aiChat: (provider, baseUrl, model, messages, temperature, requestId) => ipcRenderer.invoke('ai:chat', provider, baseUrl, model, messages, temperature, requestId),
  aiChatCancel: (requestId) => ipcRenderer.invoke('ai:chatCancel', requestId),
  listAiModels: (provider, baseUrl) => ipcRenderer.invoke('ai:listModels', provider, baseUrl),
  aiContextLength: (provider, baseUrl, model) => ipcRenderer.invoke('ai:contextLength', provider, baseUrl, model)
});
