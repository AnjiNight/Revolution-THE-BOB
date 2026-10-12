import type { ConsentList, UserProfile } from '@simulador/shared';
import type {
  AuthResult,
  ChangeEmailInput,
  ChangePasswordInput,
  ClientResult,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  UpdateNameInput,
} from '../shared/auth-ipc.js';
import type { ServerStatus } from '../shared/server-status.js';

/** Funções que o processo principal expõe para a interface (window.api). */
export interface DesktopApi {
  checkServerHealth(): Promise<ServerStatus>;
  auth: {
    getSession(): Promise<AuthResult>;
    register(input: RegisterInput): Promise<AuthResult>;
    login(input: LoginInput): Promise<AuthResult>;
    collaboratorLogin(input: LoginInput): Promise<AuthResult>;
    googleAvailable(): Promise<boolean>;
    signInWithGoogle(): Promise<AuthResult>;
    acceptGoogleTerms(): Promise<AuthResult>;
    logout(): Promise<void>;
    /** SPEC-004: pede o código de redefinição; o resultado não diz se a conta existe. */
    requestPasswordReset(input: PasswordResetRequestInput): Promise<ClientResult<null>>;
    confirmPasswordReset(input: PasswordResetConfirmInput): Promise<ClientResult<null>>;
  };
  /** Perfil da conta conectada (SPEC-003). */
  profile: {
    get(): Promise<ClientResult<UserProfile>>;
    updateName(input: UpdateNameInput): Promise<ClientResult<UserProfile>>;
    changeEmail(input: ChangeEmailInput): Promise<ClientResult<UserProfile>>;
    changePassword(input: ChangePasswordInput): Promise<ClientResult<null>>;
    listConsents(): Promise<ClientResult<ConsentList>>;
    acceptTerms(): Promise<ClientResult<null>>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
