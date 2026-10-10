import type {
  AuthErrorCode,
  ChangeEmailInput,
  ChangePasswordInput,
  FieldErrors,
  LoginInput,
  PublicUser,
  RegisterInput,
  UpdateNameInput,
} from '@simulador/shared';

/** Canais IPC de autenticação entre a interface e o processo principal. */
export const AUTH_CHANNELS = {
  getSession: 'auth:get-session',
  register: 'auth:register',
  login: 'auth:login',
  collaboratorLogin: 'auth:collaborator-login',
  googleAvailable: 'auth:google-available',
  googleSignIn: 'auth:google-sign-in',
  googleAcceptTerms: 'auth:google-accept-terms',
  logout: 'auth:logout',
} as const;

/** Canais IPC do perfil (SPEC-003). */
export const PROFILE_CHANNELS = {
  get: 'profile:get',
  updateName: 'profile:update-name',
  changeEmail: 'profile:change-email',
  changePassword: 'profile:change-password',
  listConsents: 'profile:list-consents',
  acceptTerms: 'profile:accept-terms',
} as const;

/** Erros que a interface sabe traduzir. */
export type ClientAuthError =
  AuthErrorCode | 'server_unavailable' | 'invalid_url' | 'unexpected' | 'google_cancelled';

export type AuthResult =
  { ok: true; user: PublicUser } | { ok: false; error: ClientAuthError; fields?: FieldErrors };

/** Resultado genérico das chamadas do perfil. */
export type ClientResult<T> =
  { ok: true; data: T } | { ok: false; error: ClientAuthError; fields?: FieldErrors };

export type { ChangeEmailInput, ChangePasswordInput, LoginInput, RegisterInput, UpdateNameInput };
