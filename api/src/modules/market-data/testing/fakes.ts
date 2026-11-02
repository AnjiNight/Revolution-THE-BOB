import { isoDateInBrasilia, type IsoDate, type NonTradingDay } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import {
  QuoteSourceError,
  type CalendarRepository,
  type CotahistSource,
  type DailyQuote,
  type HistoryAsset,
  type IngestionTask,
  type IntradayQuote,
  type IntradayQuoteRepository,
  type IntradayQuoteSource,
  type LatestIntradayQuote,
  type LoadedYear,
  type NewCalendarPublication,
  type QuoteLevel,
  type QuoteRange,
  type QuoteRepository,
  type QuoteSource,
  type QuoteSourceErrorKind,
  type QuoteUsage,
  type RunResult,
  type RunSummary,
  type SourceQuote,
  type StoredCalendarYear,
  type TaskRunReader,
  type TaskRunRepository,
} from '../application/ports.js';
import { cotahistFile, type CotahistLineFields } from './cotahist-fixtures.js';

/** Calendário em memória para testes sem banco. */
export class InMemoryCalendarRepository implements CalendarRepository {
  readonly years = new Map<number, StoredCalendarYear>();

  constructor(readonly audit: InMemoryAuditTrail = new InMemoryAuditTrail()) {}

  findYear(year: number): Promise<StoredCalendarYear | null> {
    return Promise.resolve(this.copy(this.years.get(year)));
  }

  findYears(from: number, to: number): Promise<StoredCalendarYear[]> {
    const found = [...this.years.values()]
      .filter((stored) => stored.year >= from && stored.year <= to)
      .sort((a, b) => a.year - b.year)
      .map((stored) => this.copy(stored) as StoredCalendarYear);
    return Promise.resolve(found);
  }

  publish(
    publication: NewCalendarPublication,
    audit: (before: NonTradingDay[] | null) => AuditEntry,
  ): Promise<StoredCalendarYear> {
    const before = this.years.get(publication.year)?.nonTradingDays.map((day) => ({ ...day }));
    this.audit.append(audit(before ?? null));
    const stored: StoredCalendarYear = {
      ...publication,
      nonTradingDays: [...publication.nonTradingDays].sort((a, b) => a.date.localeCompare(b.date)),
    };
    this.years.set(publication.year, stored);
    return Promise.resolve(this.copy(stored) as StoredCalendarYear);
  }

  private copy(stored: StoredCalendarYear | undefined): StoredCalendarYear | null {
    return stored
      ? { ...stored, nonTradingDays: stored.nonTradingDays.map((day) => ({ ...day })) }
      : null;
  }
}

/** Cotações guardadas em memória, com a mesma precedência do PostgreSQL (DA18). */
export class InMemoryQuoteRepository implements QuoteRepository {
  readonly assets: HistoryAsset[] = [];
  /** Chave `ativo|data`. */
  readonly quotes = new Map<string, DailyQuote & { source: QuoteSource }>();
  readonly loaded = new Map<string, Set<number>>();

  /** `catalog`: lê os ativos de outro lugar (o catálogo em memória do servidor de teste). */
  constructor(private readonly catalog?: () => HistoryAsset[]) {}

  listAssets(): Promise<HistoryAsset[]> {
    return Promise.resolve((this.catalog?.() ?? this.assets).map((asset) => ({ ...asset })));
  }

  loadedYears(): Promise<Map<string, Set<number>>> {
    return Promise.resolve(new Map([...this.loaded].map(([id, years]) => [id, new Set(years)])));
  }

  quoteRanges(): Promise<Map<string, QuoteRange>> {
    const ranges = new Map<string, QuoteRange>();
    for (const quote of this.quotes.values()) {
      // Só o que veio da B3 (SPEC-009): o provisório da brapi não conta.
      if (quote.source !== 'b3_cotahist') continue;
      const range = ranges.get(quote.assetId);
      ranges.set(quote.assetId, {
        from: range && range.from < quote.date ? range.from : quote.date,
        to: range && range.to > quote.date ? range.to : quote.date,
      });
    }
    return Promise.resolve(ranges);
  }

  save(quotes: DailyQuote[], source: QuoteSource): Promise<number> {
    let saved = 0;
    for (const quote of quotes) {
      const key = `${quote.assetId}|${quote.date}`;
      const existing = this.quotes.get(key);
      if (existing && existing.source === 'b3_cotahist' && source !== 'b3_cotahist') continue;
      this.quotes.set(key, { ...quote, source });
      saved += 1;
    }
    return Promise.resolve(saved);
  }

  markYearsLoaded(years: LoadedYear[]): Promise<void> {
    for (const { assetId, year } of years) {
      const set = this.loaded.get(assetId) ?? new Set<number>();
      set.add(year);
      this.loaded.set(assetId, set);
    }
    return Promise.resolve();
  }

  closesOf(assetId: string): Array<[IsoDate, string]> {
    return [...this.quotes.values()]
      .filter((quote) => quote.assetId === assetId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((quote) => [quote.date, quote.close]);
  }
}

export class InMemoryTaskRuns implements TaskRunRepository, TaskRunReader {
  readonly runs: Array<{
    id: string;
    task: IngestionTask;
    startedAt: Date;
    finishedAt: Date | null;
    result: RunResult | null;
  }> = [];

  start(task: IngestionTask, at: Date = new Date()): Promise<string> {
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({ id, task, startedAt: at, finishedAt: null, result: null });
    return Promise.resolve(id);
  }

  finish(id: string, result: RunResult, at: Date = new Date()): Promise<void> {
    const run = this.runs.find((item) => item.id === id);
    if (run) {
      run.result = result;
      run.finishedAt = at;
    }
    return Promise.resolve();
  }

  lastRun(task: IngestionTask): Promise<RunSummary | null> {
    const run = this.runs.filter((item) => item.task === task).at(-1);
    if (!run) return Promise.resolve(null);
    return Promise.resolve({
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.result?.status ?? null,
      requests: run.result?.requests ?? 0,
      quota: run.result?.quota ?? null,
    });
  }

  requestsSince(task: IngestionTask, since: Date): Promise<number> {
    return Promise.resolve(
      this.of(task, since).reduce((sum, run) => sum + (run.result?.requests ?? 0), 0),
    );
  }

  runsSince(task: IngestionTask, since: Date): Promise<number> {
    return Promise.resolve(this.of(task, since).length);
  }

  private of(task: IngestionTask, since: Date) {
    return this.runs.filter((run) => run.task === task && run.startedAt >= since);
  }
}

/** Cotações do pregão em memória; o fechamento guardado vem do histórico em memória. */
export class InMemoryIntradayQuoteRepository implements IntradayQuoteRepository {
  /** Chave `ativo|horário|nível`. */
  readonly quotes = new Map<string, IntradayQuote>();

  constructor(
    private readonly catalog: () => Array<HistoryAsset & { active: boolean }>,
    private readonly daily: InMemoryQuoteRepository,
  ) {}

  activeAssets(): Promise<HistoryAsset[]> {
    return Promise.resolve(
      this.catalog()
        .filter((asset) => asset.active)
        .map(({ id, ticker }) => ({ id, ticker }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    );
  }

  save(quotes: IntradayQuote[]): Promise<number> {
    let saved = 0;
    for (const quote of quotes) {
      const key = `${quote.assetId}|${quote.at.toISOString()}|${quote.level}`;
      if (this.quotes.has(key)) continue;
      this.quotes.set(key, { ...quote });
      saved += 1;
    }
    return Promise.resolve(saved);
  }

  latest(level: QuoteLevel): Promise<Map<string, LatestIntradayQuote>> {
    const latest = new Map<string, LatestIntradayQuote>();
    for (const quote of this.quotes.values()) {
      if (quote.level !== level) continue;
      const current = latest.get(quote.assetId);
      if (current && current.at >= quote.at) continue;
      latest.set(quote.assetId, {
        ...quote,
        storedPreviousClose: this.closeBefore(quote.assetId, isoDateInBrasilia(quote.at)),
      });
    }
    return Promise.resolve(latest);
  }

  closesBefore(date: string): Promise<Map<string, string>> {
    const closes = new Map<string, string>();
    for (const quote of this.daily.quotes.values()) {
      if (quote.date >= date || closes.has(quote.assetId)) continue;
      const close = this.closeBefore(quote.assetId, date);
      if (close) closes.set(quote.assetId, close);
    }
    return Promise.resolve(closes);
  }

  deleteBefore(instant: Date): Promise<number> {
    let deleted = 0;
    for (const [key, quote] of this.quotes) {
      if (quote.at < instant) {
        this.quotes.delete(key);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  private closeBefore(assetId: string, date: string): string | null {
    const previous = [...this.daily.quotes.values()]
      .filter((quote) => quote.assetId === assetId && quote.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return previous?.close ?? null;
  }
}

type FakeAnswer =
  Partial<Omit<SourceQuote, 'usage'>> | { error: QuoteSourceErrorKind; usage?: QuoteUsage };

/**
 * "brapi" em memória: uma resposta por ticker (ou uma lista, uma por consulta). Ticker sem
 * resposta é "não encontrado". Conta as consultas e devolve a cota que restaria.
 */
export class FakeQuoteSource implements IntradayQuoteSource {
  readonly answers = new Map<string, FakeAnswer | FakeAnswer[]>();
  readonly requests: string[] = [];
  usage: QuoteUsage | null = null;

  constructor(
    private readonly clock: () => Date,
    readonly tokenConfigured = true,
  ) {}

  quote(ticker: string): Promise<SourceQuote> {
    this.requests.push(ticker);
    if (this.usage)
      this.usage = { ...this.usage, remaining: Math.max(0, this.usage.remaining - 1) };
    const stored = this.answers.get(ticker);
    const answer = Array.isArray(stored) ? stored.shift() : stored;
    if (!answer) {
      return Promise.reject(
        new QuoteSourceError('not_found', 'ticker não encontrado na brapi (404)'),
      );
    }
    if ('error' in answer) {
      return Promise.reject(
        new QuoteSourceError(
          answer.error,
          `falha simulada: ${answer.error}`,
          answer.usage ?? this.usage,
        ),
      );
    }
    return Promise.resolve({
      price: '10.00',
      at: this.clock(),
      open: null,
      high: null,
      low: null,
      previousClose: null,
      ...answer,
      usage: this.usage,
    });
  }
}

type FakeFile = CotahistLineFields[] | string[] | 'fail';

/**
 * "B3" em memória: arquivos anuais por ano e diários por data. `'fail'` simula a B3 fora do ar;
 * ano ou dia sem arquivo é "ainda não publicado".
 */
export class FakeCotahistSource implements CotahistSource {
  readonly annualFiles = new Map<number, FakeFile>();
  readonly dailyFiles = new Map<IsoDate, FakeFile>();
  readonly requests: string[] = [];

  annual(year: number, closed: boolean): Promise<AsyncIterable<string> | null> {
    this.requests.push(`A${year}${closed ? '' : '*'}`);
    return this.serve(this.annualFiles.get(year));
  }

  daily(date: IsoDate): Promise<AsyncIterable<string> | null> {
    this.requests.push(`D${date}`);
    return this.serve(this.dailyFiles.get(date));
  }

  private serve(file: FakeFile | undefined): Promise<AsyncIterable<string> | null> {
    if (file === undefined) return Promise.resolve(null);
    if (file === 'fail') return Promise.reject(new Error('B3 respondeu 503'));
    const lines =
      typeof file[0] === 'string'
        ? (file as string[])
        : cotahistFile(file as CotahistLineFields[]).split('\r\n');
    return Promise.resolve(
      (async function* () {
        await Promise.resolve();
        yield* lines;
      })(),
    );
  }
}
