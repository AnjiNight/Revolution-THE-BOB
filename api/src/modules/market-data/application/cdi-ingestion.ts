import {
  addDays,
  CDI_START_DATE,
  CDI_STALE_BUSINESS_DAYS,
  HISTORY_START_YEAR,
  isoDateInBrasilia,
  yearOf,
  type IsoDate,
} from '@simulador/shared';
import {
  businessDaysBefore,
  parseSgsRows,
  previousWeekday,
  rateDateProblem,
  tradingDaysWithoutRate,
  type CdiRate,
  type NonBusinessDay,
} from '../domain/cdi.js';
import { RETRY_DELAYS_MS } from './history-ingestion.js';
import { SeriesRunLog } from './series-run-log.js';
import {
  IndexSourceError,
  type CalendarRepository,
  type IndexRateRepository,
  type IndexSource,
  type RunResult,
  type StoredCalendarYear,
  type TaskRunRepository,
} from './ports.js';

/** Código do CDI no cadastro de indexadores (a migração cadastra, com a série 12 do SGS). */
export const CDI_CODE = 'CDI';

export interface CdiIngestionDeps {
  source: IndexSource;
  rates: IndexRateRepository;
  runs: TaskRunRepository;
  calendars: CalendarRepository;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

/** Uma consulta ao SGS: um ano fechado inteiro ou, no ano atual, do dia seguinte ao último até hoje. */
interface Query {
  year: number;
  from: IsoDate;
  to: IsoDate;
  closed: boolean;
}

/**
 * Série diária do CDI (SPEC-007), com o padrão de ingestão da SPEC-008: carga retroativa ano a ano
 * desde 2016, atualização dos dias que faltam, gravação idempotente, novas tentativas e execução
 * registrada. Falha da fonte nunca derruba o processador e nunca mexe no que já está guardado.
 */
export class CdiIngestion {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelays: readonly number[];
  /** As tarefas das 09:00 e das 18:00 rodam juntas ao iniciar: uma só execução por vez. */
  private running = false;

  constructor(private readonly deps: CdiIngestionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  /** Sem trabalho (série em dia), não grava execução e devolve `null`. */
  async run(): Promise<RunResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.load();
    } finally {
      this.running = false;
    }
  }

  private async load(): Promise<RunResult | null> {
    const indexer = await this.deps.rates.findIndexer(CDI_CODE);
    if (!indexer) throw new Error('indexador CDI não cadastrado (migração da SPEC-007)');
    const today = isoDateInBrasilia(this.clock());
    const currentYear = yearOf(today);
    const [dates, loaded] = await Promise.all([
      this.deps.rates.rateDates(indexer.id),
      this.deps.rates.loadedYears(indexer.id),
    ]);

    const queries: Query[] = [];
    for (let year = HISTORY_START_YEAR; year < currentYear; year += 1) {
      if (!loaded.has(year)) {
        queries.push({
          year,
          from: maxDate(`${year}-01-01`, CDI_START_DATE),
          to: `${year}-12-31`,
          closed: true,
        });
      }
    }
    // O CDI de um dia sai no dia útil seguinte: com o do último dia de semana guardado, está em dia.
    const last = dates.at(-1) ?? null;
    const upToDate = last !== null && last >= previousWeekday(today);
    const from = maxDate(`${currentYear}-01-01`, last ? addDays(last, 1) : CDI_START_DATE);
    if (!upToDate && from <= today)
      queries.push({ year: currentYear, from, to: today, closed: false });
    if (queries.length === 0) return null;

    const runId = await this.deps.runs.start('cdi_diario', this.clock());
    const log = new SeriesRunLog();
    try {
      for (const query of queries)
        await this.read(indexer.id, indexer.sgsSeries, query, today, log);
      await this.checkTradingDays(indexer.id, today, log);
    } catch (error) {
      log.failed += 1;
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = log.result();
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }

  private async read(
    indexerId: string,
    series: number,
    query: Query,
    today: IsoDate,
    log: SeriesRunLog,
  ): Promise<void> {
    const label = query.closed ? `CDI de ${query.year}` : `CDI de ${query.from} a ${query.to}`;
    let rows: unknown[] | null;
    try {
      rows = await this.withRetries(log, () =>
        this.deps.source.series(series, query.from, query.to),
      );
    } catch (error) {
      log.failed += 1;
      log.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (rows === null) {
      log.waiting = true;
      return;
    }
    log.read += 1;

    const { rates, problems } = parseSgsRows(rows);
    for (const problem of problems) log.error(problem);
    const valid: CdiRate[] = [];
    for (const rate of rates) {
      const problem =
        rateDateProblem(rate.date, today) ??
        (yearOf(rate.date) === query.year ? null : `CDI de ${rate.date} na consulta de ${label}`);
      if (problem) log.error(problem, rate.date);
      else valid.push(rate);
    }
    log.saved(valid, await this.deps.rates.save(indexerId, valid, this.clock()));
    if (query.closed) {
      await this.deps.rates.markYearLoaded(indexerId, query.year, valid.length, this.clock());
    }
  }

  /** §4.2: pregão publicado, com mais de 3 dias úteis, sem CDI vira erro (sem impedir a gravação). */
  private async checkTradingDays(
    indexerId: string,
    today: IsoDate,
    log: SeriesRunLog,
  ): Promise<void> {
    const published = await this.deps.calendars.findYears(HISTORY_START_YEAR, yearOf(today));
    const until = businessDaysBefore(today, CDI_STALE_BUSINESS_DAYS, nonBusinessDays(published));
    const dates = new Set(await this.deps.rates.rateDates(indexerId));
    for (const day of tradingDaysWithoutRate(
      published.map((stored) => ({
        year: stored.year,
        nonTradingDays: stored.nonTradingDays.map((d) => d.date),
      })),
      dates,
      until,
    )) {
      log.error(`pregão de ${day} sem CDI`, day);
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

/** Dias sem pregão dos anos publicados: os avisos contam dias úteis com eles (§5.3). */
export function nonBusinessDays(published: readonly StoredCalendarYear[]): NonBusinessDay {
  const closed = new Set(published.flatMap((stored) => stored.nonTradingDays.map((d) => d.date)));
  return (date) => closed.has(date);
}

function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}
