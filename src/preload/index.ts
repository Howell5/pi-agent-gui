import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, AppSnapshot } from '../shared/types'

const api: AppApi = {
  getSnapshot: () => ipcRenderer.invoke('app:getSnapshot'),
  openProject: () => ipcRenderer.invoke('app:openProject'),
  selectProject: (projectId) => ipcRenderer.invoke('app:selectProject', projectId),
  pickFile: (projectId) => ipcRenderer.invoke('app:pickFile', projectId),
  createTask: (input) => ipcRenderer.invoke('app:createTask', input),
  updateTaskSettings: (input) => ipcRenderer.invoke('app:updateTaskSettings', input),
  sendMessage: (input) => ipcRenderer.invoke('app:sendMessage', input),
  stopTask: (taskId) => ipcRenderer.invoke('app:stopTask', taskId),
  respondPermission: (input) => ipcRenderer.invoke('app:respondPermission', input),
  saveBuiltinProviderToken: (providerId, token) => ipcRenderer.invoke('app:saveBuiltinProviderToken', providerId, token),
  testProvider: (providerId) => ipcRenderer.invoke('app:testProvider', providerId),
  saveCustomProvider: (input) => ipcRenderer.invoke('app:saveCustomProvider', input),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AppSnapshot) => callback(value)
    ipcRenderer.on('app:snapshot', listener)
    return () => ipcRenderer.removeListener('app:snapshot', listener)
  },
}

contextBridge.exposeInMainWorld('appApi', api)
