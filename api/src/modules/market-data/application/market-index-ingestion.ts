import {
  HISTORY_START_YEAR,
  INDEX_STALE_TRADING_DAYS,
  isoDateInBrasilia,
  MARKET_INDEX_CODES,
  yearOf,
  type IsoDate,
} from '@simulador/shared';
import { indexDateProblem, parseIndexYear, type IndexClose } from '../domain/b3-index.js';
import { businessDaysBefore, tradingDaysWithoutRate } from '../domain/cdi.js';
import { nonBusinessDays } from './cdi-ingestion.js';
import { RETRY_DELAYS_MS } from './history-ingestion.js';
import {
  IndexSourceError,
  type CalendarRepository,
  type MarketIndexRepository,
  type MarketIndexSource,
  type RunResult,
  type StoredCalendarYear,
  type StoredMarketIndex,
  type TaskRunRepository,
} from './ports.js';
import { SeriesRunLog } from './series-run-log.js';

/** §4.2: um pedido à B3 a cada 2 segundos, o ritmo da SPEC-042. */
const PAUSE_BETWEEN_REQUESTS_MS = 2_000;
/** Na primeira semana de janeiro, o ano anterior ainda é pedido de novo antes de ficar "fechado". */
const CLOSED_YEAR_AFTER = '-01-08';

export interface MarketIndexIngestionDeps {
  source: MarketIndexSource;
  indexes: MarketIndexRepository;
  runs: TaskRunRepository;
  calendars: CalendarRepository;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
  pauseMs?: number;
}

/** Um pedido à B3: um índice num ano. */
interface Query {
  index: StoredMarketIndex;
  year: number;
  closed: boolean;
}

/**
 * Ibovespa e IFIX pelas estatísticas históricas da B3 (SPEC-020), com o padrão de ingestão da
 * SPEC-008: carga retroativa ano a ano desde 2016, o ano atual a cada execução, gravação
 * idempotente, novas tentativas e execução registrada. Falha da fonte nunca derruba o processador e
 * nunca mexe no que já está guardado.
 */
export class MarketIndexIngestion {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelays: readonly number[];
  private readonly pauseMs: number;
  /** As tarefas das 08:00 e das 20:00 rodam juntas ao iniciar: uma só execução por vez. */
  private running = false;

  constructor(private readonly deps: MarketIndexIngestionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.pauseMs = deps.pauseMs ?? PAUSE_BETWEEN_REQUESTS_MS;
  }

  /** `null` quando outra execução está em andamento. */
  async run(): Promise<RunResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.load();
    } finally {
      this.running = false;
    }
  }

  private async load(): Promise<RunResult> {
    const today = isoDateInBrasilia(this.clock());
    const currentYear = yearOf(today);
    const runId = await this.deps.runs.start('indices_b3', this.clock());
    const log = new SeriesRunLog();
    try {
      const indexes: StoredMarketIndex[] = [];
      const queries: Query[] = [];
      for (const code of MARKET_INDEX_CODES) {
        const index = await this.deps.indexes.findIndex(code);
        if (!index) {
          log.failed += 1;
          log.error(`índice ${code} não cadastrado (migração da SPEC-020)`);
          continue;
        }
        indexes.push(index);
        const loaded = await this.deps.indexes.loadedYears(index.id);
        for (let year = HISTORY_START_YEAR; year <= currentYear; year += 1) {
          if (loaded.has(year)) continue;
          queries.push({ index, year, closed: today >= `${year + 1}${CLOSED_YEAR_AFTER}` });
        }
      }
      for (const [position, query] of queries.entries()) {
        if (position > 0) await this.sleep(this.pauseMs);
        await this.read(query, today, log);
      }
      const published = await this.deps.calendars.findYears(HISTORY_START_YEAR, currentYear);
      for (const index of indexes) await this.checkTradingDays(index, published, today, log);
    } catch (error) {
      log.failed += 1;
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = log.result();
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }

  private async read(query: Query, today: IsoDate, log: SeriesRunLog): Promise<void> {
    const { index, year } = query;
    const label = `${index.code} de ${year}`;
    let body: unknown;
    try {
      body = await this.withRetries(log, () => this.deps.source.year(index.code, year));
    } catch (error) {
      log.failed += 1;
      log.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    log.read += 1;

    const { closes, problems } = parseIndexYear(index.code, year, body);
    for (const problem of problems) log.error(problem);
    const valid: IndexClose[] = [];
    for (const close of closes) {
      const problem = indexDateProblem(index.code, close.date, today);
      if (problem) log.error(problem, close.date);
      else valid.push(close);
    }
    log.saved(valid, await this.deps.indexes.save(index.id, valid, this.clock()));
    // Um ano sem nenhum fechamento (resposta vazia da B3) não fica marcado: é pedido de novo.
    if (query.closed && valid.length > 0) {
      await this.deps.indexes.markYearLoaded(index.id, year, valid.length, this.clock());
    }
  }

  /**
   * §4.2: pregão publicado sem fechamento depois de 2 pregões vira erro; fechamento num dia sem
   * pregão no calendário fica gravado (como a B3 publicou) e vira aviso.
   */
  private async checkTradingDays(
    index: StoredMarketIndex,
    published: readonly StoredCalendarYear[],
    today: IsoDate,
    log: SeriesRunLog,
  ): Promise<void> {
    const dates = await this.deps.indexes.closeDates(index.id);
    const nonBusiness = nonBusinessDays(published);
    const until = businessDaysBefore(today, INDEX_STALE_TRADING_DAYS, nonBusiness);
    const years = published.map((stored) => ({
      year: stored.year,
      nonTradingDays: stored.nonTradingDays.map((day) => day.date),
    }));
    for (const day of tradingDaysWithoutRate(years, new Set(dates), until)) {
      log.error(`pregão de ${day} sem fechamento do ${index.code}`, day);
    }
    for (const day of dates) {
      if (nonBusiness(day)) log.error(`${index.code} em ${day}, dia sem pregão no calendário`, day);
    }
  }

  /** As novas tentativas da SPEC-008, só para o que pode mudar na próxima (rede, 5xx, 429). */
  private async withRetries<T>(log: SeriesRunLog, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      log.requests += 1;
      try {
        return await fn();
      } catch (error) {
        const delay = this.retryDelays[attempt];
        const retryable = !(error instanceof IndexSourceError) || error.kind === 'retryable';
        if (!retryable || delay === undefined) throw error;
        await this.sleep(delay);
      }
    }
  }
}
