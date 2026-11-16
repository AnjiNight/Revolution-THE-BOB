import type {
  AssetDetail,
  AssetDividends,
  AssetFundamentals,
  AssetSearchResult,
  CalendarSuggestion,
  CashEntryResult,
  CashStatement,
  PortfolioComparison,
  PortfolioCopyResult,
  PortfolioPerformance,
  PortfolioPositions,
  ReversalResult,
  TradeQuote,
  TradeResult,
  CatalogAsset,
  CatalogListResult,
  CdiStatus,
  MarketIndexStatus,
  ConsentList,
  Investidor10Status,
  Portfolio,
  PortfolioList,
  PriceHistory,
  TradingCalendarYear,
  UserProfile,
} from '@simulador/shared';
import { contextBridge, ipcRenderer } from 'electron';
import {
  ASSET_CHANNELS,
  AUTH_CHANNELS,
  CALENDAR_CHANNELS,
  CONNECTION_CHANNELS,
  FUNDAMENTALS_CHANNELS,
  INDEX_CHANNELS,
  PORTFOLIO_CHANNELS,
  PROFILE_CHANNELS,
  type AuthResult,
  type ClientResult,
  type ConnectionEvent,
  type ReconnectResult,
} from '../shared/auth-ipc.js';
import { CHECK_SERVER_CHANNEL, type ServerStatus } from '../shared/server-status.js';
import type { DesktopApi } from './api.js';

const invoke = <T>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

/** SPEC-032: quem quer saber a data das leituras que vieram da cópia local (a faixa da tela). */
const savedAtListeners = new Set<(savedAt: string) => void>();

/** Leitura que a cópia local guarda: a data dela vai para a faixa do modo consulta. */
const read = <T>(channel: string, ...args: unknown[]) =>
  invoke<ClientResult<T>>(channel, ...args).then((result) => {
    if (result.ok && result.savedAt) {
      for (const listener of savedAtListeners) listener(result.savedAt);
    }
    return result;
  });

const api: DesktopApi = {
  checkServerHealth: () => invoke<ServerStatus>(CHECK_SERVER_CHANNEL),
  connection: {
    status: () => invoke<{ offline: boolean }>(CONNECTION_CHANNELS.status),
    retry: () => invoke<ReconnectResult>(CONNECTION_CHANNELS.retry),
    onChange: (listener) => {
      const handler = (_event: unknown, change: ConnectionEvent) => listener(change);
      ipcRenderer.on(CONNECTION_CHANNELS.changed, handler);
      return () => {
        ipcRenderer.removeListener(CONNECTION_CHANNELS.changed, handler);
      };
    },
    onSavedAt: (listener) => {
      savedAtListeners.add(listener);
      return () => {
        savedAtListeners.delete(listener);
      };
    },
  },
  auth: {
    getSession: () => invoke<AuthResult>(AUTH_CHANNELS.getSession),
    register: (input) => invoke<ClientResult<null>>(AUTH_CHANNELS.register, input),
    confirmEmail: (input) => invoke<AuthResult>(AUTH_CHANNELS.confirmEmail, input),
    resendConfirmation: (input) =>
      invoke<ClientResult<null>>(AUTH_CHANNELS.resendConfirmation, input),
    login: (input) => invoke<AuthResult>(AUTH_CHANNELS.login, input),
    collaboratorLogin: (input) => invoke<AuthResult>(AUTH_CHANNELS.collaboratorLogin, input),
    googleAvailable: () => invoke<boolean>(AUTH_CHANNELS.googleAvailable),
    signInWithGoogle: () => invoke<AuthResult>(AUTH_CHANNELS.googleSignIn),
    acceptGoogleTerms: () => invoke<AuthResult>(AUTH_CHANNELS.googleAcceptTerms),
    logout: () => invoke<void>(AUTH_CHANNELS.logout),
    requestPasswordReset: (input) =>
      invoke<ClientResult<null>>(AUTH_CHANNELS.passwordResetRequest, input),
    confirmPasswordReset: (input) =>
      invoke<ClientResult<null>>(AUTH_CHANNELS.passwordResetConfirm, input),
  },
  profile: {
    get: () => read<UserProfile>(PROFILE_CHANNELS.get),
    updateName: (input) => invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.updateName, input),
    changeEmail: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.changeEmail, input),
    confirmEmailChange: (input) =>
      invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.confirmEmailChange, input),
    changePassword: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.changePassword, input),
    listConsents: () => read<ConsentList>(PROFILE_CHANNELS.listConsents),
    acceptTerms: () => invoke<ClientResult<null>>(PROFILE_CHANNELS.acceptTerms),
    exportData: () => invoke<ClientResult<{ saved: boolean }>>(PROFILE_CHANNELS.exportData),
    requestDeletion: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.requestDeletion, input),
    confirmDeletion: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.confirmDeletion, input),
  },
  calendar: {
    getYear: (year) => invoke<ClientResult<TradingCalendarYear>>(CALENDAR_CHANNELS.getYear, year),
    suggestion: (year) =>
      invoke<ClientResult<CalendarSuggestion>>(CALENDAR_CHANNELS.suggestion, year),
    publish: (year, input) =>
      invoke<ClientResult<TradingCalendarYear>>(CALENDAR_CHANNELS.publish, year, input),
  },
  indexes: {
    cdi: () => invoke<ClientResult<CdiStatus>>(INDEX_CHANNELS.cdi),
    market: () => invoke<ClientResult<MarketIndexStatus>>(INDEX_CHANNELS.marketIndexes),
  },
  portfolios: {
    list: () => read<PortfolioList>(PORTFOLIO_CHANNELS.list),
    create: (input) => invoke<ClientResult<Portfolio>>(PORTFOLIO_CHANNELS.create, input),
    get: (id) => read<Portfolio>(PORTFOLIO_CHANNELS.get, id),
    rename: (id, input) => invoke<ClientResult<Portfolio>>(PORTFOLIO_CHANNELS.rename, id, input),
    delete: (id) => invoke<ClientResult<null>>(PORTFOLIO_CHANNELS.delete, id),
    cash: (id, offset) => read<CashStatement>(PORTFOLIO_CHANNELS.cash, id, offset),
    addCash: (id, input) =>
      invoke<ClientResult<CashEntryResult>>(PORTFOLIO_CHANNELS.addCash, id, input),
    positions: (id) => read<PortfolioPositions>(PORTFOLIO_CHANNELS.positions, id),
    tradeQuote: (id, assetId, date) =>
      invoke<ClientResult<TradeQuote>>(PORTFOLIO_CHANNELS.tradeQuote, id, assetId, date),
    trade: (id, input) => invoke<ClientResult<TradeResult>>(PORTFOLIO_CHANNELS.trade, id, input),
    reverse: (id, entryId) =>
      invoke<ClientResult<ReversalResult>>(PORTFOLIO_CHANNELS.reverse, id, entryId),
    performance: (id, query) =>
      read<PortfolioPerformance>(PORTFOLIO_CHANNELS.performance, id, query),
    comparison: (query) => read<PortfolioComparison>(PORTFOLIO_CHANNELS.comparison, query),
    copy: (id, input) =>
      invoke<ClientResult<PortfolioCopyResult>>(PORTFOLIO_CHANNELS.copy, id, input),
  },
  fundamentals: {
    get: (id) => read<AssetFundamentals>(FUNDAMENTALS_CHANNELS.fundamentals, id),
    dividends: (id, period) => read<AssetDividends>(FUNDAMENTALS_CHANNELS.dividends, id, period),
    collection: () => invoke<ClientResult<Investidor10Status>>(FUNDAMENTALS_CHANNELS.collection),
  },
  assets: {
    search: (query) => invoke<ClientResult<AssetSearchResult>>(ASSET_CHANNELS.search, query),
    detail: (id) => read<AssetDetail>(ASSET_CHANNELS.detail, id),
    history: (id, period, adjusted = true) =>
      read<PriceHistory>(ASSET_CHANNELS.history, id, period, adjusted),
    catalog: (query) => invoke<ClientResult<CatalogListResult>>(ASSET_CHANNELS.catalog, query),
    create: (input) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.create, input),
    update: (id, input) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.update, id, input),
    deactivate: (id) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.deactivate, id),
    reactivate: (id) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.reactivate, id),
    confirmClassification: (id) =>
      invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.confirmClassification, id),
    logo: (id) => read<string | null>(ASSET_CHANNELS.logo, id),
  },
};

contextBridge.exposeInMainWorld('api', api);
