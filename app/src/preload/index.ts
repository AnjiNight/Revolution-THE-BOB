import type {
  AssetSearchResult,
  CalendarSuggestion,
  CatalogAsset,
  CatalogListResult,
  ConsentList,
  TradingCalendarYear,
  UserProfile,
} from '@simulador/shared';
import { contextBridge, ipcRenderer } from 'electron';
import {
  ASSET_CHANNELS,
  AUTH_CHANNELS,
  CALENDAR_CHANNELS,
  PROFILE_CHANNELS,
  type AuthResult,
  type ClientResult,
} from '../shared/auth-ipc.js';
import { CHECK_SERVER_CHANNEL, type ServerStatus } from '../shared/server-status.js';
import type { DesktopApi } from './api.js';

const invoke = <T>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: DesktopApi = {
  checkServerHealth: () => invoke<ServerStatus>(CHECK_SERVER_CHANNEL),
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
    get: () => invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.get),
    updateName: (input) => invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.updateName, input),
    changeEmail: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.changeEmail, input),
    confirmEmailChange: (input) =>
      invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.confirmEmailChange, input),
    changePassword: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.changePassword, input),
    listConsents: () => invoke<ClientResult<ConsentList>>(PROFILE_CHANNELS.listConsents),
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
  assets: {
    search: (query) => invoke<ClientResult<AssetSearchResult>>(ASSET_CHANNELS.search, query),
    catalog: (query) => invoke<ClientResult<CatalogListResult>>(ASSET_CHANNELS.catalog, query),
    create: (input) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.create, input),
    update: (id, input) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.update, id, input),
    deactivate: (id) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.deactivate, id),
    reactivate: (id) => invoke<ClientResult<CatalogAsset>>(ASSET_CHANNELS.reactivate, id),
  },
};

contextBridge.exposeInMainWorld('api', api);
