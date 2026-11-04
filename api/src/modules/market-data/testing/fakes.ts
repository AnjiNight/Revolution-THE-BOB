import {
  isoDateInBrasilia,
  type AssetClass,
  type AssetOrigin,
  type IsoDate,
  type NonTradingDay,
  type SectorCode,
} from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import { InMemoryAuditTrail } from '../../audit/testing/fakes.js';
import {
  QuoteSourceError,
  type AssetListing,
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
