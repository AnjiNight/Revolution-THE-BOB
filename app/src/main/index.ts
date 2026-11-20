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
  NewNewsSourceInput,
  NewsSentiment,
  NewPortfolioCopyInput,
  NewPortfolioInput,
  NewTradeInput,
  UpdateNewsSourceInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  PriceHistoryPeriod,
  RegisterInput,
  RenamePortfolioInput,
  UpdateNameInput,
} from '@simulador/shared';
import { isoDateInBrasilia } from '@simulador/shared';
import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } from 'electron';
import {
  APP_CHANNELS,
  ASSET_CHANNELS,
  AUTH_CHANNELS,
  CALENDAR_CHANNELS,
  CONNECTION_CHANNELS,
  FUNDAMENTALS_CHANNELS,
  INDEX_CHANNELS,
  isAppLanguage,
  NEWS_CHANNELS,
  NOTIFY_CHANNELS,
  PORTFOLIO_CHANNELS,
  PROFILE_CHANNELS,
  REPORT_CHANNELS,
  TASK_CHANNELS,
  type AppLanguage,
  type ConnectionEvent,
} from '../shared/auth-ipc.js';
import { CHECK_SERVER_CHANNEL } from '../shared/server-status.js';
import { AuthClient } from './auth-client.js';
import { ConnectionMonitor } from './connection-monitor.js';
import { saveDataExport } from './data-export.js';
import { GoogleOAuthClient } from './google-oauth.js';
import { GoogleSignIn } from './google-sign-in.js';
import { EncryptedFileOfflineCache } from './offline-cache.js';
import { savePortfolioReport } from './portfolio-report.js';
import { isVariationNotice } from './variation-notice.js';
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

/**
 * SPEC-035: o idioma da interface, que ela avisa ao abrir e a cada troca. Vale para o que o
 * processo principal escreve; até o primeiro aviso, português.
 */
let uiLanguage: AppLanguage = 'pt-BR';

/** Login com Google (DA24): só aparece quando o app foi configurado com o client ID. */
function googleOAuth(): GoogleOAuthClient | null {
  const clientId =
    process.env.SIMULADOR_GOOGLE_CLIENT_ID ?? import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.SIMULADOR_GOOGLE_CLIENT_SECRET ?? import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new GoogleOAuthClient(
    { clientId, clientSecret },
    { openExternal: (url) => shell.openExternal(url), language: () => uiLanguage },
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

// SPEC-033: no Windows, o aviso do sistema sai com o nome e o ícone do app (o `appId` do
// instalador); sem isso, durante o desenvolvimento ele aparece como "Electron".
if (process.platform === 'win32') app.setAppUserModelId('br.mackenzie.simulador-investimentos');

/** SPEC-033: quantos avisos de variação ficam guardados para o clique (uns poucos por dia). */
const NOTICES_KEPT = 30;

app.whenReady().then(() => {
  const allowInsecureLocalhost = !app.isPackaged;

  ipcMain.handle(CHECK_SERVER_CHANNEL, () =>
    checkServerHealth(serverUrl(), { allowInsecureLocalhost }),
  );

  // SPEC-035: só "pt-BR" ou "en" mudam o idioma; outro valor é ignorado.
  ipcMain.handle(APP_CHANNELS.setLanguage, (_event, language: unknown) => {
    if (isAppLanguage(language)) uiLanguage = language;
  });

  // SPEC-032: cada janela fica sabendo quando o app entra ou sai do modo consulta.
  const broadcast = (event: ConnectionEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CONNECTION_CHANNELS.changed, event);
    }
  };
  let monitor: ConnectionMonitor | null = null;

  // Sessão (SPEC-002): token de renovação criptografado pelo cofre do SO (RNF08).
  // SPEC-032: a cópia local das leituras, cifrada pelo mesmo cofre.
  const auth = new AuthClient({
    serverUrl,
    allowInsecureLocalhost,
    store: new EncryptedFileSecretStore(join(app.getPath('userData'), 'sessao.bin'), osEncryption),
    cache: new EncryptedFileOfflineCache(join(app.getPath('userData'), 'cache'), osEncryption),
    onConnectionChange: (event) => {
      monitor?.setOffline(event.status === 'offline');
      broadcast(event);
    },
  });
  monitor = new ConnectionMonitor({
    check: () => checkServerHealth(serverUrl(), { allowInsecureLocalhost }),
    reconnect: () => auth.reconnect(),
  });
  const connection = monitor;
  ipcMain.handle(CONNECTION_CHANNELS.status, () => ({ offline: auth.isOffline }));
  ipcMain.handle(CONNECTION_CHANNELS.retry, () => connection.checkNow());

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
  // SPEC-033: os avisos de variação ficam guardados até o clique, mesmo depois de saírem da tela
  // para a Central de Ações: sem a referência, o clique se perde. Ao sair da conta, eles saem da
  // Central de Ações (têm os nomes das carteiras).
  const notices: Notification[] = [];
  ipcMain.handle(AUTH_CHANNELS.logout, async () => {
    for (const notification of notices.splice(0)) notification.close();
    await auth.logout();
  });

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
      uiLanguage,
    ),
  );

  // Relatório da carteira em PDF (SPEC-038): o Chromium imprime a própria janela de quem pediu
  // (o documento do relatório só aparece na impressão), e o arquivo vai para onde a pessoa
  // escolher. O caminho gravado fica só aqui: o "Abrir" não aceita caminho vindo da interface.
  let lastReport: string | null = null;
  ipcMain.handle(REPORT_CHANNELS.save, async (event, request: unknown) => {
    const { result, path } = await savePortfolioReport(
      request,
      {
        chooseFile: async (defaultPath) => {
          const window = BrowserWindow.fromWebContents(event.sender);
          const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
          const choice = window
            ? await dialog.showSaveDialog(window, options)
            : await dialog.showSaveDialog(options);
          return choice.canceled || !choice.filePath ? null : choice.filePath;
        },
        printToPdf: (options) => event.sender.printToPDF(options),
        writeFile: (path, contents) => writeFile(path, contents),
      },
      app.getPath('downloads'),
      uiLanguage,
      isoDateInBrasilia(new Date()),
    );
    if (path) lastReport = path;
    return result;
  });
  ipcMain.handle(REPORT_CHANNELS.open, async () =>
    lastReport ? (await shell.openPath(lastReport)) === '' : false,
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
  // Avisos de variação (SPEC-033): a interface confere a variação do dia e pede o aviso do
  // sistema; o clique traz a janela para a frente e diz à interface para onde ir.
  ipcMain.handle(PORTFOLIO_CHANNELS.dayChanges, () => auth.dayChanges());
  ipcMain.handle(NOTIFY_CHANNELS.show, (event, notice: unknown) => {
    if (!isVariationNotice(notice) || !Notification.isSupported()) return false;
    const sender = event.sender;
    const notification = new Notification({ title: notice.title, body: notice.body });
    notices.push(notification);
    if (notices.length > NOTICES_KEPT) notices.shift();
    notification.on('click', () => {
      const window = BrowserWindow.fromWebContents(sender);
      if (window) {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      }
      if (!sender.isDestroyed()) sender.send(NOTIFY_CHANNELS.clicked, notice.target);
      const index = notices.indexOf(notification);
      if (index >= 0) notices.splice(index, 1);
    });
    notification.show();
    return true;
  });
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
  // Comparação (SPEC-022): o servidor confere se todas são do usuário.
  ipcMain.handle(PORTFOLIO_CHANNELS.comparison, (_event, query: unknown) =>
    auth.portfolioComparison(query),
  );
  // Estorno (SPEC-015): o servidor confere o prazo e se o livro continua válido.
  ipcMain.handle(PORTFOLIO_CHANNELS.reverse, (_event, id: string, entryId: string) =>
    auth.reverseEntry(id, entryId),
  );
  // Cópia (SPEC-023): o servidor copia o livro com a original travada.
  ipcMain.handle(PORTFOLIO_CHANNELS.copy, (_event, id: string, input: NewPortfolioCopyInput) =>
    auth.copyPortfolio(id, input),
  );

  // Tarefas de ingestão (SPEC-011): o servidor confere se a conta é de colaborador.
  ipcMain.handle(TASK_CHANNELS.list, () => auth.listTasks());
  ipcMain.handle(TASK_CHANNELS.runs, (_event, task: string, offset?: number) =>
    auth.taskRuns(task, offset),
  );
  ipcMain.handle(TASK_CHANNELS.errors, (_event, runId: string, offset?: number) =>
    auth.runErrors(runId, offset),
  );
  ipcMain.handle(TASK_CHANNELS.request, (_event, task: string) => auth.requestTaskRun(task));

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
  // Fontes de notícias (SPEC-027): só colaborador; o servidor confere e testa o feed.
  ipcMain.handle(NEWS_CHANNELS.sources, () => auth.newsSources());
  ipcMain.handle(NEWS_CHANNELS.latest, () => auth.latestNews());
  ipcMain.handle(NEWS_CHANNELS.createSource, (_event, input: NewNewsSourceInput) =>
    auth.createNewsSource(input),
  );
  ipcMain.handle(NEWS_CHANNELS.updateSource, (_event, id: string, input: UpdateNewsSourceInput) =>
    auth.updateNewsSource(id, input),
  );
  // SPEC-044: a amostra rotulada e a avaliação do sentimento (só colaborador).
  ipcMain.handle(NEWS_CHANNELS.sentiment, () => auth.sentimentSummary());
  ipcMain.handle(NEWS_CHANNELS.nextToLabel, (_event, skip: string[]) =>
    auth.nextNewsToLabel(Array.isArray(skip) ? skip : []),
  );
  ipcMain.handle(NEWS_CHANNELS.label, (_event, id: string, sentiment: NewsSentiment) =>
    auth.labelNews(id, sentiment),
  );
  ipcMain.handle(NEWS_CHANNELS.unlabel, (_event, id: string) => auth.unlabelNews(id));
  ipcMain.handle(NEWS_CHANNELS.evaluate, () => auth.evaluateSentiment());

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
  // SPEC-029: notícias do ativo na ficha e os marcadores do gráfico.
  ipcMain.handle(ASSET_CHANNELS.news, (_event, id: string, query: unknown) =>
    auth.assetNews(id, query),
  );
  ipcMain.handle(ASSET_CHANNELS.newsDays, (_event, id: string, period: PriceHistoryPeriod) =>
    auth.assetNewsDays(id, period),
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
