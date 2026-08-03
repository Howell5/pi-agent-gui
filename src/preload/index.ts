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
  retryTask: (taskId) => ipcRenderer.invoke('app:retryTask', taskId),
  renameTask: (input) => ipcRenderer.invoke('app:renameTask', input),
  setTaskPinned: (input) => ipcRenderer.invoke('app:setTaskPinned', input),
  archiveTask: (input) => ipcRenderer.invoke('app:archiveTask', input),
  deleteTask: (taskId) => ipcRenderer.invoke('app:deleteTask', taskId),
  updateProjectInstructions: (input) => ipcRenderer.invoke('app:updateProjectInstructions', input),
  saveBuiltinProviderToken: (providerId, token) => ipcRenderer.invoke('app:saveBuiltinProviderToken', providerId, token),
  testProvider: (providerId) => ipcRenderer.invoke('app:testProvider', providerId),
  saveCustomProvider: (input) => ipcRenderer.invoke('app:saveCustomProvider', input),
  deleteProvider: (providerId) => ipcRenderer.invoke('app:deleteProvider', providerId),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AppSnapshot) => callback(value)
    ipcRenderer.on('app:snapshot', listener)
    return () => ipcRenderer.removeListener('app:snapshot', listener)
  },
}

contextBridge.exposeInMainWorld('appApi', api)
