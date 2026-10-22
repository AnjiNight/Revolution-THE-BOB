import type {
  CalendarSuggestion,
  ConsentList,
  TradingCalendarYear,
  UserProfile,
} from '@simulador/shared';
import type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AuthResult,
  CalendarPublication,
  ChangeEmailInput,
  ChangePasswordInput,
  ClientResult,
  ConfirmEmailChangeInput,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
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
    /** SPEC-039: cria a conta pendente e manda o código; não abre sessão. */
    register(input: RegisterInput): Promise<ClientResult<null>>;
    /** SPEC-039: código certo libera a conta e abre a sessão. */
    confirmEmail(input: EmailConfirmationInput): Promise<AuthResult>;
    resendConfirmation(input: EmailConfirmationResendInput): Promise<ClientResult<null>>;
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
    /** SPEC-039: o e-mail só muda depois de `confirmEmailChange` com o código do endereço novo. */
    changeEmail(input: ChangeEmailInput): Promise<ClientResult<null>>;
    confirmEmailChange(input: ConfirmEmailChangeInput): Promise<ClientResult<UserProfile>>;
    changePassword(input: ChangePasswordInput): Promise<ClientResult<null>>;
    listConsents(): Promise<ClientResult<ConsentList>>;
    acceptTerms(): Promise<ClientResult<null>>;
    /** SPEC-034: abre "Salvar como"; `saved: false` quando a pessoa cancela. */
    exportData(): Promise<ClientResult<{ saved: boolean }>>;
    requestDeletion(input: AccountDeletionRequestInput): Promise<ClientResult<null>>;
    /** Apaga a conta no servidor e a sessão guardada no dispositivo. */
    confirmDeletion(input: AccountDeletionConfirmInput): Promise<ClientResult<null>>;
  };
  /** Calendário de pregão (SPEC-005). Sugestão e publicação: só colaborador (403 para usuário). */
  calendar: {
    getYear(year: number): Promise<ClientResult<TradingCalendarYear>>;
    suggestion(year: number): Promise<ClientResult<CalendarSuggestion>>;
    /** Substitui a lista inteira do ano. */
    publish(year: number, input: CalendarPublication): Promise<ClientResult<TradingCalendarYear>>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
