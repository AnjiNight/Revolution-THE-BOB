import {
  ASSET_PATHS,
  assetPath,
  AUTH_PATHS,
  CALENDAR_PATHS,
  calendarPath,
  FUNDAMENTALS_PATHS,
  INDEX_PATHS,
  isDividendPeriod,
  isPriceHistoryPeriod,
  parseCalendarYear,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  portfolioSubPath,
  PROFILE_PATHS,
  TERMS_VERSION,
  type AccountDeletionConfirmInput,
  type AccountDeletionRequestInput,
  type AssetDetail,
  type AssetDividends,
  type AssetFundamentals,
  type AssetSearchQuery,
  type AssetSearchResult,
  type AssetUpdateInput,
  type AuthErrorCode,
  type AuthSession,
  type CalendarErrorCode,
  type CalendarPublication,
  type CalendarSuggestion,
  type CatalogAsset,
  type CatalogErrorCode,
  type CatalogListResult,
  type CatalogQuery,
  type CdiStatus,
  type MarketIndexStatus,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type ConfirmEmailChangeInput,
  type ConsentList,
  type DividendPeriod,
  type EmailConfirmationInput,
  type EmailConfirmationResendInput,
  type FieldErrors,
  type FundamentalsErrorCode,
  type Investidor10Status,
  type LoginInput,
  type NewAssetInput,
  type CashEntryResult,
  type CashStatement,
  type NewCashEntryInput,
  type NewTradeInput,
  type PortfolioComparison,
  type PortfolioCopyResult,
  type PortfolioPerformance,
  type PortfolioPositions,
  type ReversalResult,
  type TradeQuote,
  type TradeResult,
  type NewPortfolioCopyInput,
  type NewPortfolioInput,
  type PasswordResetConfirmInput,
  type PasswordResetRequestInput,
  type PersonalDataExport,
  type Portfolio,
  type PortfolioErrorCode,
  type PortfolioList,
  type PriceHistory,
  type PriceHistoryPeriod,
  type PublicUser,
  type RegisterInput,
  type RenamePortfolioInput,
  type TokenPair,
  type TradingCalendarYear,
  type UpdateNameInput,
  type UserProfile,
} from '@simulador/shared';
import type {
  AuthResult,
  ClientAuthError,
  ClientResult,
  ConnectionEvent,
  ErrorDetails,
  ReconnectResult,
} from '../shared/auth-ipc.js';
import { MemoryOfflineCache, type OfflineCache, type SavedRead } from './offline-cache.js';
import type { SecretStore } from './secret-store.js';
import { validateServerUrl } from './server-health.js';

export interface AuthClientOptions {
  serverUrl: () => string;
  allowInsecureLocalhost: boolean;
  store: SecretStore;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** SPEC-032: cópia local das leituras do usuário (padrão: só na memória). */
  cache?: OfflineCache;
  /** SPEC-032: avisa quando o app entra em modo consulta, quando a conexão volta ou cai a sessão. */
  onConnectionChange?: (event: ConnectionEvent) => void;
  clock?: () => Date;
}

/**
 * SPEC-032: o modo consulta só abre se a sessão foi renovada há menos disso. É a validade do token
 * de renovação (SPEC-002): depois, a sessão já acabou no servidor.
 */
export const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Respostas da hospedagem com o servidor fora do ar ou hibernando: contam como sem conexão. */
const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

/** O que uma leitura trouxe do servidor: o corpo novo, ou "nada mudou" (304). */
type FreshRead = { notModified: true } | { notModified: false; text: string; etag: string | null };

const KNOWN_ERRORS: ReadonlyArray<
  AuthErrorCode | CalendarErrorCode | CatalogErrorCode | FundamentalsErrorCode | PortfolioErrorCode
> = [
  'validation_error',
  'email_in_use',
  'invalid_credentials',
  'invalid_refresh_token',
  'unauthorized',
  'rate_limited',
  'wrong_account_type',
  'terms_required',
  'google_login_unavailable',
  'google_token_invalid',
  'google_email_not_verified',
  'invalid_password',
  'email_change_not_allowed',
  'password_change_not_allowed',
  'invalid_reset_code',
  'password_reset_unavailable',
  'email_not_confirmed',
  'invalid_confirmation_code',
  'email_confirmation_unavailable',
  'deletion_not_allowed',
  'forbidden',
  'calendar_not_published',
  'ticker_in_use',
  'asset_not_found',
  'source_disabled',
  'portfolio_not_found',
  'portfolio_name_in_use',
  'portfolio_limit_reached',
  'insufficient_cash',
  'insufficient_position',
  'quote_changed',
  'market_closed',
  'no_quote_today',
  'asset_inactive',
  'historical_portfolio',
  'entry_not_found',
  'already_reversed',
  'reversal_window_closed',
  'reversal_breaks_cash',
  'reversal_breaks_position',
  'no_close_that_day',
  'history_pending',
];

class RequestFailed extends Error {
  constructor(
    readonly error: ClientAuthError,
    readonly fields?: FieldErrors,
    readonly details?: ErrorDetails,
    /** SPEC-032: sem rede, tempo esgotado ou servidor fora do ar (502, 503, 504). */
    readonly unreachable = false,
  ) {
    super(error);
  }
}

/** Servidor inalcançável: a tela vê `server_unavailable`, como antes; o app liga o modo consulta. */
function unreachable(): RequestFailed {
  return new RequestFailed('server_unavailable', undefined, undefined, true);
}

/**
 * Cliente de autenticação do processo principal (SPEC-002).
 * O token de acesso fica só na memória; o de renovação vai para o SecretStore (RNF08).
 *
 * SPEC-032: as leituras do usuário ficam numa cópia local; sem conexão, o app mostra essa cópia
 * (modo consulta) até a conexão voltar.
 */
export class AuthClient {
  private accessToken: string | null = null;
  private user: PublicUser | null = null;
  private refreshing: Promise<boolean> | null = null;
  private reconnecting: Promise<ReconnectResult> | null = null;
  private offline = false;
  /** Muda a cada saída: uma leitura que terminou depois dela não grava na cópia. */
  private generation = 0;
  private readonly cache: OfflineCache;

  constructor(private readonly options: AuthClientOptions) {
    this.cache = options.cache ?? new MemoryOfflineCache();
  }

  /** SPEC-032: o app está em modo consulta. */
  get isOffline(): boolean {
    return this.offline;
  }

  /**
   * Ao abrir o app: usa o token de renovação guardado para entrar sem pedir senha. SPEC-032: com
   * o servidor inalcançável, abre em modo consulta, se a cópia local permitir.
   */
  async restore(): Promise<AuthResult> {
    if (this.user) {
      return this.offline
        ? { ok: true, user: this.user, offline: true }
        : { ok: true, user: this.user };
    }
    const stored = await this.options.store.load();
    if (!stored) {
      // Sem sessão não há cópia local (uma que tenha sobrado é apagada).
      await this.cache.clear();
      return { ok: false, error: 'unauthorized' };
    }
    try {
      if (!(await this.refresh())) return { ok: false, error: 'unauthorized' };
      return await this.loadCurrentUser();
    } catch (error) {
      if (error instanceof RequestFailed && error.unreachable) {
        const offline = await this.openOffline();
        if (offline) return offline;
      }
      return failure(error);
    }
  }

  /**
   * SPEC-032: o servidor voltou a responder (conferência a cada 30 s ou "Tentar agora"). Renova a
   * sessão e sai do modo consulta; com a sessão recusada, apaga tudo deste computador.
   */
  reconnect(): Promise<ReconnectResult> {
    this.reconnecting ??= this.doReconnect().finally(() => {
      this.reconnecting = null;
    });
    return this.reconnecting;
  }

  /** SPEC-039: a conta nasce pendente e não abre sessão; o código vai para o e-mail. */
  register(input: RegisterInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.request('POST', AUTH_PATHS.register, input);
      return null;
    });
  }

  /** SPEC-039: código certo libera a conta e abre a sessão neste dispositivo. */
  confirmEmail(input: EmailConfirmationInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.emailConfirmationConfirm, input);
  }

  /** SPEC-039: "Reenviar código". O servidor responde igual exista a conta pendente ou não. */
  resendConfirmation(input: EmailConfirmationResendInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.request('POST', AUTH_PATHS.emailConfirmationResend, input);
      return null;
    });
  }

  login(input: LoginInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.login, input);
  }

  /** Área do colaborador: só aceita contas criadas pela equipe (SPEC-002 §4). */
  collaboratorLogin(input: LoginInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.collaboratorLogin, input);
  }

  /** DA24: envia ao servidor o ID token obtido do Google. */
  loginWithGoogle(idToken: string, acceptedTerms?: boolean): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.google, {
      idToken,
      ...(acceptedTerms ? { acceptedTerms: true } : {}),
    });
  }

  /**
   * Encerra a sessão no servidor (melhor esforço) e apaga tudo do dispositivo, inclusive a cópia
   * local (SPEC-032). Em modo consulta, não espera o aviso ao servidor, que dificilmente chega.
   */
  async logout(): Promise<void> {
    const refreshToken = await this.options.store.load();
    const wasOffline = this.offline;
    await this.forget();
    if (refreshToken) {
      const notice = this.request('POST', AUTH_PATHS.logout, { refreshToken }).catch(
        () => undefined,
      );
      if (!wasOffline) await notice;
    }
  }

  // --- Recuperação de senha (SPEC-004): sem sessão, a pessoa ainda não entrou ---

  /** Pede o código. O servidor responde igual exista a conta ou não. */
  requestPasswordReset(input: PasswordResetRequestInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.request('POST', AUTH_PATHS.passwordResetRequest, input);
      return null;
    });
  }

  /** Troca a senha com o código. Não abre sessão: a pessoa entra depois, com a senha nova. */
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.request('POST', AUTH_PATHS.passwordResetConfirm, input);
      return null;
    });
  }

  // --- Perfil (SPEC-003) ---

  getProfile(): Promise<ClientResult<UserProfile>> {
    return this.read<{ user: UserProfile }, UserProfile>(
      () => PROFILE_PATHS.profile,
      (body) => body.user,
    );
  }

  updateName(input: UpdateNameInput): Promise<ClientResult<UserProfile>> {
    return this.call(() => this.updateProfile('PATCH', PROFILE_PATHS.profile, input));
  }

  /** SPEC-039: o e-mail ainda não muda; o servidor manda um código para o endereço novo. */
  changeEmail(input: ChangeEmailInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.authorizedRequest('PUT', PROFILE_PATHS.email, input);
      return null;
    });
  }

  // --- Dados pessoais (SPEC-034) ---

  /** Tudo o que o servidor guarda sobre a pessoa, para salvar em arquivo. */
  exportData(): Promise<ClientResult<PersonalDataExport>> {
    return this.call(() => this.authorizedRequest<PersonalDataExport>('GET', PROFILE_PATHS.export));
  }

  /** Manda o código de exclusão para o e-mail da conta. */
  requestDeletion(input: AccountDeletionRequestInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.authorizedRequest('POST', PROFILE_PATHS.deletionRequest, input);
      return null;
    });
  }

  /**
   * Código certo apaga a conta no servidor; aqui, apaga a sessão guardada no dispositivo e a cópia
   * local (SPEC-032).
   */
  confirmDeletion(input: AccountDeletionConfirmInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.authorizedRequest('POST', PROFILE_PATHS.deletionConfirm, input);
      await this.forget();
      return null;
    });
  }

  /** SPEC-039: código certo troca o e-mail da conta. */
  confirmEmailChange(input: ConfirmEmailChangeInput): Promise<ClientResult<UserProfile>> {
    return this.call(() => this.updateProfile('POST', PROFILE_PATHS.emailConfirm, input));
  }

  /** O servidor encerra todas as sessões e devolve uma nova, que passa a ser a deste dispositivo. */
  changePassword(input: ChangePasswordInput): Promise<ClientResult<null>> {
    return this.call(async () => {
      const session = await this.authorizedRequest<AuthSession>(
        'PUT',
        PROFILE_PATHS.password,
        input,
      );
      await this.options.store.save(session.refreshToken);
      this.accessToken = session.accessToken;
      this.user = session.user;
      await this.adoptCache();
      return null;
    });
  }

  listConsents(): Promise<ClientResult<ConsentList>> {
    return this.read<ConsentList>(() => PROFILE_PATHS.consents);
  }

  acceptTerms(): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.authorizedRequest('POST', PROFILE_PATHS.consents, {
        type: 'terms',
        version: TERMS_VERSION,
      });
      return null;
    });
  }

  // --- Calendário de pregão (SPEC-005) ---

  /** Qualquer pessoa conectada: ano não publicado vem com `published: false`. */
  /** SPEC-012: carteiras do usuário, da mais recente para a mais antiga. */
  listPortfolios(): Promise<ClientResult<PortfolioList>> {
    return this.read<PortfolioList>(() => PORTFOLIO_PATHS.list);
  }

  createPortfolio(input: NewPortfolioInput): Promise<ClientResult<Portfolio>> {
    return this.call(async () => {
      const body = await this.authorizedRequest<{ portfolio: Portfolio }>(
        'POST',
        PORTFOLIO_PATHS.list,
        input,
      );
      return body.portfolio;
    });
  }

  getPortfolio(id: string): Promise<ClientResult<Portfolio>> {
    return this.read<{ portfolio: Portfolio }, Portfolio>(
      () => portfolioUrl(id),
      (body) => body.portfolio,
    );
  }

  renamePortfolio(id: string, input: RenamePortfolioInput): Promise<ClientResult<Portfolio>> {
    return this.call(async () => {
      const body = await this.authorizedRequest<{ portfolio: Portfolio }>(
        'PATCH',
        portfolioUrl(id),
        { name: input.name },
      );
      return body.portfolio;
    });
  }

  deletePortfolio(id: string): Promise<ClientResult<null>> {
    return this.call(async () => {
      await this.authorizedRequest<undefined>('DELETE', portfolioUrl(id));
      return null;
    });
  }

  /** SPEC-013: saldo e extrato, do mais recente ao mais antigo, a partir de `offset`. */
  cashStatement(id: string, offset = 0): Promise<ClientResult<CashStatement>> {
    return this.read<CashStatement>(() => portfolioCashUrl(id, offset));
  }

  /** SPEC-013: aporte ou retirada; `insufficient_cash` traz `details.available`. */
  addCashEntry(id: string, input: NewCashEntryInput): Promise<ClientResult<CashEntryResult>> {
    return this.call(() =>
      this.authorizedRequest<CashEntryResult>('POST', portfolioCashUrl(id), {
        type: input.type,
        amount: input.amount,
        ...(input.date ? { date: input.date } : {}),
      }),
    );
  }

  /** SPEC-014: posições da carteira, com o caixa e o total. */
  portfolioPositions(id: string): Promise<ClientResult<PortfolioPositions>> {
    return this.read<PortfolioPositions>(() => portfolioRouteUrl(PORTFOLIO_PATHS.positions, id));
  }

  /**
   * SPEC-019: rentabilidade no período. Só um período conhecido ou duas datas AAAA-MM-DD vão para a
   * query string; o resto é o servidor que confere.
   */
  portfolioPerformance(id: string, query: unknown): Promise<ClientResult<PortfolioPerformance>> {
    return this.read<PortfolioPerformance>(() => {
      const record = (query ?? {}) as Record<string, unknown>;
      const params = new URLSearchParams();
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (typeof record.period === 'string' && /^[a-z0-9]{1,4}$/.test(record.period)) {
        params.set('period', record.period);
      }
      for (const key of ['from', 'to'] as const) {
        const value = record[key];
        if (typeof value === 'string' && day.test(value)) params.set(key, value);
      }
      const path = portfolioRouteUrl(PORTFOLIO_PATHS.performance, id);
      return `${path}?${params.toString()}`;
    });
  }

  /**
   * SPEC-022: a comparação de 2 a 4 carteiras. Só ids de carteira, um período conhecido ou duas
   * datas AAAA-MM-DD vão para a query string; quantos e quais, o servidor confere.
   */
  portfolioComparison(query: unknown): Promise<ClientResult<PortfolioComparison>> {
    return this.read<PortfolioComparison>(() => {
      const record = (query ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(record.ids) ? record.ids : [];
      if (!ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) {
        throw new RequestFailed('unexpected');
      }
      const params = new URLSearchParams({ ids: ids.join(',') });
      if (typeof record.period === 'string' && /^[a-z0-9]{1,6}$/.test(record.period)) {
        params.set('period', record.period);
      }
      for (const key of ['from', 'to'] as const) {
        const value = record[key];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) params.set(key, value);
      }
      return `${PORTFOLIO_PATHS.comparison}?${params.toString()}`;
    });
  }

  /** SPEC-014: o preço que a negociação usaria agora, ou o motivo de não dar. */
  tradeQuote(id: string, assetId: string, date?: string): Promise<ClientResult<TradeQuote>> {
    return this.call(() => {
      if (typeof assetId !== 'string' || !UUID_PATTERN.test(assetId)) {
        throw new RequestFailed('unexpected');
      }
      // SPEC-016: na histórica, a data da negociação (só AAAA-MM-DD entra na query string).
      const query = new URLSearchParams({ assetId });
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) query.set('date', date);
      const path = portfolioRouteUrl(PORTFOLIO_PATHS.tradeQuote, id);
      return this.authorizedRequest<TradeQuote>('GET', path + '?' + query.toString());
    });
  }

  /** SPEC-014: compra ou venda; os erros trazem o detalhe (disponível, posição, preço novo). */
  trade(id: string, input: NewTradeInput): Promise<ClientResult<TradeResult>> {
    return this.call(() =>
      this.authorizedRequest<TradeResult>('POST', portfolioRouteUrl(PORTFOLIO_PATHS.trades, id), {
        type: input.type,
        assetId: input.assetId,
        quantity: input.quantity,
        // Ao vivo, o horário da cotação vista; na histórica (SPEC-016), a data.
        ...(input.quotedAt ? { quotedAt: input.quotedAt } : {}),
        ...(input.date ? { date: input.date } : {}),
      }),
    );
  }

  /** SPEC-015: estorna um lançamento; a recusa traz em details o lançamento que quebraria. */
  reverseEntry(id: string, entryId: string): Promise<ClientResult<ReversalResult>> {
    return this.call(() => {
      if (typeof entryId !== 'string' || !UUID_PATTERN.test(entryId)) {
        throw new RequestFailed('unexpected');
      }
      return this.authorizedRequest<ReversalResult>(
        'POST',
        portfolioRouteUrl(PORTFOLIO_PATHS.reversals, id),
        { entryId },
      );
    });
  }

  /** SPEC-023: nova carteira a partir desta; `copy_breaks_cash` traz em details a retirada. */
  copyPortfolio(
    id: string,
    input: NewPortfolioCopyInput,
  ): Promise<ClientResult<PortfolioCopyResult>> {
    return this.call(() =>
      this.authorizedRequest<PortfolioCopyResult>(
        'POST',
        portfolioRouteUrl(PORTFOLIO_PATHS.copies, id),
        input,
      ),
    );
  }

  /** Colaborador (SPEC-007): até que dia a série do CDI está carregada e a última atualização. */
  cdiStatus(): Promise<ClientResult<CdiStatus>> {
    return this.call(() => this.authorizedRequest<CdiStatus>('GET', INDEX_PATHS.cdi));
  }

  /** Colaborador (SPEC-020): até que dia o Ibovespa e o IFIX estão carregados. */
  marketIndexStatus(): Promise<ClientResult<MarketIndexStatus>> {
    return this.call(() =>
      this.authorizedRequest<MarketIndexStatus>('GET', INDEX_PATHS.marketIndexes),
    );
  }

  getCalendar(year: number): Promise<ClientResult<TradingCalendarYear>> {
    return this.call(() =>
      this.authorizedRequest<TradingCalendarYear>('GET', calendarUrl(CALENDAR_PATHS.year, year)),
    );
  }

  /** Colaborador: sugestão do ano para conferir com a B3. */
  calendarSuggestion(year: number): Promise<ClientResult<CalendarSuggestion>> {
    return this.call(() =>
      this.authorizedRequest<CalendarSuggestion>(
        'GET',
        calendarUrl(CALENDAR_PATHS.suggestion, year),
      ),
    );
  }

  /** Colaborador: publica a lista inteira do ano, substituindo a anterior. */
  publishCalendar(
    year: number,
    input: CalendarPublication,
  ): Promise<ClientResult<TradingCalendarYear>> {
    return this.call(() =>
      this.authorizedRequest<TradingCalendarYear>(
        'PUT',
        calendarUrl(CALENDAR_PATHS.publish, year),
        input,
      ),
    );
  }

  // --- Catálogo de ativos (SPEC-006) ---

  /** Qualquer pessoa conectada: só ativos ativos, até 50. */
  searchAssets(query: AssetSearchQuery): Promise<ClientResult<AssetSearchResult>> {
    return this.call(() =>
      this.authorizedRequest<AssetSearchResult>('GET', withQuery(ASSET_PATHS.search, query)),
    );
  }

  /** SPEC-010: ficha do ativo para qualquer pessoa conectada, também de ativo desativado. */
  assetDetail(id: string): Promise<ClientResult<AssetDetail>> {
    return this.read<AssetDetail>(() => assetUrl(ASSET_PATHS.detail, id));
  }

  /**
   * SPEC-010: fechamentos do período, com o resumo e os saltos. SPEC-042: ajustados pelos eventos
   * corporativos, ou como a B3 publicou (`adjusted: false`).
   */
  assetHistory(
    id: string,
    period: PriceHistoryPeriod,
    adjusted = true,
  ): Promise<ClientResult<PriceHistory>> {
    return this.read<PriceHistory>(() => {
      // O período vem da interface: só um dos cinco entra na query string.
      if (!isPriceHistoryPeriod(period)) throw new RequestFailed('unexpected');
      return `${assetUrl(ASSET_PATHS.history, id)}?period=${period}&adjusted=${adjusted === false ? 'false' : 'true'}`;
    });
  }

  /** SPEC-041: indicadores do Investidor10 (com autorização, só neste projeto acadêmico). */
  assetFundamentals(id: string): Promise<ClientResult<AssetFundamentals>> {
    return this.read<AssetFundamentals>(() => assetUrl(FUNDAMENTALS_PATHS.fundamentals, id));
  }

  /** SPEC-042: proventos do período (12 meses, 5 anos ou tudo). */
  assetDividends(id: string, period: DividendPeriod): Promise<ClientResult<AssetDividends>> {
    return this.read<AssetDividends>(() => {
      if (!isDividendPeriod(period)) throw new RequestFailed('unexpected');
      return `${assetUrl(FUNDAMENTALS_PATHS.dividends, id)}?period=${period}`;
    });
  }

  /** Colaborador (SPEC-041): situação da coleta do Investidor10. */
  investidor10Status(): Promise<ClientResult<Investidor10Status>> {
    return this.call(() =>
      this.authorizedRequest<Investidor10Status>('GET', FUNDAMENTALS_PATHS.collection),
    );
  }

  /** Colaborador: todos os ativos que passam nos filtros, inclusive desativados. */
  assetCatalog(query: CatalogQuery): Promise<ClientResult<CatalogListResult>> {
    return this.call(() =>
      this.authorizedRequest<CatalogListResult>('GET', withQuery(ASSET_PATHS.catalog, query)),
    );
  }

  createAsset(input: NewAssetInput): Promise<ClientResult<CatalogAsset>> {
    return this.call(async () => {
      const { asset } = await this.authorizedRequest<{ asset: CatalogAsset }>(
        'POST',
        ASSET_PATHS.catalog,
        input,
      );
      return asset;
    });
  }

  updateAsset(id: string, input: AssetUpdateInput): Promise<ClientResult<CatalogAsset>> {
    return this.call(() => this.assetAction('PATCH', ASSET_PATHS.asset, id, input));
  }

  deactivateAsset(id: string): Promise<ClientResult<CatalogAsset>> {
    return this.call(() => this.assetAction('POST', ASSET_PATHS.deactivate, id));
  }

  reactivateAsset(id: string): Promise<ClientResult<CatalogAsset>> {
    return this.call(() => this.assetAction('POST', ASSET_PATHS.reactivate, id));
  }

  /** SPEC-040: o colaborador confere a classificação sugerida pela importação. */
  confirmAssetClassification(id: string): Promise<ClientResult<CatalogAsset>> {
    return this.call(() => this.assetAction('POST', ASSET_PATHS.confirmClassification, id));
  }

  /**
   * SPEC-040: logo do ativo como `data:` URL, porque a tela só mostra imagens do próprio app (CSP).
   * `null` quando o ativo não tem logo próprio.
   */
  assetLogo(id: string): Promise<ClientResult<string | null>> {
    return this.read<string | null>(() => assetUrl(ASSET_PATHS.logo, id), undefined, 'image');
  }

  private async assetAction(
    method: string,
    path: string,
    id: string,
    body?: unknown,
  ): Promise<CatalogAsset> {
    const { asset } = await this.authorizedRequest<{ asset: CatalogAsset }>(
      method,
      assetUrl(path, id),
      body,
    );
    return asset;
  }

  private async updateProfile(method: string, path: string, body: unknown): Promise<UserProfile> {
    const { user } = await this.authorizedRequest<{ user: UserProfile }>(method, path, body);
    this.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return user;
  }

  private async call<T>(action: () => Promise<T>): Promise<ClientResult<T>> {
    try {
      return { ok: true, data: await action() };
    } catch (error) {
      return this.failed(error);
    }
  }

  /**
   * SPEC-032: uma leitura que a tela mostra. Com conexão, pergunta ao servidor com o ETag guardado
   * e guarda o que vier; sem conexão, devolve a cópia local com a data dela (`savedAt`).
   */
  private async read<T, R = T>(
    path: () => string,
    pick: (body: T) => R = (body) => body as unknown as R,
    kind: 'json' | 'image' = 'json',
  ): Promise<ClientResult<R>> {
    try {
      const { body, savedAt } = await this.cachedRead<T>(path(), kind);
      const data = pick(body);
      return savedAt === undefined ? { ok: true, data } : { ok: true, data, savedAt };
    } catch (error) {
      return this.failed(error);
    }
  }

  private failed<T>(error: unknown): ClientResult<T> {
    if (error instanceof RequestFailed && error.unreachable) this.goOffline();
    const result = failure(error);
    return result.ok ? { ok: false, error: 'unexpected' } : result;
  }

  private async cachedRead<T>(
    path: string,
    kind: 'json' | 'image',
  ): Promise<{ body: T; savedAt?: string }> {
    const fresh = (etag: string | null) =>
      this.authorized((token) =>
        kind === 'json' ? this.conditionalGet(path, etag, token) : this.logoGet(path, etag, token),
      );
    // O colaborador (e quem ainda não entrou) não tem cópia local: vai direto ao servidor.
    if (!this.caching) {
      const answer = await fresh(null);
      if (answer.notModified) throw new RequestFailed('unexpected');
      return { body: parse<T>(answer.text) };
    }

    const key = `GET ${path}`;
    const generation = this.generation;
    const saved = await this.cache.get(key);
    // Em modo consulta, a cópia responde na hora; a volta da conexão é com a conferência.
    if (this.offline) return fromSaved<T>(saved);
    try {
      const answer = await fresh(saved?.etag ?? null);
      const savedAt = this.now().toISOString();
      // Depois de uma saída (ou de outra pessoa entrar), o que chegou não é mais desta cópia.
      const current = generation === this.generation;
      if (answer.notModified) {
        if (!saved) throw new RequestFailed('unexpected');
        if (current) await this.cache.put(key, { ...saved, savedAt });
        return { body: parse<T>(saved.body) };
      }
      const body = parse<T>(answer.text);
      if (current) await this.cache.put(key, { body: answer.text, etag: answer.etag, savedAt });
      return { body };
    } catch (error) {
      if (!(error instanceof RequestFailed) || !error.unreachable) throw error;
      this.goOffline();
      return fromSaved<T>(saved);
    }
  }

  /** Só a conta de usuário tem cópia local e modo consulta (SPEC-032 §3.2). */
  private get caching(): boolean {
    return this.user?.role === 'user';
  }

  private goOffline(): void {
    if (this.offline || !this.caching) return;
    this.offline = true;
    this.options.onConnectionChange?.({ status: 'offline' });
  }

  /**
   * Abre em modo consulta com o usuário da cópia local: só uma conta de usuário, e só se a sessão
   * foi renovada há menos de 30 dias (depois disso, ela já acabou no servidor).
   */
  private async openOffline(): Promise<AuthResult | null> {
    const owner = await this.cache.owner();
    if (!owner || owner.user.role !== 'user') return null;
    const renewed = Date.parse(owner.renewedAt);
    if (!Number.isFinite(renewed) || this.now().getTime() - renewed >= OFFLINE_MAX_AGE_MS) {
      return null;
    }
    this.user = owner.user;
    this.offline = true;
    this.options.onConnectionChange?.({ status: 'offline' });
    return { ok: true, user: owner.user, offline: true };
  }

  private async doReconnect(): Promise<ReconnectResult> {
    if (!this.offline) return this.user ? 'online' : 'signed-out';
    try {
      if (!(await this.refresh())) {
        // Sessão recusada: nada fica neste computador (o cofre e a cópia local).
        await this.forget();
        this.options.onConnectionChange?.({ status: 'signed-out' });
        return 'signed-out';
      }
      const { user } = await this.request<{ user: PublicUser }>(
        'GET',
        AUTH_PATHS.me,
        undefined,
        this.accessToken,
      );
      this.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      await this.adoptCache();
      this.offline = false;
      this.options.onConnectionChange?.({ status: 'online', user: this.user });
      return 'online';
    } catch {
      return 'offline';
    }
  }

  /** A cópia local passa a ser deste usuário, renovado agora; colaborador não tem cópia. */
  private async adoptCache(): Promise<void> {
    if (!this.user) return;
    if (this.user.role !== 'user') return this.cache.clear();
    await this.cache.adopt(this.user, this.now());
  }

  /** Esquece a sessão: tokens, usuário, o cofre e a cópia local (SPEC-032 §4.2). */
  private async forget(): Promise<void> {
    this.generation += 1;
    this.accessToken = null;
    this.user = null;
    this.offline = false;
    const cleared = this.cache.clear();
    await this.options.store.clear();
    await cleared;
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  /** Requisição autenticada; renova a sessão uma vez se o token de acesso tiver expirado (RF02). */
  async authorizedRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.authorized((token) => this.request<T>(method, path, body, token));
  }

  private async authorized<T>(attempt: (accessToken: string | null) => Promise<T>): Promise<T> {
    try {
      return await attempt(this.accessToken);
    } catch (error) {
      if (!(error instanceof RequestFailed) || error.error !== 'unauthorized') throw error;
      if (!(await this.refresh())) throw error;
      return attempt(this.accessToken);
    }
  }

  private async startSession(path: string, input: unknown): Promise<AuthResult> {
    try {
      const session = await this.request<AuthSession>('POST', path, input);
      await this.options.store.save(session.refreshToken);
      this.accessToken = session.accessToken;
      this.user = session.user;
      this.offline = false;
      await this.adoptCache();
      return { ok: true, user: session.user };
    } catch (error) {
      return failure(error);
    }
  }

  private async loadCurrentUser(): Promise<AuthResult> {
    const { user } = await this.authorizedRequest<{ user: PublicUser }>('GET', AUTH_PATHS.me);
    this.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    await this.adoptCache();
    return { ok: true, user: this.user };
  }

  /** Troca o token de renovação; uma única troca por vez, mesmo com várias chamadas juntas. */
  private refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.options.store.load();
    if (!refreshToken) return false;
    try {
      const pair = await this.request<TokenPair>('POST', AUTH_PATHS.refresh, { refreshToken });
      await this.options.store.save(pair.refreshToken);
      this.accessToken = pair.accessToken;
      // SPEC-032: a última renovação conta o prazo do modo consulta.
      await this.adoptCache();
      return true;
    } catch (error) {
      if (error instanceof RequestFailed && error.error === 'invalid_refresh_token') {
        await this.forget();
        return false;
      }
      throw error;
    }
  }

  /** Leitura com o ETag guardado: o servidor responde 304 quando nada mudou (RNF19). */
  private async conditionalGet(
    path: string,
    etag: string | null,
    accessToken: string | null,
  ): Promise<FreshRead> {
    const response = await this.send('GET', path, {
      accessToken,
      ...(etag ? { headers: { 'if-none-match': etag } } : {}),
    });
    if (response.status === 304) return { notModified: true };
    if (response.ok) {
      const text = await response.text();
      try {
        if (JSON.parse(text) === null) throw new Error('vazio');
      } catch {
        throw new RequestFailed('unexpected');
      }
      return { notModified: false, text, etag: response.headers.get('etag') };
    }
    await this.parse(response);
    throw new RequestFailed('unexpected');
  }

  /**
   * Baixa o logo do servidor; só SVG ou PNG de até 100 KB viram `data:` URL. Sem logo próprio (404
   * ou outro tipo), `null`, que também fica guardado.
   */
  private async logoGet(
    path: string,
    etag: string | null,
    accessToken: string | null,
  ): Promise<FreshRead> {
    const response = await this.send('GET', path, {
      accessToken,
      accept: 'image/svg+xml, image/png',
      ...(etag ? { headers: { 'if-none-match': etag } } : {}),
    });
    if (response.status === 304) return { notModified: true };
    if (response.status === 401) throw new RequestFailed('unauthorized');
    const none: FreshRead = { notModified: false, text: 'null', etag: null };
    if (response.status === 404) return none;
    if (!response.ok) {
      throw new RequestFailed(response.status >= 500 ? 'server_unavailable' : 'unexpected');
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (type !== 'image/svg+xml' && type !== 'image/png') return none;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return none;
    return {
      notModified: false,
      text: JSON.stringify(`data:${type};base64,${bytes.toString('base64')}`),
      etag: response.headers.get('etag'),
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    accessToken?: string | null,
  ): Promise<T> {
    const response = await this.send(method, path, {
      ...(body !== undefined ? { body } : {}),
      accessToken: accessToken ?? null,
    });
    return this.parse<T>(response);
  }

  /**
   * Manda o pedido. Sem rede, tempo esgotado e 502/503/504 (a hospedagem com o servidor fora do
   * ar) viram servidor inalcançável (SPEC-032); um 500 continua sendo um erro do servidor.
   */
  private async send(
    method: string,
    path: string,
    init: {
      body?: unknown;
      accessToken: string | null;
      accept?: string;
      headers?: Record<string, string>;
    },
  ): Promise<Response> {
    const base = validateServerUrl(this.options.serverUrl(), this.options.allowInsecureLocalhost);
    if (!base) throw new RequestFailed('invalid_url');

    const headers: Record<string, string> = {
      accept: init.accept ?? 'application/json',
      ...init.headers,
    };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.accessToken) headers.authorization = `Bearer ${init.accessToken}`;

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(new URL(path, base), {
        method,
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw unreachable();
    }
    if (UNREACHABLE_STATUSES.has(response.status)) throw unreachable();
    return response;
  }

  private async parse<T>(response: Response): Promise<T> {
    // 202 (pedido aceito) e 204 (feito) não têm corpo.
    if (response.status === 202 || response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && json) return json as T;

    const code = json?.error as AuthErrorCode | undefined;
    if (code && KNOWN_ERRORS.includes(code)) {
      throw new RequestFailed(
        code,
        json?.fields as FieldErrors | undefined,
        stringRecord(json?.details),
      );
    }
    throw new RequestFailed(response.status >= 500 ? 'server_unavailable' : 'unexpected');
  }
}

/** O corpo guardado ou recebido, já conferido como JSON. */
function parse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestFailed('unexpected');
  }
}

/** SPEC-032: sem conexão, a cópia local; sem cópia, "ainda não consultado neste computador". */
function fromSaved<T>(saved: SavedRead | null): { body: T; savedAt: string } {
  if (!saved) throw new RequestFailed('not_saved_offline');
  try {
    return { body: JSON.parse(saved.body) as T, savedAt: saved.savedAt };
  } catch {
    throw new RequestFailed('not_saved_offline');
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O servidor só guarda logos de até 100 KB (SPEC-040); maior que isso não é logo. */
const MAX_LOGO_BYTES = 100 * 1024;

/** O id vem da interface: só um UUID entra no caminho da rota. */
function assetUrl(path: string, id: string): string {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new RequestFailed('unexpected');
  return assetPath(path, id);
}

/** Filtros da busca na query string; vazios (e o `offset` zero) ficam de fora. */
function withQuery(path: string, query: AssetSearchQuery | CatalogQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
    // "Mostrar mais": só um inteiro positivo entra na query string.
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

/** O id da carteira vem da interface: só um UUID entra no caminho da rota. */
function portfolioUrl(id: string): string {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new RequestFailed('unexpected');
  return portfolioPath(id);
}

/** O id da carteira vem da interface: só um UUID entra no caminho das rotas da SPEC-014. */
function portfolioRouteUrl(path: string, id: string): string {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new RequestFailed('unexpected');
  return portfolioSubPath(path, id);
}

/** O ano vem da interface: só um ano aceito entra no caminho da rota. */
function calendarUrl(path: string, year: number): string {
  const checked = parseCalendarYear(String(year));
  if (checked === null) throw new RequestFailed('unexpected');
  return calendarPath(path, checked);
}

function failure(error: unknown): AuthResult {
  if (error instanceof RequestFailed) {
    return {
      ok: false,
      error: error.error,
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return { ok: false, error: 'unexpected' };
}

/** `details` do corpo de erro: só um objeto de textos passa adiante (SPEC-013). */
function stringRecord(value: unknown): ErrorDetails | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** O id da carteira vem da interface: só um UUID entra no caminho da rota do caixa. */
function portfolioCashUrl(id: string, offset = 0): string {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new RequestFailed('unexpected');
  const path = portfolioCashPath(id);
  return Number.isSafeInteger(offset) && offset > 0 ? `${path}?offset=${offset}` : path;
}
