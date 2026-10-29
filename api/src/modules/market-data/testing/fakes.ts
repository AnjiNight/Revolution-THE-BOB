import type { IsoDate, NonTradingDay } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import type {
  CalendarRepository,
  CotahistSource,
  DailyQuote,
  HistoryAsset,
  IngestionTask,
  LoadedYear,
  NewCalendarPublication,
  QuoteRange,
  QuoteRepository,
  QuoteSource,
  RunResult,
  StoredCalendarYear,
  TaskRunRepository,
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

export class InMemoryTaskRuns implements TaskRunRepository {
  readonly runs: Array<{ id: string; task: IngestionTask; result: RunResult | null }> = [];

  start(task: IngestionTask): Promise<string> {
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({ id, task, result: null });
    return Promise.resolve(id);
  }

  finish(id: string, result: RunResult): Promise<void> {
    const run = this.runs.find((item) => item.id === id);
    if (run) run.result = result;
    return Promise.resolve();
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
