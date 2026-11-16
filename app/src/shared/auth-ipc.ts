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
  NewsErrorCode,
  PortfolioErrorCode,
  RenamePortfolioInput,
  TaskErrorCode,
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
  /** SPEC-020: Ibovespa e IFIX. */
  marketIndexes: 'indexes:market',
} as const;

/** Canais IPC dos indicadores e proventos (SPECs 041 e 042); a situação da coleta é do colaborador. */
export const FUNDAMENTALS_CHANNELS = {
  fundamentals: 'fundamentals:get',
  dividends: 'fundamentals:dividends',
  collection: 'fundamentals:collection',
} as const;

/** SPEC-027: fontes de notícias (só colaborador). */
export const NEWS_CHANNELS = {
  sources: 'news:sources',
  createSource: 'news:create-source',
  updateSource: 'news:update-source',
  // SPEC-028: as últimas notícias com os vínculos.
  latest: 'news:latest',
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
  // SPEC-015: estorno de um lançamento.
  reverse: 'portfolios:reverse',
  // SPEC-019: rentabilidade e evolução patrimonial.
  performance: 'portfolios:performance',
  // SPEC-022: comparação de 2 a 4 carteiras.
  comparison: 'portfolios:comparison',
  // SPEC-023: nova carteira a partir de outra.
  copy: 'portfolios:copy',
} as const;

/** SPEC-011: as tarefas de ingestão do colaborador (a tela Tarefas). */
export const TASK_CHANNELS = {
  list: 'tasks:list',
  runs: 'tasks:runs',
  errors: 'tasks:errors',
  request: 'tasks:request',
} as const;

/** SPEC-035: os idiomas do app. */
export type AppLanguage = 'pt-BR' | 'en';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'pt-BR' || value === 'en';
}

/**
 * SPEC-035: a interface avisa o processo principal do idioma, ao abrir e a cada troca, para o que
 * ele mesmo escreve (a página do login com Google e o nome do arquivo "Baixar meus dados").
 */
export const APP_CHANNELS = {
  setLanguage: 'app:set-language',
} as const;

/**
 * SPEC-032: a situação da conexão. A interface pergunta (`status`), pede uma conferência agora
 * (`retry`) e é avisada quando muda (`changed`).
 */
export const CONNECTION_CHANNELS = {
  status: 'connection:status',
  retry: 'connection:retry',
  changed: 'connection:changed',
} as const;

/**
 * O que o processo principal avisa: entrou em modo consulta; a conexão voltou (com o usuário
 * atualizado); ou a sessão foi recusada na volta e a cópia local foi apagada.
 */
export type ConnectionEvent =
  { status: 'offline' } | { status: 'online'; user: PublicUser } | { status: 'signed-out' };

/** Resultado de uma conferência da conexão. */
export type ReconnectResult = 'online' | 'offline' | 'signed-out';

/** Erros que a interface sabe traduzir. */
export type ClientAuthError =
  | AuthErrorCode
  | CalendarErrorCode
  | CatalogErrorCode
  | FundamentalsErrorCode
  | NewsErrorCode
  | PortfolioErrorCode
  | TaskErrorCode
  | 'server_unavailable'
  | 'invalid_url'
  | 'unexpected'
  | 'google_cancelled'
  /** SPEC-032: sem conexão, e esta leitura nunca foi aberta neste computador. */
  | 'not_saved_offline';

/** Dado do servidor para corrigir o pedido, como o saldo disponível (SPEC-013). */
export type ErrorDetails = Readonly<Record<string, string>>;

/** SPEC-032: `offline` quando o app abriu em modo consulta, com o usuário da cópia local. */
export type AuthResult =
  | { ok: true; user: PublicUser; offline?: true }
  | { ok: false; error: ClientAuthError; fields?: FieldErrors; details?: ErrorDetails };

/**
 * Resultado genérico das chamadas. SPEC-032: `savedAt` só quando o dado veio da cópia local, sem
 * conexão: é o horário em que o servidor o confirmou pela última vez.
 */
export type ClientResult<T> =
  | { ok: true; data: T; savedAt?: string }
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
