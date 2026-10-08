import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { CHECK_SERVER_CHANNEL } from '../shared/server-status.js';
import { checkServerHealth } from './server-health.js';

const DEFAULT_SERVER_URL = 'http://localhost:3333';

function serverUrl(): string {
  return process.env.SIMULADOR_API_URL ?? import.meta.env.MAIN_VITE_API_URL ?? DEFAULT_SERVER_URL;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 480,
    minHeight: 480,
    show: false,
    title: 'Simulador de Investimentos',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Links externos abrem no navegador; nenhuma janela nova dentro do app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle(CHECK_SERVER_CHANNEL, () =>
    checkServerHealth(serverUrl(), { allowInsecureLocalhost: !app.isPackaged }),
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
