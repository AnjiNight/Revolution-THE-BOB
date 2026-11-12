import type {
  AssetDetail,
  AssetDividends,
  AssetFundamentals,
  AssetSearchResult,
  CalendarSuggestion,
  CashEntryResult,
  CashStatement,
  ComparisonQuery,
  PerformanceQuery,
  PortfolioComparison,
  PortfolioPerformance,
  PortfolioPositions,
  ReversalResult,
  TradeQuote,
  TradeResult,
  CatalogAsset,
  CatalogListResult,
  CdiStatus,
  MarketIndexStatus,
  ConsentList,
  DividendPeriod,
  Investidor10Status,
  Portfolio,
  PortfolioList,
  PriceHistory,
  PriceHistoryPeriod,
  TradingCalendarYear,
  UserProfile,
} from '@simulador/shared';
import type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AssetSearchQuery,
  AssetUpdateInput,
  AuthResult,
  CalendarPublication,
  CatalogQuery,
  ChangeEmailInput,
  ChangePasswordInput,
  ClientResult,
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
  /**
   * Indexadores (SPEC-007) e índices da B3 (SPEC-020): situação das séries, só colaborador (403
   * para usuário).
   */
  indexes: {
    cdi(): Promise<ClientResult<CdiStatus>>;
    market(): Promise<ClientResult<MarketIndexStatus>>;
  };
  /** Carteiras (SPEC-012): só a conta de usuário; carteira de outra pessoa é `portfolio_not_found`. */
  portfolios: {
    list(): Promise<ClientResult<PortfolioList>>;
    create(input: NewPortfolioInput): Promise<ClientResult<Portfolio>>;
    get(id: string): Promise<ClientResult<Portfolio>>;
    rename(id: string, input: RenamePortfolioInput): Promise<ClientResult<Portfolio>>;
    /** Apaga a carteira e os lançamentos dela, sem volta. */
    delete(id: string): Promise<ClientResult<null>>;
    /** SPEC-013: saldo e extrato, 100 por vez a partir de `offset` ("Mostrar mais"). */
    cash(id: string, offset?: number): Promise<ClientResult<CashStatement>>;
    /** SPEC-013: aporte ou retirada; `insufficient_cash` traz `details.available`. */
    addCash(id: string, input: NewCashEntryInput): Promise<ClientResult<CashEntryResult>>;
    /** SPEC-014: posições, com o caixa e o total. */
    positions(id: string): Promise<ClientResult<PortfolioPositions>>;
    /** SPEC-014: o preço que a negociação usaria agora, ou o motivo de não dar. */
    /** SPEC-016: na histórica, com a data da negociação. */
    tradeQuote(id: string, assetId: string, date?: string): Promise<ClientResult<TradeQuote>>;
    /** SPEC-014: compra ou venda; os erros trazem o detalhe em details. */
    trade(id: string, input: NewTradeInput): Promise<ClientResult<TradeResult>>;
    /** SPEC-015: estorna um lançamento; a recusa traz em details o lançamento que quebraria. */
    reverse(id: string, entryId: string): Promise<ClientResult<ReversalResult>>;
    /** SPEC-019: rentabilidade e evolução patrimonial no período (`period` ou `from` e `to`). */
    performance(id: string, query: PerformanceQuery): Promise<ClientResult<PortfolioPerformance>>;
    /** SPEC-022: de 2 a 4 carteiras no mesmo período, na ordem escolhida. */
    comparison(query: ComparisonQuery): Promise<ClientResult<PortfolioComparison>>;
  };
  /**
   * Indicadores (SPEC-041) e proventos (SPEC-042) do Investidor10, com autorização só neste projeto
   * acadêmico. `source_disabled` quando a coleta foi desligada. A situação da coleta: só colaborador.
   */
  fundamentals: {
    get(id: string): Promise<ClientResult<AssetFundamentals>>;
    dividends(id: string, period: DividendPeriod): Promise<ClientResult<AssetDividends>>;
    collection(): Promise<ClientResult<Investidor10Status>>;
  };
  /**
   * Catálogo de ativos (SPECs 006, 010 e 040). Busca, ficha e logos para todos; o resto só
   * colaborador (403 para usuário).
   */
  assets: {
    /** Só ativos ativos, até 50 (`hasMore` avisa que há mais). */
    search(query: AssetSearchQuery): Promise<ClientResult<AssetSearchResult>>;
    /** SPEC-010: ficha do ativo, também de ativo desativado. */
    detail(id: string): Promise<ClientResult<AssetDetail>>;
    /**
     * SPEC-010: fechamentos do período, com o resumo e os saltos. SPEC-042: ajustados pelos
     * eventos corporativos (padrão) ou como a B3 publicou.
     */
    history(
      id: string,
      period: PriceHistoryPeriod,
      adjusted?: boolean,
    ): Promise<ClientResult<PriceHistory>>;
    catalog(query: CatalogQuery): Promise<ClientResult<CatalogListResult>>;
    create(input: NewAssetInput): Promise<ClientResult<CatalogAsset>>;
    /** Só o que muda; a classe nunca (RB22). */
    update(id: string, input: AssetUpdateInput): Promise<ClientResult<CatalogAsset>>;
    deactivate(id: string): Promise<ClientResult<CatalogAsset>>;
    reactivate(id: string): Promise<ClientResult<CatalogAsset>>;
    /** SPEC-040: confere a classificação sugerida pela importação. */
    confirmClassification(id: string): Promise<ClientResult<CatalogAsset>>;
    /** SPEC-040: logo como `data:` URL; `null` sem logo próprio. */
    logo(id: string): Promise<ClientResult<string | null>>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
