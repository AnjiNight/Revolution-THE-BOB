import { contextBridge, ipcRenderer } from 'electron';
import { CHECK_SERVER_CHANNEL, type ServerStatus } from '../shared/server-status.js';
import type { DesktopApi } from './api.js';

const api: DesktopApi = {
  checkServerHealth: () => ipcRenderer.invoke(CHECK_SERVER_CHANNEL) as Promise<ServerStatus>,
};

contextBridge.exposeInMainWorld('api', api);
