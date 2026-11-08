import type {
  AssetClass,
  CalendarSource,
  FundInfo,
  IndicatorCode,
  IsoDate,
  NonTradingDay,
  SectorCode,
} from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type { CotahistQuote } from '../domain/cotahist.js';
import type { CorporateEvent } from '../domain/b3-events.js';
import type { ParsedDividend } from '../domain/investidor10-page.js';

/** Ano publicado, como fica guardado (SPEC-005 §6 e §10). */
export interface StoredCalendarYear {
  year: number;
  publishedAt: Date;
  /**
   * Id do colaborador; nenhum dado pessoal fora do módulo de identidade (DA13). `null` só quando o
   * processador publicou pelo arquivo da B3 (`source: 'b3_file'`).
   */
  publishedBy: string | null;
  source: CalendarSource;
  /** Em ordem de data. */
  nonTradingDays: NonTradingDay[];
}

export interface NewCalendarPublication {
  year: number;
  publishedAt: Date;
  publishedBy: string | null;
  /** Padrão: `collaborator`. */
  source?: CalendarSource;
  nonTradingDays: NonTradingDay[];
}

export interface CalendarRepository {
  findYear(year: number): Promise<StoredCalendarYear | null>;
  /** Anos publicados de `from` a `to`, incluindo os dois; os não publicados ficam de fora. */
  findYears(from: number, to: number): Promise<StoredCalendarYear[]>;
  /**
   * Publica ou republica o ano: a lista nova substitui a anterior inteira, de uma vez, junto com o
   * registro de auditoria (SPEC-006). `audit` recebe a lista anterior (`null` na primeira vez),
   * lida com o ano travado.
   */
  publish(
    publication: NewCalendarPublication,
    audit: (before: NonTradingDay[] | null) => AuditEntry,
  ): Promise<StoredCalendarYear>;
}

/**
 * Arquivos de séries históricas da B3 (DA18), atrás de um adaptador (DA06). Devolve as linhas do
 * arquivo, ou `null` quando ele ainda não foi publicado. Falha de rede lança erro.
 */
export interface CotahistSource {
  /** Arquivo anual. `closed`: o ano já acabou e o arquivo não muda mais (pode ficar guardado). */
  annual(year: number, closed: boolean): Promise<AsyncIterable<string> | null>;
  /** Arquivo de um pregão. */
  daily(date: IsoDate): Promise<AsyncIterable<string> | null>;
}

/** De onde veio a cotação (SPEC-008 §6). */
export type QuoteSource = 'b3_cotahist' | 'brapi';

/** Ativo do catálogo, ativo ou desativado: todos são coletados (SPEC-008 §4). */
export interface HistoryAsset {
  id: string;
  ticker: string;
}

/**
 * Fechamento de um pregão de um ativo, pronto para gravar. Preço médio, negócios e volume só
 * ficam vazios no fechamento provisório da brapi (SPEC-009), que a B3 substitui no dia seguinte.
 */
export type DailyQuote = Omit<CotahistQuote, 'ticker' | 'average' | 'trades' | 'volume'> & {
  assetId: string;
  average: string | null;
  trades: number | null;
  volume: string | null;
};

/** Ano do arquivo anual lido para um ativo, com quantas cotações dele havia (pode ser zero). */
export interface LoadedYear {
  assetId: string;
  year: number;
  records: number;
}

/** Um pregão guardado da B3, como a ficha do ativo mostra (SPEC-010). */
export interface DailySession {
  date: IsoDate;
  open: string;
  high: string;
  low: string;
  close: string;
  trades: number | null;
  volume: string | null;
}

/** Fechamento de um pregão, para o gráfico da ficha (SPEC-010). */
export interface DailyClose {
  date: IsoDate;
  close: string;
}

/** Primeiro e último pregão guardados de um ativo. */
export interface QuoteRange {
  from: IsoDate;
  to: IsoDate;
}

export interface QuoteRepository {
  listAssets(): Promise<HistoryAsset[]>;
  /** Anos já lidos, por ativo. */
  loadedYears(): Promise<Map<string, Set<number>>>;
  /**
   * Primeiro e último pregão vindos da **B3**, por ativo (só os que têm alguma). O fechamento
   * provisório da brapi (SPEC-009) não conta: senão a atualização diária pularia o dia dele.
   */
  quoteRanges(): Promise<Map<string, QuoteRange>>;
  /** SPEC-010: o mesmo, de um ativo só (`null` sem cotação da B3). */
  quoteRange(assetId: string): Promise<QuoteRange | null>;
  /** SPEC-010: anos já lidos de um ativo só. */
  loadedYearsOf(assetId: string): Promise<Set<number>>;
  /**
   * Insere ou atualiza pela chave (ativo, data), sem duplicar (idempotente). Precedência (DA18):
   * a B3 substitui qualquer fonte; outra fonte nunca substitui a B3. Devolve quantas linhas gravou.
   */
  save(quotes: DailyQuote[], source: QuoteSource): Promise<number>;
  markYearsLoaded(years: LoadedYear[], at: Date): Promise<void>;
}

/** Tarefas de ingestão (SPECs 008, 009 e 040, §5.1); as SPECs 007 e 027 acrescentam as suas. */
export type IngestionTask =
  | 'historico_retroativo'
  | 'fechamento_diario'
  | 'cotacao_pregao'
  | 'importacao_catalogo'
  | 'calendario_b3'
  | 'cdi_diario'
  | 'investidor10'
  | 'eventos_b3'
  /** SPEC-020: Ibovespa e IFIX pela B3. */
  | 'indices_b3';
export type RunStatus = 'sucesso' | 'parcial' | 'falha' | 'aguardando_publicacao' | 'cota_esgotada';

export interface RunError {
  assetId?: string | null;
  date?: IsoDate | null;
  message: string;
}

/** Resultado de uma execução, gravado no registro (DA14). */
export interface RunResult {
  status: RunStatus;
  records: number;
  affectedAssets: number;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  errors: RunError[];
  /** SPEC-009: consultas que a fonte descontou da cota e a cota que ela informou por último. */
  requests?: number;
  quota?: QuoteUsage | null;
  /** SPEC-040: totais que não cabem em `records` (a importação: criados, desativados, logos...). */
  totals?: RunTotals;
}

export type RunTotals = Record<string, number | boolean | string[]>;

export interface TaskRunRepository {
  /** Grava o início da execução e devolve o id dela. */
  start(task: IngestionTask, at: Date): Promise<string>;
  finish(id: string, result: RunResult, at: Date): Promise<void>;
}

/** Uma execução já gravada, como a coleta do pregão precisa ler (SPEC-009). */
export interface RunSummary {
  startedAt: Date;
  finishedAt: Date | null;
  status: RunStatus | null;
  requests: number;
  quota: QuoteUsage | null;
  totals: RunTotals | null;
}

export interface TaskRunReader {
  lastRun(task: IngestionTask): Promise<RunSummary | null>;
  /** Consultas feitas desde o instante (quando a fonte não informou a cota). */
  requestsSince(task: IngestionTask, since: Date): Promise<number>;
  /** Execuções iniciadas desde o instante. */
  runsSince(task: IngestionTask, since: Date): Promise<number>;
}

/** Nível da cotação (DA16). Esta Spec só coleta o gratuito; o assinante vem na SPEC-026. */
export type QuoteLevel = 'gratuito' | 'assinante';

/** Cota informada pela fonte na resposta (a brapi conta por ciclo de cobrança do plano). */
export interface QuoteUsage {
  remaining: number;
  limit: number;
  resetsAt: Date;
}

/** Cotação atual de um ativo, como a fonte informa, em decimal (texto). */
export interface SourceQuote {
  price: string;
  /** Horário que a fonte dá para a cotação. */
  at: Date;
  open: string | null;
  high: string | null;
  low: string | null;
  previousClose: string | null;
  usage: QuoteUsage | null;
}

export type QuoteSourceErrorKind =
  | 'not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'unavailable'
  | 'bad_response';

/** Falha da fonte de cotações, já classificada pelo adaptador. */
export class QuoteSourceError extends Error {
  constructor(
    readonly kind: QuoteSourceErrorKind,
    message: string,
    readonly usage: QuoteUsage | null = null,
  ) {
    super(message);
    this.name = 'QuoteSourceError';
  }
}

/** Lista da brapi (SPEC-040): ações (com as units) ou FIIs, a bolsa inteira numa consulta. */
export type ListKind = 'stock' | 'fii';

/** Um papel da lista, como a fonte informa. Preço e variação em decimal (texto). */
export interface ListedAsset {
  ticker: string;
  name: string;
  /** `stock`, `unit` ou `fii`: o adaptador já descarta os outros tipos. */
  subType: 'stock' | 'unit' | 'fii';
  /** Nome do segmento da B3 ("Bancos", "Logística"), quando a fonte informa. */
  subsector: string | null;
  logoUrl: string | null;
  /** Último preço; `null` sem preço válido. */
  price: string | null;
  /** Variação do dia em %, como a fonte calcula. */
  change: string | null;
}

export interface AssetListing {
  assets: ListedAsset[];
  /** Consultas feitas (a lista pode ter mais de uma página). */
  requests: number;
  /** Cota do ciclo, se a fonte descontou e informou (a brapi não desconta a lista hoje). */
  usage: QuoteUsage | null;
}

/**
 * Provedor da lista de ativos com preço (DA06): a importação do catálogo e as cotações do pregão
 * (SPEC-040). Falha da fonte lança QuoteSourceError.
 */
export interface QuoteListSource {
  readonly tokenConfigured: boolean;
  list(kind: ListKind): Promise<AssetListing>;
}

/** Cotação do pregão como fica guardada (SPEC-009 §6). */
export interface IntradayQuote {
  assetId: string;
  at: Date;
  level: QuoteLevel;
  price: string;
  open: string | null;
  high: string | null;
  low: string | null;
  previousClose: string | null;
  source: QuoteSource;
}

/** Última cotação de um ativo, com o fechamento guardado do pregão anterior a ela. */
export interface LatestIntradayQuote extends IntradayQuote {
  storedPreviousClose: string | null;
}

export interface IntradayQuoteRepository {
  /** Ativos ativos do catálogo (só eles entram na coleta do pregão). */
  activeAssets(): Promise<HistoryAsset[]>;
  /** Grava as novas; a mesma (ativo, horário, nível) não duplica. Devolve quantas gravou. */
  save(quotes: IntradayQuote[]): Promise<number>;
  latest(level: QuoteLevel): Promise<Map<string, LatestIntradayQuote>>;
  /** SPEC-010: a última de um ativo só. */
  latestOf(level: QuoteLevel, assetId: string): Promise<LatestIntradayQuote | null>;
  /** Último fechamento guardado antes da data, por ativo (da B3 ou provisório). */
  closesBefore(date: IsoDate): Promise<Map<string, string>>;
  deleteBefore(instant: Date): Promise<number>;
}

/** Último pregão com negócio de uma ação, unit ou FII nos arquivos da B3 (SPEC-040). */
export interface B3Trade {
  ticker: string;
  /** Pela B3: FII (`CODBDI 12`) ou ação. */
  assetClass: AssetClass;
  lastTradingDay: IsoDate;
  /** SPEC-042: ISIN do arquivo da B3; `null` ou ausente quando não veio. */
  isin?: string | null;
}

export interface B3TradeRepository {
  /** Guarda o último pregão de cada ticker; uma data mais antiga que a guardada não muda nada. */
  record(trades: B3Trade[], at: Date): Promise<void>;
  /** Todos os tickers guardados, inclusive os que não estão no catálogo. */
  all(): Promise<Map<string, B3Trade>>;
}

/** Lê arquivos anuais da B3 só para guardar quem negociou (a primeira importação precisa). */
export interface B3TradeScanner {
  /** Devolve os problemas (arquivo que não baixou ou não foi publicado); vazio se leu tudo. */
  refreshTrades(years: number[]): Promise<string[]>;
}

/** Ativo do catálogo como a importação precisa ver (SPEC-040). */
export interface CatalogEntry {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  createdAt: Date;
  deactivatedAt: Date | null;
  /** Desativado pelo processador: só esses voltam sozinhos. */
  autoDeactivated: boolean;
}

export interface ImportedAsset {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: SectorCode;
}

/** Mudança automática de situação, com o último pregão que a justificou (vai para a auditoria). */
export interface AutomaticChange {
  id: string;
  lastTradedOn: IsoDate | null;
}

/**
 * O catálogo, para a importação diária (SPEC-040). Toda escrita grava junto o registro de
 * auditoria, sem colaborador (é o processador). Nunca muda ticker, nome, classe ou setor de um
 * ativo que já existe.
 */
export interface CatalogImportRepository {
  entries(): Promise<CatalogEntry[]>;
  /** Cria os novos, a revisar; ticker que já existe é pulado. Devolve os criados. */
  createImported(assets: ImportedAsset[], at: Date): Promise<ImportedAsset[]>;
  /** Desativa os que ainda estão ativos. Devolve quantos mudaram. */
  autoDeactivate(changes: AutomaticChange[], at: Date): Promise<number>;
  /** Reativa só os que o processador desativou. Devolve quantos mudaram. */
  autoReactivate(changes: AutomaticChange[], at: Date): Promise<number>;
}

export type LogoType = 'image/svg+xml' | 'image/png';

/** Imagem baixada da fonte, já conferida (tipo e tamanho). */
export interface LogoImage {
  type: LogoType;
  content: Uint8Array;
}

/** Baixa o logo do endereço que a lista informa (DA06). Falha lança erro, com o motivo. */
export interface LogoSource {
  download(url: string): Promise<LogoImage>;
}

/** Logo a guardar: a imagem, ou "sem logo" (a fonte só tem o genérico). */
export type LogoRecord =
  | { assetId: string; status: 'ok'; image: LogoImage; hash: string }
  | { assetId: string; status: 'sem_logo' };

export interface LogoRepository {
  /** Quando o logo de cada ativo foi baixado pela última vez. */
  downloadedAt(): Promise<Map<string, Date>>;
  /** Grava ou troca, de cada ativo. */
  save(logos: LogoRecord[], at: Date): Promise<void>;
  /** A imagem do ativo; `null` sem logo próprio. */
  find(assetId: string): Promise<LogoImage | null>;
  /** Ativos que têm logo próprio. */
  withLogo(): Promise<Set<string>>;
}

/**
 * Série de um indexador no SGS do Banco Central (SPEC-007, DA06). Devolve as linhas da resposta, ou
 * `null` quando não há nada publicado no intervalo (404). Falha lança IndexSourceError.
 */
export interface IndexSource {
  series(code: number, from: IsoDate, to: IsoDate): Promise<unknown[] | null>;
}

/**
 * `retryable`: rede, 5xx e 429 (novas tentativas, §4.2). `rejected` (406) e `bad_response`
 * (resposta malformada) não mudam numa nova tentativa.
 */
export type IndexSourceErrorKind = 'retryable' | 'rejected' | 'bad_response';

export class IndexSourceError extends Error {
  constructor(
    readonly kind: IndexSourceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'IndexSourceError';
  }
}

/** Indexador cadastrado (SPEC-007 §6): só o CDI no escopo atual. */
export interface StoredIndexer {
  id: string;
  code: string;
  sgsSeries: number;
}

export interface IndexRateRepository {
  /** Pelo código (`CDI`); `null` se a migração não o cadastrou. */
  findIndexer(code: string): Promise<StoredIndexer | null>;
  /** Todas as datas guardadas, em ordem. */
  rateDates(indexerId: string): Promise<IsoDate[]>;
  /** Anos fechados já carregados. */
  loadedYears(indexerId: string): Promise<Set<number>>;
  /**
   * Insere ou atualiza (§4.2: revisão do Banco Central substitui). Devolve quantas linhas mudaram:
   * novas ou com valor diferente.
   */
  save(
    indexerId: string,
    rates: ReadonlyArray<{ date: IsoDate; value: string }>,
    at: Date,
  ): Promise<number>;
  markYearLoaded(indexerId: string, year: number, records: number, at: Date): Promise<void>;
}

/**
 * Estatísticas históricas de um índice da B3 (SPEC-020, DA06): a resposta de um ano inteiro, como o
 * site devolve. Falha lança IndexSourceError (a mesma classificação do SGS).
 */
export interface MarketIndexSource {
  year(code: string, year: number): Promise<unknown>;
}

/** Índice da B3 cadastrado (SPEC-020 §6): IBOV e IFIX. */
export interface StoredMarketIndex {
  id: string;
  code: string;
}

export interface MarketIndexRepository {
  /** Pela sigla (`IBOV`); `null` se a migração não o cadastrou. */
  findIndex(code: string): Promise<StoredMarketIndex | null>;
  /** Todas as datas guardadas, em ordem. */
  closeDates(indexId: string): Promise<IsoDate[]>;
  /** Anos fechados já carregados. */
  loadedYears(indexId: string): Promise<Set<number>>;
  /** Insere ou atualiza (a B3 pode corrigir um dia). Devolve quantas linhas mudaram. */
  save(
    indexId: string,
    closes: ReadonlyArray<{ date: IsoDate; value: string }>,
    at: Date,
  ): Promise<number>;
  markYearLoaded(indexId: string, year: number, records: number, at: Date): Promise<void>;
}

/**
 * Páginas do Investidor10 (SPEC-041), usadas com autorização só neste projeto acadêmico. `null`
 * quando a página não existe (404 ou 410). Falha lança Investidor10SourceError.
 */
export interface Investidor10Source {
  /** HTML da página (`acoes/petr4`, `fiis/mxrf11`). */
  page(path: string): Promise<string | null>;
  /** JSON do histórico anual de indicadores de uma ação. */
  history(id: number): Promise<unknown>;
}

/** `blocked`: o site recusou (403 ou 429), a coleta para. `retryable`: rede ou 5xx. */
export class Investidor10SourceError extends Error {
  constructor(
    readonly kind: 'blocked' | 'retryable',
    message: string,
  ) {
    super(message);
    this.name = 'Investidor10SourceError';
  }
}

export interface FundamentalsAsset {
  id: string;
  ticker: string;
  assetClass: AssetClass;
}

/** O que uma visita à página de um ativo trouxe, gravado de uma vez (SPECs 041 e 042). */
export interface AssetCollection {
  assetId: string;
  current: Map<IndicatorCode, string | null>;
  history: Map<IndicatorCode, Map<string, string | null>>;
  fund: FundInfo | null;
  dividends: ParsedDividend[];
}

export interface StoredFundamentals {
  assetClass: AssetClass;
  status: 'ok' | 'sem_pagina' | 'erro' | null;
  /** Última coleta com dados; `null` sem nenhuma. */
  collectedAt: Date | null;
  /** Por indicador, por período (`atual` ou o ano). */
  values: Map<IndicatorCode, Map<string, string | null>>;
  fund: FundInfo | null;
}

export interface FundamentalsRepository {
  /** Ativos ativos do catálogo, em ordem de ticker. */
  listActiveAssets(): Promise<FundamentalsAsset[]>;
  /** Ativos que já têm uma visita registrada (com qualquer resultado). */
  visitedAssets(): Promise<Set<string>>;
  /** Substitui tudo o que o ativo tinha do Investidor10, numa transação. */
  save(collection: AssetCollection, at: Date): Promise<void>;
  /** Visita sem dados: a página não existe ou não deu para ler. O que estava guardado fica. */
  markVisit(assetId: string, status: 'sem_pagina' | 'erro', at: Date): Promise<void>;
  /** `null` se o ativo não existe. */
  fundamentals(assetId: string): Promise<StoredFundamentals | null>;
  /** Proventos com data com desde `since` (todos com `null`), do mais recente ao mais antigo. */
  dividends(assetId: string, since: IsoDate | null): Promise<ParsedDividend[]>;
  /** Visitas por resultado, para o Início do colaborador. */
  visitCounts(): Promise<{ ok: number; sem_pagina: number; erro: number }>;
  /** Apaga tudo o que veio do Investidor10 (fim da autorização). Devolve quantas linhas. */
  clear(): Promise<number>;
}

/**
 * Página de uma empresa no site da B3 (SPEC-042), pelo código de 4 letras do ticker. `null` quando
 * a B3 não conhece o código. Falha lança erro.
 */
export interface B3CompanySource {
  company(code: string): Promise<unknown>;
}

export interface CorporateEventRepository {
  /** Substitui os eventos do ativo, de uma vez. */
  replace(assetId: string, events: CorporateEvent[], at: Date): Promise<void>;
}
