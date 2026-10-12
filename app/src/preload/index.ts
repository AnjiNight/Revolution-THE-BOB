import type { ConsentList, UserProfile } from '@simulador/shared';
import { contextBridge, ipcRenderer } from 'electron';
import {
  AUTH_CHANNELS,
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
    register: (input) => invoke<AuthResult>(AUTH_CHANNELS.register, input),
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
    changeEmail: (input) => invoke<ClientResult<UserProfile>>(PROFILE_CHANNELS.changeEmail, input),
    changePassword: (input) => invoke<ClientResult<null>>(PROFILE_CHANNELS.changePassword, input),
    listConsents: () => invoke<ClientResult<ConsentList>>(PROFILE_CHANNELS.listConsents),
    acceptTerms: () => invoke<ClientResult<null>>(PROFILE_CHANNELS.acceptTerms),
  },
};

contextBridge.exposeInMainWorld('api', api);
