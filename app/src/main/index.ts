import { join } from 'node:path';
import type { LoginInput, RegisterInput } from '@simulador/shared';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { AUTH_CHANNELS } from '../shared/auth-ipc.js';
import { CHECK_SERVER_CHANNEL } from '../shared/server-status.js';
import { AuthClient } from './auth-client.js';
import { GoogleOAuthClient } from './google-oauth.js';
import { GoogleSignIn } from './google-sign-in.js';
import { EncryptedFileSecretStore, type OsEncryption } from './secret-store.js';
import { checkServerHealth } from './server-health.js';

const DEFAULT_SERVER_URL = 'http://localhost:3333';

/**
 * Cofre do SO (RNF08). No Linux sem keyring, o Electron "criptografa" com uma senha fixa
 * (backend basic_text) — isso não protege nada, então é tratado como cofre indisponível.
 */
const osEncryption: OsEncryption = {
  isEncryptionAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
};

/** Login com Google (DA24): só aparece quando o app foi configurado com o client ID. */
function googleOAuth(): GoogleOAuthClient | null {
  const clientId =
    process.env.SIMULADOR_GOOGLE_CLIENT_ID ?? import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.SIMULADOR_GOOGLE_CLIENT_SECRET ?? import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new GoogleOAuthClient(
    { clientId, clientSecret },
    { openExternal: (url) => shell.openExternal(url) },
  );
}

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
  const allowInsecureLocalhost = !app.isPackaged;

  ipcMain.handle(CHECK_SERVER_CHANNEL, () =>
    checkServerHealth(serverUrl(), { allowInsecureLocalhost }),
  );

  // Sessão (SPEC-002): token de renovação criptografado pelo cofre do SO (RNF08).
  const auth = new AuthClient({
    serverUrl,
    allowInsecureLocalhost,
    store: new EncryptedFileSecretStore(join(app.getPath('userData'), 'sessao.bin'), osEncryption),
  });
  ipcMain.handle(AUTH_CHANNELS.getSession, () => auth.restore());
  ipcMain.handle(AUTH_CHANNELS.register, (_event, input: RegisterInput) => auth.register(input));
  ipcMain.handle(AUTH_CHANNELS.login, (_event, input: LoginInput) => auth.login(input));
  ipcMain.handle(AUTH_CHANNELS.collaboratorLogin, (_event, input: LoginInput) =>
    auth.collaboratorLogin(input),
  );
  const google = new GoogleSignIn(googleOAuth(), auth);
  ipcMain.handle(AUTH_CHANNELS.googleAvailable, () => google.available);
  ipcMain.handle(AUTH_CHANNELS.googleSignIn, () => google.signIn());
  ipcMain.handle(AUTH_CHANNELS.googleAcceptTerms, () => google.acceptTermsAndContinue());
  ipcMain.handle(AUTH_CHANNELS.logout, () => auth.logout());

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
