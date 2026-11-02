import type { IsoDate, NonTradingDay } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type { CotahistQuote } from '../domain/cotahist.js';

/** Ano publicado, como fica guardado (SPEC-005 §6). */
export interface StoredCalendarYear {
  year: number;
  publishedAt: Date;
  /** Id do colaborador; nenhum dado pessoal fora do módulo de identidade (DA13). */
  publishedBy: string;
  /** Em ordem de data. */
  nonTradingDays: NonTradingDay[];
}

export interface NewCalendarPublication {
  year: number;
  publishedAt: Date;
  publishedBy: string;
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
  /**
   * Insere ou atualiza pela chave (ativo, data), sem duplicar (idempotente). Precedência (DA18):
   * a B3 substitui qualquer fonte; outra fonte nunca substitui a B3. Devolve quantas linhas gravou.
   */
  save(quotes: DailyQuote[], source: QuoteSource): Promise<number>;
  markYearsLoaded(years: LoadedYear[], at: Date): Promise<void>;
}

/** Tarefas de ingestão (SPEC-008 §5.1 e SPEC-009 §5.1); as SPECs 007 e 027 acrescentam as suas. */
export type IngestionTask = 'historico_retroativo' | 'fechamento_diario' | 'cotacao_pregao';
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
  /** SPEC-009: consultas feitas à fonte (contam na cota) e a cota que ela informou por último. */
  requests?: number;
  quota?: QuoteUsage | null;
}

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

/** Provedor das cotações do pregão (DA06): uma consulta por ativo. */
export interface IntradayQuoteSource {
  readonly tokenConfigured: boolean;
  quote(ticker: string): Promise<SourceQuote>;
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
  /** Último fechamento guardado antes da data, por ativo (da B3 ou provisório). */
  closesBefore(date: IsoDate): Promise<Map<string, string>>;
  deleteBefore(instant: Date): Promise<number>;
}
