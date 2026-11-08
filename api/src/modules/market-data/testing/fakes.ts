import {
  isoDateInBrasilia,
  type AssetClass,
  type AssetOrigin,
  type IndicatorCode,
  type IsoDate,
  type NonTradingDay,
  type SectorCode,
} from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import type { PriceEventInput } from '../../financial-calculation/price-adjustment.js';
import type { CorporateEvent } from '../domain/b3-events.js';
import type { ParsedDividend } from '../domain/investidor10-page.js';
import {
  QuoteSourceError,
  type AssetCollection,
  type AssetListing,
  type B3CompanySource,
  type CorporateEventRepository,
  type FundamentalsAsset,
  type FundamentalsRepository,
  type Investidor10Source,
  type MarketIndexRepository,
  type MarketIndexSource,
  type StoredMarketIndex,
  type StoredFundamentals,
  type AutomaticChange,
  type B3Trade,
  type B3TradeRepository,
  type B3TradeScanner,
  type CalendarRepository,
  type CatalogEntry,
  type CatalogImportRepository,
  type ImportedAsset,
  type ListedAsset,
  type ListKind,
  type LogoImage,
  type LogoRecord,
  type LogoRepository,
  type LogoSource,
  type QuoteListSource,
  type CotahistSource,
  type DailyClose,
  type DailyQuote,
  type DailySession,
  type HistoryAsset,
  type IndexRateRepository,
  type IndexSource,
  type IndexSourceError,
  type IngestionTask,
  type IntradayQuote,
  type IntradayQuoteRepository,
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
  type StoredCalendarYear,
  type StoredIndexer,
  type TaskRunReader,
  type TaskRunRepository,
} from '../application/ports.js';
import { cotahistFile, type CotahistLineFields } from './cotahist-fixtures.js';

/** O que veio do Investidor10, em memória (SPECs 041 e 042), sobre uma lista de ativos. */
export class InMemoryFundamentals implements FundamentalsRepository {
  readonly saved = new Map<string, { collection: AssetCollection; at: Date }>();
  readonly visits = new Map<string, { status: 'ok' | 'sem_pagina' | 'erro'; at: Date }>();

  constructor(readonly assets: FundamentalsAsset[] = []) {}

  listActiveAssets(): Promise<FundamentalsAsset[]> {
    return Promise.resolve([...this.assets].sort((a, b) => a.ticker.localeCompare(b.ticker)));
  }

  visitedAssets(): Promise<Set<string>> {
    return Promise.resolve(new Set(this.visits.keys()));
  }

  save(collection: AssetCollection, at: Date): Promise<void> {
    this.saved.set(collection.assetId, { collection, at });
    this.visits.set(collection.assetId, { status: 'ok', at });
    return Promise.resolve();
  }

  markVisit(assetId: string, status: 'sem_pagina' | 'erro', at: Date): Promise<void> {
    this.visits.set(assetId, { status, at });
    return Promise.resolve();
  }

  fundamentals(assetId: string): Promise<StoredFundamentals | null> {
    const asset = this.assets.find((item) => item.id === assetId);
    if (!asset) return Promise.resolve(null);
    const entry = this.saved.get(assetId);
    const values = new Map<IndicatorCode, Map<string, string | null>>();
    for (const [code, value] of entry?.collection.current ?? []) {
      values.set(code, new Map([['atual', value]]));
    }
    for (const [code, years] of entry?.collection.history ?? []) {
      const byPeriod = values.get(code) ?? new Map<string, string | null>();
      for (const [year, value] of years) byPeriod.set(year, value);
      values.set(code, byPeriod);
    }
    return Promise.resolve({
      assetClass: asset.assetClass,
      status: this.visits.get(assetId)?.status ?? null,
      collectedAt: entry?.at ?? null,
      values,
      fund: entry?.collection.fund ?? null,
    });
  }

  dividends(assetId: string, since: IsoDate | null): Promise<ParsedDividend[]> {
    const list = this.saved.get(assetId)?.collection.dividends ?? [];
    return Promise.resolve(
      list
        .filter((dividend) => since === null || dividend.exDate >= since)
        .sort((a, b) => b.exDate.localeCompare(a.exDate)),
    );
  }

  visitCounts(): Promise<{ ok: number; sem_pagina: number; erro: number }> {
    const counts = { ok: 0, sem_pagina: 0, erro: 0 };
    for (const visit of this.visits.values()) counts[visit.status] += 1;
    return Promise.resolve(counts);
  }

  clear(): Promise<number> {
    const removed = this.saved.size + this.visits.size;
    this.saved.clear();
    this.visits.clear();
    return Promise.resolve(removed);
  }
}

/**
 * "Investidor10" em memória: HTML por caminho e histórico por id. Página sem entrada é "não existe";
 * `failures` faz as próximas consultas falharem, uma por item.
 */
export class FakeInvestidor10Source implements Investidor10Source {
  readonly pages = new Map<string, string>();
  readonly histories = new Map<number, unknown>();
  readonly requests: string[] = [];
  failures: Error[] = [];

  page(path: string): Promise<string | null> {
    this.requests.push(path);
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(this.pages.get(path) ?? null);
  }

  history(id: number): Promise<unknown> {
    this.requests.push(`historico/${id}`);
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(this.histories.get(id) ?? null);
  }
}

/** Eventos corporativos em memória (SPEC-042). */
export class InMemoryEvents implements CorporateEventRepository {
  readonly byAsset = new Map<string, CorporateEvent[]>();

  replace(assetId: string, events: CorporateEvent[], _at?: Date): Promise<void> {
    this.byAsset.set(assetId, [...events]);
    return Promise.resolve();
  }

  forAsset(assetId: string): Promise<PriceEventInput[]> {
    return Promise.resolve(
      (this.byAsset.get(assetId) ?? [])
        .map(({ kind, exDate, factor }) => ({ kind, exDate, factor }))
        .sort((a, b) => a.exDate.localeCompare(b.exDate)),
    );
  }
}

/** "B3" em memória: a resposta da página de cada empresa, pelo código de 4 letras. */
export class FakeB3CompanySource implements B3CompanySource {
  readonly companies = new Map<string, unknown>();
  readonly requests: string[] = [];
  failures: Error[] = [];

  company(code: string): Promise<unknown> {
    this.requests.push(code);
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(this.companies.get(code) ?? null);
  }
}

/** Série dos indexadores em memória (SPEC-007), com o CDI cadastrado como na migração. */
export class InMemoryIndexRates implements IndexRateRepository {
  readonly indexer: StoredIndexer = { id: 'idx-cdi', code: 'CDI', sgsSeries: 12 };
  /** Valor guardado por data, como a coluna (6 casas). */
  readonly rates = new Map<IsoDate, string>();
  readonly loaded = new Map<number, number>();

  findIndexer(code: string): Promise<StoredIndexer | null> {
    return Promise.resolve(code === this.indexer.code ? this.indexer : null);
  }

  rateDates(): Promise<IsoDate[]> {
    return Promise.resolve([...this.rates.keys()].sort());
  }

  loadedYears(): Promise<Set<number>> {
    return Promise.resolve(new Set(this.loaded.keys()));
  }

  save(
    _indexerId: string,
    rates: ReadonlyArray<{ date: IsoDate; value: string }>,
  ): Promise<number> {
    let changed = 0;
    for (const { date, value } of rates) {
      const [integer, fraction = ''] = value.split('.');
      const stored = `${integer}.${fraction.padEnd(6, '0')}`;
      if (this.rates.get(date) === stored) continue;
      this.rates.set(date, stored);
      changed += 1;
    }
    return Promise.resolve(changed);
  }

  markYearLoaded(_indexerId: string, year: number, records: number): Promise<void> {
    this.loaded.set(year, records);
    return Promise.resolve();
  }
}

/**
 * "Banco Central" em memória: linhas da série por data. `failures` faz as próximas consultas
 * falharem, uma por item; `published` limita até que dia o CDI já saiu.
 */
export class FakeIndexSource implements IndexSource {
  readonly rows = new Map<IsoDate, string>();
  readonly requests: Array<{ code: number; from: IsoDate; to: IsoDate }> = [];
  failures: IndexSourceError[] = [];
  extraRows: unknown[] = [];

  series(code: number, from: IsoDate, to: IsoDate): Promise<unknown[] | null> {
    this.requests.push({ code, from, to });
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    const found = [...this.rows]
      .filter(([date]) => date >= from && date <= to)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, valor]) => ({
        data: `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
        valor,
      }));
    const all = [...found, ...this.extraRows];
    return Promise.resolve(all.length > 0 ? all : null);
  }
}

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
      source: publication.source ?? 'collaborator',
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

  async quoteRange(assetId: string): Promise<QuoteRange | null> {
    return (await this.quoteRanges()).get(assetId) ?? null;
  }

  loadedYearsOf(assetId: string): Promise<Set<number>> {
    return Promise.resolve(new Set(this.loaded.get(assetId)));
  }

  /** SPEC-010: os últimos pregões da B3, do mais novo para o mais antigo. */
  sessions(assetId: string, count: number): Promise<DailySession[]> {
    return Promise.resolve(
      this.fromB3(assetId)
        .reverse()
        .slice(0, count)
        .map(({ date, open, high, low, close, trades, volume }) => ({
          date,
          open,
          high,
          low,
          close,
          trades,
          volume,
        })),
    );
  }

  closes(assetId: string, from: IsoDate | null): Promise<DailyClose[]> {
    return Promise.resolve(
      this.fromB3(assetId)
        .filter((quote) => from === null || quote.date >= from)
        .map(({ date, close }) => ({ date, close })),
    );
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

  /** Volume do último pregão da B3 de cada ativo (SPEC-040). */
  lastVolumes(): Promise<Map<string, string>> {
    const latest = new Map<string, DailyQuote>();
    for (const quote of this.quotes.values()) {
      if (quote.source !== 'b3_cotahist' || quote.volume === null) continue;
      const current = latest.get(quote.assetId);
      if (!current || quote.date > current.date) latest.set(quote.assetId, quote);
    }
    return Promise.resolve(
      new Map([...latest].map(([assetId, quote]) => [assetId, quote.volume ?? '0'])),
    );
  }

  closesOf(assetId: string): Array<[IsoDate, string]> {
    return [...this.quotes.values()]
      .filter((quote) => quote.assetId === assetId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((quote) => [quote.date, quote.close]);
  }

  /** Cotações da B3 de um ativo, em ordem de data. */
  private fromB3(assetId: string): DailyQuote[] {
    return [...this.quotes.values()]
      .filter((quote) => quote.assetId === assetId && quote.source === 'b3_cotahist')
      .sort((a, b) => a.date.localeCompare(b.date));
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
      totals: run.result?.totals ?? null,
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

  async latestOf(level: QuoteLevel, assetId: string): Promise<LatestIntradayQuote | null> {
    return (await this.latest(level)).get(assetId) ?? null;
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

/** Um papel da lista, com valores padrão para os testes. */
export function listed(ticker: string, overrides: Partial<ListedAsset> = {}): ListedAsset {
  return {
    ticker,
    name: `${ticker} S.A.`,
    subType: /11$/.test(ticker) ? 'fii' : 'stock',
    subsector: null,
    logoUrl: `https://icons.brapi.dev/icons/${ticker}.svg`,
    price: '10.00',
    change: '0.50',
    ...overrides,
  };
}

type FakeListFailure = { error: QuoteSourceErrorKind; usage?: QuoteUsage };
type FakeListAnswer = ListedAsset[] | FakeListFailure;

/**
 * "brapi" em memória: uma resposta por lista, ou uma fila (`queue`), uma por consulta. Lista sem
 * resposta volta vazia. Conta as consultas; com `usage`, finge que a brapi desconta da cota.
 */
export class FakeListSource implements QuoteListSource {
  readonly answers = new Map<ListKind, FakeListAnswer>();
  readonly queues = new Map<ListKind, FakeListAnswer[]>();
  readonly requests: ListKind[] = [];
  usage: QuoteUsage | null = null;

  constructor(readonly tokenConfigured = true) {}

  /** As próximas consultas desta lista recebem estas respostas, em ordem. */
  queue(kind: ListKind, ...answers: FakeListAnswer[]): this {
    this.queues.set(kind, [...(this.queues.get(kind) ?? []), ...answers]);
    return this;
  }

  list(kind: ListKind): Promise<AssetListing> {
    this.requests.push(kind);
    if (this.usage) {
      this.usage = { ...this.usage, remaining: Math.max(0, this.usage.remaining - 1) };
    }
    const answer = this.queues.get(kind)?.shift() ?? this.answers.get(kind) ?? [];
    if (!Array.isArray(answer)) {
      return Promise.reject(
        new QuoteSourceError(
          answer.error,
          `falha simulada: ${answer.error}`,
          answer.usage ?? this.usage,
        ),
      );
    }
    return Promise.resolve({
      assets: answer.map((asset) => ({ ...asset })),
      requests: 1,
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

/** Negócios da B3 em memória (SPEC-040), com a mesma regra do PostgreSQL: a data só avança. */
export class InMemoryB3Trades implements B3TradeRepository {
  readonly trades = new Map<string, B3Trade>();

  record(trades: B3Trade[], _at?: Date): Promise<void> {
    for (const trade of trades) {
      const current = this.trades.get(trade.ticker);
      if (!current || trade.lastTradingDay >= current.lastTradingDay) {
        this.trades.set(trade.ticker, { ...trade });
      }
    }
    return Promise.resolve();
  }

  all(): Promise<Map<string, B3Trade>> {
    return Promise.resolve(new Map([...this.trades].map(([ticker, t]) => [ticker, { ...t }])));
  }

  /** Atalho dos testes: o ticker negociou pela última vez nesta data. */
  traded(ticker: string, lastTradingDay: IsoDate, assetClass?: AssetClass): this {
    this.trades.set(ticker, {
      ticker,
      lastTradingDay,
      assetClass: assetClass ?? (/11$/.test(ticker) ? 'fii' : 'stock'),
    });
    return this;
  }
}

/** Leitor dos arquivos anuais que só anota os anos pedidos e devolve os problemas combinados. */
export class FakeTradeScanner implements B3TradeScanner {
  readonly calls: number[][] = [];
  problems: string[] = [];
  /** O que a leitura "encontra" nos arquivos. */
  found: B3Trade[] = [];

  constructor(private readonly trades: InMemoryB3Trades) {}

  async refreshTrades(years: number[]): Promise<string[]> {
    this.calls.push([...years]);
    await this.trades.record(this.found);
    return [...this.problems];
  }
}

/** Ativo do catálogo em memória, com os campos que a importação lê e escreve. */
export interface CatalogRow {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: SectorCode;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  origin: AssetOrigin;
  classificationReviewedAt: Date | null;
  autoDeactivated: boolean;
}

/** Escritas da importação sobre um catálogo em memória, com a auditoria junto. */
export class InMemoryCatalogImport implements CatalogImportRepository {
  constructor(
    private readonly rows: CatalogRow[],
    readonly audit: InMemoryAuditTrail = new InMemoryAuditTrail(),
  ) {}

  entries(): Promise<CatalogEntry[]> {
    return Promise.resolve(
      this.rows.map((row) => ({
        id: row.id,
        ticker: row.ticker,
        assetClass: row.assetClass,
        createdAt: row.createdAt,
        deactivatedAt: row.deactivatedAt,
        autoDeactivated: row.autoDeactivated,
      })),
    );
  }

  createImported(assets: ImportedAsset[], at: Date): Promise<ImportedAsset[]> {
    const created: ImportedAsset[] = [];
    for (const asset of assets) {
      if (this.rows.some((row) => row.ticker === asset.ticker)) continue;
      this.rows.push({
        ...asset,
        createdAt: at,
        updatedAt: at,
        deactivatedAt: null,
        origin: 'import',
        classificationReviewedAt: null,
        autoDeactivated: false,
      });
      this.audit.append({
        at,
        collaboratorId: null,
        action: 'asset_imported',
        entity: 'asset',
        entityId: asset.id,
        details: {
          after: {
            ticker: asset.ticker,
            name: asset.name,
            class: asset.assetClass,
            sector: asset.sector,
          },
        },
      });
      created.push(asset);
    }
    return Promise.resolve(created);
  }

  autoDeactivate(changes: AutomaticChange[], at: Date): Promise<number> {
    let changed = 0;
    for (const change of changes) {
      const row = this.rows.find((item) => item.id === change.id && item.deactivatedAt === null);
      if (!row) continue;
      Object.assign(row, { deactivatedAt: at, autoDeactivated: true, updatedAt: at });
      this.audit.append({
        at,
        collaboratorId: null,
        action: 'asset_auto_deactivated',
        entity: 'asset',
        entityId: row.id,
        details: {
          before: { active: true },
          after: { active: false, lastTradedOn: change.lastTradedOn },
        },
      });
      changed += 1;
    }
    return Promise.resolve(changed);
  }

  autoReactivate(changes: AutomaticChange[], at: Date): Promise<number> {
    let changed = 0;
    for (const change of changes) {
      const row = this.rows.find(
        (item) => item.id === change.id && item.deactivatedAt !== null && item.autoDeactivated,
      );
      if (!row) continue;
      Object.assign(row, { deactivatedAt: null, autoDeactivated: false, updatedAt: at });
      this.audit.append({
        at,
        collaboratorId: null,
        action: 'asset_auto_reactivated',
        entity: 'asset',
        entityId: row.id,
        details: {
          before: { active: false },
          after: { active: true, lastTradedOn: change.lastTradedOn },
        },
      });
      changed += 1;
    }
    return Promise.resolve(changed);
  }
}

/** Logos em memória (SPEC-040). */
export class InMemoryLogoRepository implements LogoRepository {
  readonly logos = new Map<string, LogoRecord & { downloadedAt: Date }>();

  downloadedAt(): Promise<Map<string, Date>> {
    return Promise.resolve(
      new Map([...this.logos].map(([assetId, logo]) => [assetId, logo.downloadedAt])),
    );
  }

  save(logos: LogoRecord[], at: Date): Promise<void> {
    for (const logo of logos) this.logos.set(logo.assetId, { ...logo, downloadedAt: at });
    return Promise.resolve();
  }

  find(assetId: string): Promise<LogoImage | null> {
    const logo = this.logos.get(assetId);
    return Promise.resolve(logo?.status === 'ok' ? logo.image : null);
  }

  withLogo(): Promise<Set<string>> {
    return Promise.resolve(
      new Set([...this.logos].filter(([, logo]) => logo.status === 'ok').map(([id]) => id)),
    );
  }
}

/** Imagem SVG mínima, diferente para cada texto. */
export function svgLogo(text: string): LogoImage {
  return {
    type: 'image/svg+xml',
    content: new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`,
    ),
  };
}

/**
 * "Servidor de ícones" em memória: endereço da brapi sem imagem combinada devolve um SVG próprio
 * daquele endereço; `failing` responde erro; outro servidor também.
 */
export class FakeLogoSource implements LogoSource {
  readonly images = new Map<string, LogoImage>();
  readonly failing = new Set<string>();
  readonly requests: string[] = [];

  download(url: string): Promise<LogoImage> {
    this.requests.push(url);
    if (this.failing.has(url) || !url.startsWith('https://icons.brapi.dev/')) {
      return Promise.reject(new Error(`logo respondeu 404 (${url})`));
    }
    return Promise.resolve(this.images.get(url) ?? svgLogo(url));
  }
}

/** Índices da B3 em memória (SPEC-020): fechamento guardado por índice e data, como a coluna. */
export class InMemoryMarketIndexes implements MarketIndexRepository {
  readonly indexes: StoredMarketIndex[] = [
    { id: 'idx-ibov', code: 'IBOV' },
    { id: 'idx-ifix', code: 'IFIX' },
  ];
  readonly closes = new Map<string, Map<IsoDate, string>>();
  readonly loaded = new Map<string, Map<number, number>>();

  findIndex(code: string): Promise<StoredMarketIndex | null> {
    return Promise.resolve(this.indexes.find((index) => index.code === code) ?? null);
  }

  closeDates(indexId: string): Promise<IsoDate[]> {
    return Promise.resolve([...(this.closes.get(indexId)?.keys() ?? [])].sort());
  }

  loadedYears(indexId: string): Promise<Set<number>> {
    return Promise.resolve(new Set(this.loaded.get(indexId)?.keys() ?? []));
  }

  save(indexId: string, closes: ReadonlyArray<{ date: IsoDate; value: string }>): Promise<number> {
    const stored = this.closes.get(indexId) ?? new Map<IsoDate, string>();
    this.closes.set(indexId, stored);
    let changed = 0;
    for (const { date, value } of closes) {
      const [integer, fraction = ''] = value.split('.');
      const text = `${integer}.${fraction.padEnd(2, '0')}`;
      if (stored.get(date) === text) continue;
      stored.set(date, text);
      changed += 1;
    }
    return Promise.resolve(changed);
  }

  markYearLoaded(indexId: string, year: number, records: number): Promise<void> {
    const years = this.loaded.get(indexId) ?? new Map<number, number>();
    years.set(year, records);
    this.loaded.set(indexId, years);
    return Promise.resolve();
  }
}

/**
 * Estatísticas da B3 em memória (SPEC-020): fechamentos por índice e data, devolvidos no formato do
 * site (dia × mês, "168.498,45"). `failures` faz os próximos pedidos falharem, um por item.
 */
export class FakeMarketIndexSource implements MarketIndexSource {
  readonly closes = new Map<string, Map<IsoDate, string>>();
  readonly requests: Array<{ code: string; year: number }> = [];
  failures: Error[] = [];
  /** Resposta trocada por inteiro num ano ("IBOV:2025"). */
  readonly bodies = new Map<string, unknown>();

  year(code: string, year: number): Promise<unknown> {
    this.requests.push({ code, year });
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    const body = this.bodies.get(`${code}:${year}`);
    if (body !== undefined) return Promise.resolve(body);
    const results = Array.from({ length: 31 }, (_, index) => {
      const row: Record<string, unknown> = { day: index + 1 };
      for (let month = 1; month <= 12; month += 1) row[`rateValue${month}`] = null;
      return row;
    });
    for (const [date, value] of this.closes.get(code) ?? []) {
      if (Number(date.slice(0, 4)) !== year) continue;
      const row = results[Number(date.slice(8, 10)) - 1];
      if (row) row[`rateValue${Number(date.slice(5, 7))}`] = b3Number(value);
    }
    return Promise.resolve({ min: {}, max: {}, results });
  }
}

/** "168498.45" como a B3 mostra: "168.498,45". */
export function b3Number(value: string): string {
  const [integer = '0', fraction = ''] = value.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
}
