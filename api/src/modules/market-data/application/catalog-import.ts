import { createHash, randomUUID } from 'node:crypto';
import {
  addDays,
  isoDate,
  isoDateInBrasilia,
  isWeekend,
  monthOf,
  NAME_MAX,
  NAME_MIN,
  TICKER_PATTERN,
  yearOf,
  type AssetClass,
  type CatalogImportStatus,
  type IsoDate,
} from '@simulador/shared';
import { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import { suggestSector } from '../domain/catalog-classification.js';
import { brasiliaInstant } from '../domain/trading-session.js';
import {
  QuoteSourceError,
  type AssetListing,
  type AutomaticChange,
  type B3Trade,
  type B3TradeRepository,
  type B3TradeScanner,
  type CalendarRepository,
  type CatalogImportRepository,
  type ImportedAsset,
  type ListedAsset,
  type ListKind,
  type LogoImage,
  type LogoRecord,
  type LogoRepository,
  type LogoSource,
  type QuoteListSource,
  type RunError,
  type RunResult,
  type RunStatus,
  type TaskRunReader,
  type TaskRunRepository,
} from './ports.js';

const TASK = 'importacao_catalogo' as const;
/** Entra no catálogo quem teve negócio na B3 nos últimos 3 meses (decisão 3 da SPEC-040). */
export const RECENT_TRADE_MONTHS = 3;
/** Logo baixado de novo depois de 30 dias. */
export const LOGO_REFRESH_DAYS = 30;
/** O logo genérico da brapi, para quem não tem um próprio (§4.3, T4). */
const GENERIC_LOGO_FILE = 'BRAPI.svg';
/** A mesma imagem em tantos tickers numa importação é genérica, mesmo com outro nome de arquivo. */
export const GENERIC_LOGO_REPEATS = 5;
/** Negócios da B3 guardados mais antigos que isto: lê o arquivo anual de novo (1ª importação). */
const STALE_TRADES_DAYS = 7;
/** Espera antes da única nova tentativa da lista (erro de rede ou 5xx). */
export const IMPORT_RETRY_DELAY_MS = 10_000;
const MAX_STORED_ERRORS = 100;
const DAY_MS = 24 * 60 * 60_000;

export interface CatalogImportDeps {
  source: QuoteListSource;
  trades: B3TradeRepository;
  /** Lê os arquivos anuais da B3 quando os negócios guardados estão velhos (SPEC-008). */
  scanner: B3TradeScanner;
  catalog: CatalogImportRepository;
  logos: LogoRepository;
  logoSource: LogoSource;
  runs: TaskRunRepository & TaskRunReader;
  calendars: CalendarRepository;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
  retryDelayMs?: number;
}

/**
 * Importação diária do catálogo (SPEC-040): cria os ativos da lista da brapi que negociaram na B3
 * nos últimos 3 meses, desativa quem parou de negociar, reativa quem o processador desativou e
 * voltou, e baixa os logos. Nunca muda ticker, nome, classe ou classificação de quem já existe: o
 * que o colaborador edita nunca é desfeito.
 */
export class CatalogImport {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newId: () => string;
  private readonly retryDelayMs: number;

  constructor(private readonly deps: CatalogImportDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newId = deps.newId ?? randomUUID;
    this.retryDelayMs = deps.retryDelayMs ?? IMPORT_RETRY_DELAY_MS;
  }

  /** Roda a importação do dia; se ela já terminou hoje (sem falha), devolve `null`. */
  async run(): Promise<RunResult | null> {
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    const last = await this.deps.runs.lastRun(TASK);
    const ranToday = last !== null && last.startedAt >= brasiliaInstant(today, 0);
    if (ranToday && last.status !== null && last.status !== 'falha') return null;

    return this.record(async (log) => {
      const listed = await this.listAll(log);
      if (!listed) return;
      const window = recentWindowStart(today);
      const trades = await this.freshTrades(log, today, window);
      const previous = previousTradingDay(
        await this.deps.calendars.findYears(yearOf(today) - 1, yearOf(today)),
        today,
      );
      const latest = latestDay(trades);
      const upToDate = latest !== null && latest >= previous;
      log.b3Behind = !upToDate;

      const entries = await this.deps.catalog.entries();
      const known = new Set(entries.map((entry) => entry.ticker));
      const fresh: ImportedAsset[] = [];
      for (const asset of listed.values()) {
        if (known.has(asset.ticker)) continue;
        const candidate = this.candidate(log, asset, trades.get(asset.ticker), window);
        if (candidate) fresh.push(candidate);
      }
      log.created = (await this.deps.catalog.createImported(fresh, this.clock())).length;

      const windowStart = brasiliaInstant(window, 0);
      const deactivate: AutomaticChange[] = [];
      const reactivate: AutomaticChange[] = [];
      for (const entry of entries) {
        const lastTradedOn = trades.get(entry.ticker)?.lastTradingDay ?? null;
        const recent = lastTradedOn !== null && lastTradedOn >= window;
        if (entry.deactivatedAt === null) {
          // Com a B3 atrasada, ninguém sai: a falta de negócio pode ser só o arquivo que não chegou.
          // Ativo nunca negociado só sai depois de 3 meses no catálogo (o IPO que vai estrear).
          if (upToDate && !recent && (lastTradedOn !== null || entry.createdAt < windowStart)) {
            deactivate.push({ id: entry.id, lastTradedOn });
          }
        } else if (entry.autoDeactivated && recent) {
          reactivate.push({ id: entry.id, lastTradedOn });
        }
      }
      log.deactivated = await this.deps.catalog.autoDeactivate(deactivate, this.clock());
      log.reactivated = await this.deps.catalog.autoReactivate(reactivate, this.clock());

      await this.refreshLogos(log, listed);
    });
  }

  /** Situação da última importação, para a tela do colaborador (SPEC-040 §5.3). */
  async status(): Promise<CatalogImportStatus> {
    const last = await this.deps.runs.lastRun(TASK);
    const totals = last?.totals ?? {};
    const count = (name: string) => {
      const value = totals[name];
      return typeof value === 'number' ? value : 0;
    };
    const status = last?.status;
    return {
      lastRunAt: (last?.finishedAt ?? last?.startedAt)?.toISOString() ?? null,
      lastStatus:
        status === 'sucesso' || status === 'parcial' || status === 'falha' ? status : null,
      created: count('created'),
      deactivated: count('deactivated'),
      reactivated: count('reactivated'),
      b3Behind: totals.b3Behind === true,
    };
  }

  /** Último pregão com negócio de cada ticker (a tela mostra no ativo desativado sozinho). */
  async lastTradingDays(): Promise<Map<string, IsoDate>> {
    const trades = await this.deps.trades.all();
    return new Map([...trades].map(([ticker, trade]) => [ticker, trade.lastTradingDay]));
  }

  /** Ações e FIIs da lista. Se uma das duas não vier, nada muda no catálogo (`falha`). */
  private async listAll(log: ImportLog): Promise<Map<string, ListedAsset> | null> {
    const listed = new Map<string, ListedAsset>();
    for (const kind of ['stock', 'fii'] as const) {
      const listing = await this.listWithRetry(log, kind);
      if (!listing) return null;
      for (const asset of listing.assets) listed.set(asset.ticker, asset);
    }
    return listed;
  }

  private async listWithRetry(log: ImportLog, kind: ListKind): Promise<AssetListing | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.deps.source.list(kind);
      } catch (error) {
        if (!(error instanceof QuoteSourceError)) throw error;
        if (error.kind === 'unavailable' && attempt === 0) {
          await this.sleep(this.retryDelayMs);
          continue;
        }
        log.failed = true;
        log.error(`lista de ${kind === 'fii' ? 'FIIs' : 'ações'} da brapi: ${error.message}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Negócios guardados da B3. Se estão vazios ou velhos (a primeira importação, antes de a SPEC-008
   * ler algum arquivo do catálogo), lê os arquivos anuais da janela de 3 meses.
   */
  private async freshTrades(
    log: ImportLog,
    today: IsoDate,
    window: IsoDate,
  ): Promise<Map<string, B3Trade>> {
    const trades = await this.deps.trades.all();
    const latest = latestDay(trades);
    if (latest !== null && latest >= addDays(today, -STALE_TRADES_DAYS)) return trades;
    const years = [...new Set([yearOf(window), yearOf(today)])];
    for (const problem of await this.deps.scanner.refreshTrades(years)) log.error(problem);
    return this.deps.trades.all();
  }

  /** O ativo novo, se ele pode entrar; senão, conta (e registra) o motivo. */
  private candidate(
    log: ImportLog,
    asset: ListedAsset,
    trade: B3Trade | undefined,
    window: IsoDate,
  ): ImportedAsset | null {
    if (!TICKER_PATTERN.test(asset.ticker)) {
      log.outOfFormat += 1;
      return null;
    }
    if (!trade || trade.lastTradingDay < window) {
      log.notRecent += 1;
      return null;
    }
    const assetClass: AssetClass = asset.subType === 'fii' ? 'fii' : 'stock';
    if (trade.assetClass !== assetClass) {
      log.mismatched += 1;
      log.error(
        `${asset.ticker}: a brapi diz ${CLASS_LABEL[assetClass]} e a B3 diz ` +
          `${CLASS_LABEL[trade.assetClass]}; não entrou no catálogo`,
      );
      return null;
    }
    const name = cleanName(asset.name);
    if (name.length < NAME_MIN) {
      log.error(`${asset.ticker}: nome "${asset.name}" curto demais; não entrou no catálogo`);
      return null;
    }
    return {
      id: this.newId(),
      ticker: asset.ticker,
      name,
      assetClass,
      sector: suggestSector(assetClass, asset.subsector),
    };
  }

  /**
   * Logos dos ativos ativos que estão na lista: os que faltam e os baixados há mais de 30 dias. O
   * genérico da brapi (pelo nome do arquivo ou repetido em muitos tickers) vira "sem logo". Falha
   * num logo não para a importação: ele é tentado de novo no dia seguinte.
   */
  private async refreshLogos(log: ImportLog, listed: Map<string, ListedAsset>): Promise<void> {
    const now = this.clock();
    const [entries, downloaded] = await Promise.all([
      this.deps.catalog.entries(),
      this.deps.logos.downloadedAt(),
    ]);
    const refreshBefore = now.getTime() - LOGO_REFRESH_DAYS * DAY_MS;
    const records: LogoRecord[] = [];
    const images: Array<{ assetId: string; image: LogoImage; hash: string }> = [];
    for (const entry of entries) {
      if (entry.deactivatedAt !== null) continue;
      const at = downloaded.get(entry.id);
      if (at && at.getTime() >= refreshBefore) continue;
      const url = listed.get(entry.ticker)?.logoUrl;
      if (!url) continue;
      if (isGenericLogoUrl(url)) {
        records.push({ assetId: entry.id, status: 'sem_logo' });
        continue;
      }
      try {
        const image = await this.deps.logoSource.download(url);
        images.push({ assetId: entry.id, image, hash: sha256(image.content) });
      } catch (error) {
        log.logoErrors += 1;
        log.error(
          `${entry.ticker}: ${error instanceof Error ? error.message : String(error)}`,
          entry.id,
        );
      }
    }
    const repeats = new Map<string, number>();
    for (const { hash } of images) repeats.set(hash, (repeats.get(hash) ?? 0) + 1);
    for (const { assetId, image, hash } of images) {
      records.push(
        (repeats.get(hash) ?? 0) >= GENERIC_LOGO_REPEATS
          ? { assetId, status: 'sem_logo' }
          : { assetId, status: 'ok', image, hash },
      );
    }
    await this.deps.logos.save(records, this.clock());
    log.logosSaved = records.filter((record) => record.status === 'ok').length;
    log.logosMissing = records.length - log.logosSaved;
  }

  private async record(body: (log: ImportLog) => Promise<void>): Promise<RunResult> {
    const runId = await this.deps.runs.start(TASK, this.clock());
    const log = new ImportLog();
    try {
      await body(log);
    } catch (error) {
      log.failed = true;
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = log.result();
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }
}

const CLASS_LABEL: Record<AssetClass, string> = { stock: 'ação', fii: 'FII' };

/** Erros e totais de uma importação, montados enquanto ela anda. */
class ImportLog {
  private readonly errors: RunError[] = [];
  private hidden = 0;
  failed = false;
  b3Behind = false;
  created = 0;
  deactivated = 0;
  reactivated = 0;
  logosSaved = 0;
  logosMissing = 0;
  logoErrors = 0;
  notRecent = 0;
  outOfFormat = 0;
  mismatched = 0;

  error(message: string, assetId: string | null = null): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message, assetId });
    else this.hidden += 1;
  }

  result(): RunResult {
    const changed = this.created + this.deactivated + this.reactivated;
    return {
      status: this.status(),
      records: changed,
      affectedAssets: changed,
      periodStart: null,
      periodEnd: null,
      errors:
        this.hidden > 0
          ? [...this.errors, { message: `mais ${this.hidden} erros não guardados` }]
          : this.errors,
      totals: {
        created: this.created,
        deactivated: this.deactivated,
        reactivated: this.reactivated,
        logosSaved: this.logosSaved,
        logosMissing: this.logosMissing,
        logoErrors: this.logoErrors,
        notRecent: this.notRecent,
        outOfFormat: this.outOfFormat,
        mismatched: this.mismatched,
        b3Behind: this.b3Behind,
      },
    };
  }

  private status(): RunStatus {
    if (this.failed) return 'falha';
    if (this.errors.length > 0 || this.b3Behind) return 'parcial';
    return 'sucesso';
  }
}

/** Nome como a fonte informa, sem espaços repetidos e com no máximo 100 caracteres. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

/** Primeiro dia da janela de 3 meses: o mesmo dia, 3 meses antes (ou o último do mês, se faltar). */
export function recentWindowStart(today: IsoDate): IsoDate {
  const months = yearOf(today) * 12 + monthOf(today) - 1 - RECENT_TRADE_MONTHS;
  const year = Math.floor(months / 12);
  const month = (months % 12) + 1;
  const nextMonth = month === 12 ? isoDate(year + 1, 1, 1) : isoDate(year, month + 1, 1);
  const lastDay = Number(addDays(nextMonth, -1).slice(8));
  return isoDate(year, month, Math.min(Number(today.slice(8)), lastDay));
}

/**
 * Pregão anterior a hoje, pelo calendário publicado; num ano sem calendário, o dia útil anterior.
 * Os arquivos da B3 estão em dia quando o último negócio guardado é dele.
 */
function previousTradingDay(
  published: Array<{ year: number; nonTradingDays: Array<{ date: IsoDate }> }>,
  today: IsoDate,
): IsoDate {
  const calendar = new TradingCalendar(
    published.map((stored) => ({
      year: stored.year,
      nonTradingDays: stored.nonTradingDays.map((day) => day.date),
    })),
  );
  let day = addDays(today, -1);
  for (let tries = 0; tries < 15; tries += 1, day = addDays(day, -1)) {
    let trading: boolean;
    try {
      trading = calendar.isTradingDay(day);
    } catch {
      trading = !isWeekend(day);
    }
    if (trading) return day;
  }
  return day;
}

function latestDay(trades: Map<string, B3Trade>): IsoDate | null {
  let latest: IsoDate | null = null;
  for (const trade of trades.values()) {
    if (latest === null || trade.lastTradingDay > latest) latest = trade.lastTradingDay;
  }
  return latest;
}

function isGenericLogoUrl(url: string): boolean {
  try {
    return new URL(url).pathname.split('/').at(-1) === GENERIC_LOGO_FILE;
  } catch {
    return false;
  }
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
