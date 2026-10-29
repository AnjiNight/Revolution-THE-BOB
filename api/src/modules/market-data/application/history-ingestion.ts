import {
  addDays,
  HISTORY_START_YEAR,
  isoDateInBrasilia,
  yearOf,
  type IsoDate,
} from '@simulador/shared';
import { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import { CotahistLineError, parseCotahistLine } from '../domain/cotahist.js';
import type {
  CalendarRepository,
  CotahistSource,
  DailyQuote,
  HistoryAsset,
  IngestionTask,
  LoadedYear,
  QuoteRepository,
  RunError,
  RunResult,
  RunStatus,
  TaskRunRepository,
} from './ports.js';

/** Esperas entre as novas tentativas de baixar um arquivo (SPEC-008 §4): 1, 5 e 15 minutos. */
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;
/** Cotações gravadas por vez. */
const BATCH_SIZE = 1000;
/** Erros guardados por execução; o resto vira um resumo, para não encher o registro. */
const MAX_STORED_ERRORS = 100;
/** A atualização diária volta no máximo este número de dias (o resto fica com a carga anual). */
const DAILY_LOOKBACK_DAYS = 90;
/** Ativo sem cotação há mais tempo que isto (deixou de ser negociado) não puxa a janela diária. */
const STALE_AFTER_DAYS = 90;

export interface HistoryIngestionDeps {
  source: CotahistSource;
  quotes: QuoteRepository;
  runs: TaskRunRepository;
  calendars: CalendarRepository;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

/** Erros e totais de uma execução, montados enquanto ela anda. */
class RunLog {
  readonly errors: RunError[] = [];
  private hiddenErrors = 0;
  records = 0;
  readonly assets = new Set<string>();
  periodStart: IsoDate | null = null;
  periodEnd: IsoDate | null = null;
  filesRead = 0;
  filesFailed = 0;
  waitingPublication = false;

  error(message: string, assetId: string | null = null, date: IsoDate | null = null): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message, assetId, date });
    else this.hiddenErrors += 1;
  }

  saved(quotes: DailyQuote[], count: number): void {
    this.records += count;
    for (const quote of quotes) {
      this.assets.add(quote.assetId);
      if (this.periodStart === null || quote.date < this.periodStart) this.periodStart = quote.date;
      if (this.periodEnd === null || quote.date > this.periodEnd) this.periodEnd = quote.date;
    }
  }

  result(): RunResult {
    const errors =
      this.hiddenErrors > 0
        ? [...this.errors, { message: `mais ${this.hiddenErrors} erros não guardados` }]
        : this.errors;
    return {
      status: this.status(),
      records: this.records,
      affectedAssets: this.assets.size,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      errors,
    };
  }

  private status(): RunStatus {
    if (this.filesFailed > 0 && this.filesRead === 0) return 'falha';
    if (this.errors.length > 0 || this.filesFailed > 0) return 'parcial';
    if (this.waitingPublication && this.records === 0) return 'aguardando_publicacao';
    return 'sucesso';
  }
}

/**
 * Carga do histórico diário a partir dos arquivos da B3 (SPEC-008). Estabelece o padrão de
 * ingestão (DA07, DA14): adaptador, gravação idempotente, novas tentativas e execução registrada.
 * Falha de fonte nunca derruba o processador: vira erro registrado (RNF13).
 */
export class HistoryIngestion {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelays: readonly number[];

  constructor(private readonly deps: HistoryIngestionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms)));
    this.retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  /**
   * Carga retroativa (§5.1): para cada ano publicado da janela, lê o arquivo anual para os ativos
   * que ainda não têm aquele ano. Sem trabalho, não grava execução e devolve `null`.
   */
  async loadRetroactive(): Promise<RunResult | null> {
    const today = isoDateInBrasilia(this.clock());
    const currentYear = yearOf(today);
    const [published, assets, loaded] = await Promise.all([
      this.deps.calendars.findYears(HISTORY_START_YEAR, currentYear),
      this.deps.quotes.listAssets(),
      this.deps.quotes.loadedYears(),
    ]);
    const work = published
      .map((stored) => ({
        year: stored.year,
        pending: assets.filter((asset) => !loaded.get(asset.id)?.has(stored.year)),
      }))
      .filter((item) => item.pending.length > 0);
    if (work.length === 0) return null;

    const calendar = toTradingCalendar(published);
    return this.record('historico_retroativo', async (log) => {
      for (const { year, pending } of work) {
        const counts = await this.readFile(
          log,
          `arquivo anual de ${year}`,
          () => this.deps.source.annual(year, year < currentYear),
          pending,
          (date) => (yearOf(date) === year ? null : `cotação de ${date} no arquivo de ${year}`),
          calendar,
        );
        if (!counts) continue;
        const years: LoadedYear[] = pending.map((asset) => ({
          assetId: asset.id,
          year,
          records: counts.get(asset.id) ?? 0,
        }));
        await this.deps.quotes.markYearsLoaded(years, this.clock());
      }
    });
  }

  /**
   * Atualização diária (§5.1): lê o arquivo de cada pregão depois do último guardado até ontem,
   * para todos os ativos que já passaram pela carga retroativa. Sem trabalho, devolve `null`.
   */
  async updateDaily(): Promise<RunResult | null> {
    const today = isoDateInBrasilia(this.clock());
    const yesterday = addDays(today, -1);
    const [assets, loaded, ranges] = await Promise.all([
      this.deps.quotes.listAssets(),
      this.deps.quotes.loadedYears(),
      this.deps.quotes.quoteRanges(),
    ]);
    const tracked = assets.filter((asset) => (loaded.get(asset.id)?.size ?? 0) > 0);
    const recent = tracked
      .map((asset) => ranges.get(asset.id)?.to)
      .filter(
        (to): to is IsoDate => to !== undefined && to >= addDays(yesterday, -STALE_AFTER_DAYS),
      );
    if (recent.length === 0) return null;
    const start = maxDate(
      addDays(
        recent.reduce((min, to) => (to < min ? to : min)),
        1,
      ),
      addDays(yesterday, -DAILY_LOOKBACK_DAYS),
    );
    if (start > yesterday) return null;

    const published = await this.deps.calendars.findYears(yearOf(start), yearOf(yesterday));
    const publishedYears = new Set(published.map((stored) => stored.year));
    const calendar = toTradingCalendar(published);

    return this.record('fechamento_diario', async (log) => {
      for (let day = start; day <= yesterday; day = addDays(day, 1)) {
        if (!publishedYears.has(yearOf(day))) {
          log.error(`calendário de pregão de ${yearOf(day)} não publicado`, null, day);
          break;
        }
        if (!calendar.isTradingDay(day)) continue;
        const counts = await this.readFile(
          log,
          `arquivo do pregão de ${day}`,
          () => this.deps.source.daily(day),
          tracked,
          (date) => (date === day ? null : `cotação de ${date} no arquivo do pregão de ${day}`),
          calendar,
        );
        // Arquivo do dia ainda não publicado: os seguintes também não estão.
        if (!counts && log.waitingPublication) break;
      }
    });
  }

  /**
   * Baixa (com novas tentativas) e lê um arquivo, gravando as cotações dos `assets`. Devolve
   * quantas cotações cada ativo teve, ou `null` se o arquivo não foi lido.
   */
  private async readFile(
    log: RunLog,
    label: string,
    open: () => Promise<AsyncIterable<string> | null>,
    assets: HistoryAsset[],
    wrongDate: (date: IsoDate) => string | null,
    calendar: TradingCalendar,
  ): Promise<Map<string, number> | null> {
    const byTicker = new Map(assets.map((asset) => [asset.ticker, asset.id]));
    const counts = new Map<string, number>();
    let batch: DailyQuote[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const saved = batch;
      batch = [];
      log.saved(saved, await this.deps.quotes.save(saved, 'b3_cotahist'));
    };

    try {
      const lines = await this.withRetries(open);
      if (!lines) {
        log.waitingPublication = true;
        return null;
      }
      for await (const line of lines) {
        // O arquivo traz todos os papéis da bolsa: só os do catálogo são lidos.
        const assetId = byTicker.get(line.slice(12, 24).trim());
        if (!assetId) continue;
        const quote = this.parse(log, line, assetId);
        if (!quote) continue;
        const problem = wrongDate(quote.date) ?? tradingDayProblem(calendar, quote.date);
        if (problem) {
          log.error(problem, assetId, quote.date);
          continue;
        }
        const { ticker: _ticker, ...fields } = quote;
        batch.push({ ...fields, assetId });
        counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();
      log.filesRead += 1;
      return counts;
    } catch (error) {
      log.filesFailed += 1;
      log.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private parse(log: RunLog, line: string, assetId: string) {
    try {
      return parseCotahistLine(line);
    } catch (error) {
      if (!(error instanceof CotahistLineError)) throw error;
      log.error(`linha inválida: ${error.message}`, assetId, error.date);
      return null;
    }
  }

  /** Até 3 novas tentativas, com as esperas do §4. Arquivo não publicado (`null`) não é falha. */
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const delay = this.retryDelays[attempt];
        if (delay === undefined) throw error;
        await this.sleep(delay);
      }
    }
  }

  /** Grava o início, roda e grava o fim com o resultado, mesmo se algo inesperado falhar. */
  private async record(
    task: IngestionTask,
    body: (log: RunLog) => Promise<void>,
  ): Promise<RunResult> {
    const runId = await this.deps.runs.start(task, this.clock());
    const log = new RunLog();
    try {
      await body(log);
    } catch (error) {
      log.filesFailed += 1;
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = log.result();
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }
}

function toTradingCalendar(
  published: Array<{ year: number; nonTradingDays: Array<{ date: IsoDate }> }>,
): TradingCalendar {
  return new TradingCalendar(
    published.map((stored) => ({
      year: stored.year,
      nonTradingDays: stored.nonTradingDays.map((day) => day.date),
    })),
  );
}

/** RB11: cotação em dia que o calendário diz não ter pregão mostra calendário errado. */
function tradingDayProblem(calendar: TradingCalendar, date: IsoDate): string | null {
  try {
    return calendar.isTradingDay(date) ? null : `cotação em ${date}, dia sem pregão no calendário`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}
