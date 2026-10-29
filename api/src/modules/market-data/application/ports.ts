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

/** Fechamento de um pregão de um ativo, pronto para gravar. */
export type DailyQuote = Omit<CotahistQuote, 'ticker'> & { assetId: string };

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
  /** Primeiro e último pregão guardados, por ativo (só os que têm alguma cotação). */
  quoteRanges(): Promise<Map<string, QuoteRange>>;
  /**
   * Insere ou atualiza pela chave (ativo, data), sem duplicar (idempotente). Precedência (DA18):
   * a B3 substitui qualquer fonte; outra fonte nunca substitui a B3. Devolve quantas linhas gravou.
   */
  save(quotes: DailyQuote[], source: QuoteSource): Promise<number>;
  markYearsLoaded(years: LoadedYear[], at: Date): Promise<void>;
}

/** Tarefas de ingestão (SPEC-008 §5.1); as SPECs 007, 009 e 027 acrescentam as suas. */
export type IngestionTask = 'historico_retroativo' | 'fechamento_diario';
export type RunStatus = 'sucesso' | 'parcial' | 'falha' | 'aguardando_publicacao';

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
}

export interface TaskRunRepository {
  /** Grava o início da execução e devolve o id dela. */
  start(task: IngestionTask, at: Date): Promise<string>;
  finish(id: string, result: RunResult, at: Date): Promise<void>;
}
