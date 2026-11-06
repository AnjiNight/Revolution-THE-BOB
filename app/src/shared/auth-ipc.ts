import type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AssetSearchQuery,
  AssetUpdateInput,
  AuthErrorCode,
  CalendarErrorCode,
  CalendarPublication,
  CatalogErrorCode,
  CatalogQuery,
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  FieldErrors,
  FundamentalsErrorCode,
  LoginInput,
  NewAssetInput,
  NewCashEntryInput,
  NewPortfolioInput,
  NewTradeInput,
  PortfolioErrorCode,
  RenamePortfolioInput,
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
  /** SPEC-034: dados pessoais. */
  exportData: 'profile:export-data',
  requestDeletion: 'profile:request-deletion',
  confirmDeletion: 'profile:confirm-deletion',
} as const;

/** Canais IPC do calendário de pregão (SPEC-005); sugestão e publicação só para colaborador. */
export const CALENDAR_CHANNELS = {
  getYear: 'calendar:get-year',
  suggestion: 'calendar:suggestion',
  publish: 'calendar:publish',
} as const;

/** Canais IPC do catálogo de ativos (SPECs 006, 010 e 040); manutenção só para colaborador. */
export const ASSET_CHANNELS = {
  search: 'assets:search',
  detail: 'assets:detail',
  history: 'assets:history',
  logo: 'assets:logo',
  catalog: 'assets:catalog',
  create: 'assets:create',
  update: 'assets:update',
  deactivate: 'assets:deactivate',
  reactivate: 'assets:reactivate',
  confirmClassification: 'assets:confirm-classification',
} as const;

/** Canais IPC dos indexadores (SPEC-007): situação da série do CDI, só para colaborador. */
export const INDEX_CHANNELS = {
  cdi: 'indexes:cdi',
} as const;

/** Canais IPC dos indicadores e proventos (SPECs 041 e 042); a situação da coleta é do colaborador. */
export const FUNDAMENTALS_CHANNELS = {
  fundamentals: 'fundamentals:get',
  dividends: 'fundamentals:dividends',
  collection: 'fundamentals:collection',
} as const;

/** Canais IPC das carteiras (SPEC-012), só da conta de usuário. */
export const PORTFOLIO_CHANNELS = {
  list: 'portfolios:list',
  create: 'portfolios:create',
  get: 'portfolios:get',
  rename: 'portfolios:rename',
  delete: 'portfolios:delete',
  // SPEC-013: saldo e extrato; aporte ou retirada.
  cash: 'portfolios:cash',
  addCash: 'portfolios:add-cash',
  // SPEC-014: posições, cotação para negociar e a compra ou venda.
  positions: 'portfolios:positions',
  tradeQuote: 'portfolios:trade-quote',
  trade: 'portfolios:trade',
} as const;

/** Erros que a interface sabe traduzir. */
export type ClientAuthError =
  | AuthErrorCode
  | CalendarErrorCode
  | CatalogErrorCode
  | FundamentalsErrorCode
  | PortfolioErrorCode
  | 'server_unavailable'
  | 'invalid_url'
  | 'unexpected'
  | 'google_cancelled';

/** Dado do servidor para corrigir o pedido, como o saldo disponível (SPEC-013). */
export type ErrorDetails = Readonly<Record<string, string>>;

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: ClientAuthError; fields?: FieldErrors; details?: ErrorDetails };

/** Resultado genérico das chamadas do perfil. */
export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClientAuthError; fields?: FieldErrors; details?: ErrorDetails };

export type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AssetSearchQuery,
  AssetUpdateInput,
  CalendarPublication,
  CatalogQuery,
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  LoginInput,
  NewAssetInput,
  NewCashEntryInput,
  NewPortfolioInput,
  NewTradeInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  RenamePortfolioInput,
  UpdateNameInput,
};
