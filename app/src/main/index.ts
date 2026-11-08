import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AssetSearchQuery,
  AssetUpdateInput,
  CalendarPublication,
  CatalogQuery,
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  DividendPeriod,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  LoginInput,
  NewAssetInput,
  NewCashEntryInput,
  NewPortfolioInput,
  NewTradeInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  PriceHistoryPeriod,
  RegisterInput,
  RenamePortfolioInput,
  UpdateNameInput,
} from '@simulador/shared';
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import {
  ASSET_CHANNELS,
  AUTH_CHANNELS,
  CALENDAR_CHANNELS,
  FUNDAMENTALS_CHANNELS,
  INDEX_CHANNELS,
  PORTFOLIO_CHANNELS,
  PROFILE_CHANNELS,
} from '../shared/auth-ipc.js';
import { CHECK_SERVER_CHANNEL } from '../shared/server-status.js';
import { AuthClient } from './auth-client.js';
import { saveDataExport } from './data-export.js';
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
  // Confirmação de e-mail (SPEC-039): o código é digitado no app e nunca fica guardado.
  ipcMain.handle(AUTH_CHANNELS.confirmEmail, (_event, input: EmailConfirmationInput) =>
    auth.confirmEmail(input),
  );
  ipcMain.handle(AUTH_CHANNELS.resendConfirmation, (_event, input: EmailConfirmationResendInput) =>
    auth.resendConfirmation(input),
  );
  ipcMain.handle(AUTH_CHANNELS.login, (_event, input: LoginInput) => auth.login(input));
  ipcMain.handle(AUTH_CHANNELS.collaboratorLogin, (_event, input: LoginInput) =>
    auth.collaboratorLogin(input),
  );
  const google = new GoogleSignIn(googleOAuth(), auth);
  ipcMain.handle(AUTH_CHANNELS.googleAvailable, () => google.available);
  ipcMain.handle(AUTH_CHANNELS.googleSignIn, () => google.signIn());
  ipcMain.handle(AUTH_CHANNELS.googleAcceptTerms, () => google.acceptTermsAndContinue());
  ipcMain.handle(AUTH_CHANNELS.logout, () => auth.logout());

  // Recuperação de senha (SPEC-004): o código é digitado no app e nunca fica guardado.
  ipcMain.handle(AUTH_CHANNELS.passwordResetRequest, (_event, input: PasswordResetRequestInput) =>
    auth.requestPasswordReset(input),
  );
  ipcMain.handle(AUTH_CHANNELS.passwordResetConfirm, (_event, input: PasswordResetConfirmInput) =>
    auth.confirmPasswordReset(input),
  );

  // Perfil (SPEC-003): sempre da conta da sessão atual.
  ipcMain.handle(PROFILE_CHANNELS.get, () => auth.getProfile());
  ipcMain.handle(PROFILE_CHANNELS.updateName, (_event, input: UpdateNameInput) =>
    auth.updateName(input),
  );
  ipcMain.handle(PROFILE_CHANNELS.changeEmail, (_event, input: ChangeEmailInput) =>
    auth.changeEmail(input),
  );
  ipcMain.handle(PROFILE_CHANNELS.confirmEmailChange, (_event, input: ConfirmEmailChangeInput) =>
    auth.confirmEmailChange(input),
  );
  ipcMain.handle(PROFILE_CHANNELS.changePassword, (_event, input: ChangePasswordInput) =>
    auth.changePassword(input),
  );
  ipcMain.handle(PROFILE_CHANNELS.listConsents, () => auth.listConsents());
  ipcMain.handle(PROFILE_CHANNELS.acceptTerms, () => auth.acceptTerms());

  // Dados pessoais (SPEC-034): o arquivo vai direto para onde a pessoa escolher.
  ipcMain.handle(PROFILE_CHANNELS.exportData, (event) =>
    saveDataExport(
      () => auth.exportData(),
      {
        chooseFile: async (defaultPath) => {
          const window = BrowserWindow.fromWebContents(event.sender);
          const options = { defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] };
          const choice = window
            ? await dialog.showSaveDialog(window, options)
            : await dialog.showSaveDialog(options);
          return choice.canceled || !choice.filePath ? null : choice.filePath;
        },
        writeFile: (path, contents) => writeFile(path, contents, 'utf8'),
      },
      app.getPath('downloads'),
    ),
  );
  ipcMain.handle(PROFILE_CHANNELS.requestDeletion, (_event, input: AccountDeletionRequestInput) =>
    auth.requestDeletion(input),
  );
  ipcMain.handle(PROFILE_CHANNELS.confirmDeletion, (_event, input: AccountDeletionConfirmInput) =>
    auth.confirmDeletion(input),
  );

  // Calendário de pregão (SPEC-005): o servidor confere se a conta é de colaborador.
  ipcMain.handle(CALENDAR_CHANNELS.getYear, (_event, year: number) => auth.getCalendar(year));
  ipcMain.handle(CALENDAR_CHANNELS.suggestion, (_event, year: number) =>
    auth.calendarSuggestion(year),
  );
  ipcMain.handle(CALENDAR_CHANNELS.publish, (_event, year: number, input: CalendarPublication) =>
    auth.publishCalendar(year, input),
  );

  // Carteiras (SPEC-012): o servidor confere o dono de cada uma.
  ipcMain.handle(PORTFOLIO_CHANNELS.list, () => auth.listPortfolios());
  ipcMain.handle(PORTFOLIO_CHANNELS.create, (_event, input: NewPortfolioInput) =>
    auth.createPortfolio(input),
  );
  ipcMain.handle(PORTFOLIO_CHANNELS.get, (_event, id: string) => auth.getPortfolio(id));
  ipcMain.handle(PORTFOLIO_CHANNELS.rename, (_event, id: string, input: RenamePortfolioInput) =>
    auth.renamePortfolio(id, input),
  );
  ipcMain.handle(PORTFOLIO_CHANNELS.delete, (_event, id: string) => auth.deletePortfolio(id));
  // Caixa (SPEC-013): saldo, extrato, aporte e retirada.
  ipcMain.handle(PORTFOLIO_CHANNELS.cash, (_event, id: string, offset?: number) =>
    auth.cashStatement(id, offset),
  );
  ipcMain.handle(PORTFOLIO_CHANNELS.addCash, (_event, id: string, input: NewCashEntryInput) =>
    auth.addCashEntry(id, input),
  );
  // Compra e venda (SPEC-014): o servidor confere bolsa, cotação, caixa e posição.
  ipcMain.handle(PORTFOLIO_CHANNELS.positions, (_event, id: string) => auth.portfolioPositions(id));
  ipcMain.handle(
    PORTFOLIO_CHANNELS.tradeQuote,
    (_event, id: string, assetId: string, date?: string) => auth.tradeQuote(id, assetId, date),
  );
  ipcMain.handle(PORTFOLIO_CHANNELS.trade, (_event, id: string, input: NewTradeInput) =>
    auth.trade(id, input),
  );
  // Rentabilidade (SPEC-019): o servidor refaz a conta a partir do livro.
  ipcMain.handle(PORTFOLIO_CHANNELS.performance, (_event, id: string, query: unknown) =>
    auth.portfolioPerformance(id, query),
  );
  // Estorno (SPEC-015): o servidor confere o prazo e se o livro continua válido.
  ipcMain.handle(PORTFOLIO_CHANNELS.reverse, (_event, id: string, entryId: string) =>
    auth.reverseEntry(id, entryId),
  );

  // Série do CDI (SPEC-007): o servidor confere se a conta é de colaborador.
  ipcMain.handle(INDEX_CHANNELS.cdi, () => auth.cdiStatus());
  // Ibovespa e IFIX (SPEC-020): também só colaborador.
  ipcMain.handle(INDEX_CHANNELS.marketIndexes, () => auth.marketIndexStatus());

  // Indicadores e proventos (SPECs 041 e 042); o cliente confere o período antes do servidor.
  ipcMain.handle(FUNDAMENTALS_CHANNELS.fundamentals, (_event, id: string) =>
    auth.assetFundamentals(id),
  );
  ipcMain.handle(FUNDAMENTALS_CHANNELS.dividends, (_event, id: string, period: DividendPeriod) =>
    auth.assetDividends(id, period),
  );
  ipcMain.handle(FUNDAMENTALS_CHANNELS.collection, () => auth.investidor10Status());

  // Catálogo de ativos (SPEC-006): o servidor confere se a conta é de colaborador.
  ipcMain.handle(ASSET_CHANNELS.search, (_event, query: AssetSearchQuery) =>
    auth.searchAssets(query),
  );
  // SPEC-010: ficha e gráfico; o cliente confere o id e o período antes de chamar o servidor.
  ipcMain.handle(ASSET_CHANNELS.detail, (_event, id: string) => auth.assetDetail(id));
  ipcMain.handle(
    ASSET_CHANNELS.history,
    (_event, id: string, period: PriceHistoryPeriod, adjusted?: boolean) =>
      auth.assetHistory(id, period, adjusted !== false),
  );
  ipcMain.handle(ASSET_CHANNELS.catalog, (_event, query: CatalogQuery) => auth.assetCatalog(query));
  ipcMain.handle(ASSET_CHANNELS.create, (_event, input: NewAssetInput) => auth.createAsset(input));
  ipcMain.handle(ASSET_CHANNELS.update, (_event, id: string, input: AssetUpdateInput) =>
    auth.updateAsset(id, input),
  );
  ipcMain.handle(ASSET_CHANNELS.deactivate, (_event, id: string) => auth.deactivateAsset(id));
  ipcMain.handle(ASSET_CHANNELS.reactivate, (_event, id: string) => auth.reactivateAsset(id));
  ipcMain.handle(ASSET_CHANNELS.confirmClassification, (_event, id: string) =>
    auth.confirmAssetClassification(id),
  );
  ipcMain.handle(ASSET_CHANNELS.logo, (_event, id: string) => auth.assetLogo(id));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
