import type {
  AuthErrorCode,
  FieldErrors,
  LoginInput,
  PublicUser,
  RegisterInput,
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

/** Erros que a interface sabe traduzir. */
export type ClientAuthError =
  AuthErrorCode | 'server_unavailable' | 'invalid_url' | 'unexpected' | 'google_cancelled';

export type AuthResult =
  { ok: true; user: PublicUser } | { ok: false; error: ClientAuthError; fields?: FieldErrors };

export type { LoginInput, RegisterInput };
