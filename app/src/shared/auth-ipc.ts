import type {
  AuthErrorCode,
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  FieldErrors,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  PublicUser,
  RegisterInput,
  UpdateNameInput,
} from '@simulador/shared';

/** Canais IPC de autenticação entre a interface e o processo principal. */
export const AUTH_CHANNELS = {
  getSession: 'auth:get-session',
  register: 'auth:register',
  confirmEmail: 'auth:confirm-email',
  resendConfirmation: 'auth:resend-confirmation',
  login: 'auth:login',
  collaboratorLogin: 'auth:collaborator-login',
  googleAvailable: 'auth:google-available',
  googleSignIn: 'auth:google-sign-in',
  googleAcceptTerms: 'auth:google-accept-terms',
  logout: 'auth:logout',
  passwordResetRequest: 'auth:password-reset-request',
  passwordResetConfirm: 'auth:password-reset-confirm',
} as const;

/** Canais IPC do perfil (SPEC-003; troca de e-mail em duas etapas na SPEC-039). */
export const PROFILE_CHANNELS = {
  get: 'profile:get',
  updateName: 'profile:update-name',
  changeEmail: 'profile:change-email',
  confirmEmailChange: 'profile:confirm-email-change',
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

export type {
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  UpdateNameInput,
};
