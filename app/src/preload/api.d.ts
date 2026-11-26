import type {
  AssetDetail,
  AssetDividends,
  AssetFundamentals,
  AssetNewsDays,
  AssetNewsPage,
  AssetNewsQuery,
  AssetSearchResult,
  CalendarSuggestion,
  CashEntryResult,
  CashStatement,
  ComparisonQuery,
  DayChanges,
  PerformanceQuery,
  PortfolioComparison,
  PortfolioCopyResult,
  PortfolioPerformance,
  PortfolioPositions,
  ReversalResult,
  TradeQuote,
  TradeResult,
  CatalogAsset,
  CatalogListResult,
  CdiStatus,
  MarketIndexStatus,
  MarketToday,
  MySubscription,
  PaidPlanCode,
  PlanList,
  ConsentList,
  DividendPeriod,
  Investidor10Status,
  LatestNews,
  NewNewsSourceInput,
  NewsSource,
  NewsSourceCreated,
  NewsSourcesStatus,
  NewsSentiment,
  NewsToLabel,
  SentimentModelVersion,
  SentimentSummary,
  UpdateNewsSourceInput,
  Portfolio,
  PortfolioList,
  PriceHistory,
  PriceHistoryPeriod,
  TaskErrorPage,
  TaskList,
  TaskRunPage,
  TradingCalendarYear,
  UserProfile,
} from '@simulador/shared';
import type {
  AccountDeletionConfirmInput,
  AccountDeletionRequestInput,
  AppLanguage,
  AssetSearchQuery,
  AssetUpdateInput,
  AuthResult,
  CalendarPublication,
  CatalogQuery,
  ChangeEmailInput,
  ChangePasswordInput,
  ClientResult,
  ConfirmEmailChangeInput,
  ConnectionEvent,
  ReconnectResult,
  EmailConfirmationInput,
  EmailConfirmationResendInput,
  LoginInput,
  NewAssetInput,
  NewCashEntryInput,
  NewPortfolioCopyInput,
  NewPortfolioInput,
  NewTradeInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  RenamePortfolioInput,
  ReportSaveRequest,
  ReportSaveResult,
  NoticeTarget,
  VariationNotice,
  UpdateNameInput,
} from '../shared/auth-ipc.js';
import type { ServerStatus } from '../shared/server-status.js';

/** Funções que o processo principal expõe para a interface (window.api). */
export interface DesktopApi {
  checkServerHealth(): Promise<ServerStatus>;
  /** SPEC-035: avisa o processo principal do idioma da interface (ao abrir e a cada troca). */
  setLanguage(language: AppLanguage): Promise<void>;
  /** SPEC-032: modo consulta (sem conexão) e a volta da conexão. */
  connection: {
    status(): Promise<{ offline: boolean }>;
    /** "Tentar agora": confere o servidor e, se ele responde, renova a sessão. */
    retry(): Promise<ReconnectResult>;
    /** Avisa quando o app entra ou sai do modo consulta; devolve a função que para de avisar. */
    onChange(listener: (event: ConnectionEvent) => void): () => void;
    /**
     * Avisa a data de cada leitura que veio da cópia local (o `savedAt`), para a faixa do modo
     * consulta mostrar a mais antiga da tela.
     */
    onSavedAt(listener: (savedAt: string) => void): () => void;
  };
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
  /** SPEC-025: planos e assinatura com pagamento simulado (assinar, cancelar e reativar: só o usuário). */
  subscription: {
    plans(): Promise<ClientResult<PlanList>>;
    mine(): Promise<ClientResult<MySubscription>>;
    subscribe(plan: PaidPlanCode): Promise<ClientResult<MySubscription>>;
    cancel(): Promise<ClientResult<MySubscription>>;
    resume(): Promise<ClientResult<MySubscription>>;
  };
  indexes: {
    cdi(): Promise<ClientResult<CdiStatus>>;
    market(): Promise<ClientResult<MarketIndexStatus>>;
    /** SPEC-048: o Ibovespa e o dólar do dia (Yahoo Finance), para qualquer pessoa conectada. */
    today(): Promise<ClientResult<MarketToday>>;
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
    /** SPEC-033: os ativos das carteiras com a cotação do pregão de hoje e a variação do dia. */
    dayChanges(): Promise<ClientResult<DayChanges>>;
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
    /** SPEC-023: nova carteira a partir desta; `copy_breaks_cash` traz em details a retirada. */
    copy(id: string, input: NewPortfolioCopyInput): Promise<ClientResult<PortfolioCopyResult>>;
  };
  /**
   * SPEC-038: o relatório da carteira em PDF. `save` imprime esta janela (o documento do relatório
   * já montado) e grava onde a pessoa escolher; `open` abre o último relatório gravado.
   */
  report: {
    save(request: ReportSaveRequest): Promise<ClientResult<ReportSaveResult>>;
    open(): Promise<boolean>;
  };
  /**
   * SPEC-033: os avisos de variação. `show` mostra o aviso do sistema (devolve `false` se o sistema
   * não aceita avisos); `onClick` diz para onde ir quando a pessoa clica nele.
   */
  notifications: {
    show(notice: VariationNotice): Promise<boolean>;
    onClick(listener: (target: NoticeTarget) => void): () => void;
  };
  /** SPEC-011: as tarefas de ingestão, só colaborador (403 para usuário). */
  tasks: {
    list(): Promise<ClientResult<TaskList>>;
    /** O histórico da tarefa, 50 por vez a partir de `offset`. */
    runs(task: string, offset?: number): Promise<ClientResult<TaskRunPage>>;
    /** Os erros de uma execução, 100 por vez a partir de `offset`. */
    errors(runId: string, offset?: number): Promise<ClientResult<TaskErrorPage>>;
    /** "Executar agora": o processador atende o pedido em até 15 segundos. */
    request(task: string): Promise<ClientResult<null>>;
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
  /** Fontes de notícias (SPEC-027): só colaborador (403 para usuário). */
  news: {
    sources(): Promise<ClientResult<NewsSourcesStatus>>;
    /** SPEC-028: as últimas notícias com os vínculos aos ativos. */
    latest(): Promise<ClientResult<LatestNews>>;
    /** O servidor testa o feed antes de gravar; recusado, o motivo vem em `fields.url`. */
    createSource(input: NewNewsSourceInput): Promise<ClientResult<NewsSourceCreated>>;
    updateSource(
      id: string,
      input: UpdateNewsSourceInput,
    ): Promise<ClientResult<{ source: NewsSource }>>;
    /** SPEC-044: versão do modelo, contagens, avaliação e os últimos rotulados. */
    sentiment(): Promise<ClientResult<SentimentSummary>>;
    /** A próxima notícia sem rótulo, sem o que o modelo disse; `null` se acabaram. */
    nextToLabel(skip: string[]): Promise<ClientResult<{ news: NewsToLabel | null }>>;
    label(id: string, sentiment: NewsSentiment): Promise<ClientResult<null>>;
    unlabel(id: string): Promise<ClientResult<null>>;
    /** Recusada (409) sem versão do modelo ou com poucas notícias de teste. */
    evaluate(): Promise<ClientResult<{ version: SentimentModelVersion }>>;
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
    /** SPEC-029: notícias do ativo (10 por vez) ou as de um pregão, com `after` e `until`. */
    news(id: string, query: Partial<AssetNewsQuery>): Promise<ClientResult<AssetNewsPage>>;
    /** SPEC-029: notícias por dia de referência, no período do gráfico (os marcadores). */
    newsDays(id: string, period: PriceHistoryPeriod): Promise<ClientResult<AssetNewsDays>>;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}
