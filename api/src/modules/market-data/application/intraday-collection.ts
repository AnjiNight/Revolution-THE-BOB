import {
  addDays,
  isoDate,
  isoDateInBrasilia,
  isWeekend,
  monthOf,
  yearOf,
  type AssetQuote,
  type IsoDate,
  type QuoteCollectionStatus,
} from '@simulador/shared';
import { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import { compareDecimals, percentChange, sameAtCents } from '../domain/decimal.js';
import { planCollection, type QuotaDecision } from '../domain/quota-plan.js';
import { brasiliaInstant, collectionMinutes, dueCollection } from '../domain/trading-session.js';
import {
  QuoteSourceError,
  type AssetListing,
  type CalendarRepository,
  type HistoryAsset,
  type IntradayQuote,
  type IntradayQuoteRepository,
  type ListedAsset,
  type ListKind,
  type QuoteListSource,
  type QuoteUsage,
  type RunError,
  type RunResult,
  type RunStatus,
  type RunSummary,
  type TaskRunReader,
  type TaskRunRepository,
} from './ports.js';

const TASK = 'cotacao_pregao' as const;
/** Parte da cota que o plano não usa: testes, novas tentativas e consultas feitas à mão. */
const RESERVE = 0.1;
/** SPEC-040: cada coleta consulta a lista duas vezes (ações e FIIs), para todos os ativos. */
const LIST_KINDS: readonly ListKind[] = ['stock', 'fii'];
/** Espera antes da única nova tentativa de uma lista (erro de rede ou 5xx). */
export const INTRADAY_RETRY_DELAY_MS = 10_000;
/** Cotações do pregão guardadas por 30 dias (OPEN-40); o fechamento diário fica para sempre. */
export const INTRADAY_RETENTION_DAYS = 30;
/** Tickers do catálogo que não vieram na lista guardados na execução (o resto só conta). */
const MISSING_TICKERS_SHOWN = 20;
const MAX_STORED_ERRORS = 100;
const DAY_MS = 24 * 60 * 60_000;

export interface IntradayCollectionDeps {
  source: QuoteListSource;
  quotes: IntradayQuoteRepository;
  runs: TaskRunRepository & TaskRunReader;
  calendars: CalendarRepository;
  /** Cota do plano quando a fonte não informa (hoje, a lista não desconta da cota). */
  monthlyQuota: number;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
}

/** O que o plano decidiu para agora, com o que é preciso para coletar. */
interface Moment {
  now: Date;
  today: IsoDate;
  assets: HistoryAsset[];
}

/**
 * Cotações do pregão (SPEC-009 e 040): o processador chama `collect` a cada poucos minutos; a
 * coleta só acontece nos horários do pregão, em dia de pregão, e quando a regra da cota deixa. Cada
 * coleta lê a lista da brapi (ações e FIIs) e grava o preço de todos os ativos ativos, com o
 * horário da coleta: a lista não traz o horário de cada preço.
 */
export class IntradayCollection {
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelayMs: number;

  constructor(private readonly deps: IntradayCollectionDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retryDelayMs = deps.retryDelayMs ?? INTRADAY_RETRY_DELAY_MS;
  }

  /** Faz a coleta da vez, se houver. Sem nada a fazer, devolve `null` (e não grava execução). */
  async collect(): Promise<RunResult | null> {
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    if (isWeekend(today)) return null;
    const slotIndex = dueCollection(today, now);
    if (slotIndex === null) return null;

    const year = yearOf(today);
    const published = await this.deps.calendars.findYears(year, year + 1);
    const last = await this.deps.runs.lastRun(TASK);
    if (!published.some((stored) => stored.year === year)) {
      return this.missingCalendar(today, year, last);
    }
    const calendar = tradingCalendarOf(published);
    if (!calendar.isTradingDay(today)) return null;

    const slotAt = brasiliaInstant(today, collectionMinutes(today)[slotIndex] ?? 0);
    if (last && last.startedAt.getTime() >= slotAt.getTime()) return null;
    if (last?.status === 'cota_esgotada' && last.quota && last.quota.resetsAt > now) return null;

    const assets = await this.deps.quotes.activeAssets();
    if (assets.length === 0) return null;
    const decision = await this.decide(now, today, calendar, slotIndex, last);
    if (!decision.run) return null;

    return this.run({ now, today, assets });
  }

  /** Apaga as cotações do pregão com mais de 30 dias. */
  cleanup(): Promise<number> {
    return this.deps.quotes.deleteBefore(
      new Date(this.clock().getTime() - INTRADAY_RETENTION_DAYS * DAY_MS),
    );
  }

  /** Última cotação de cada ativo, com a variação sobre o fechamento do pregão anterior. */
  async latestQuotes(): Promise<Map<string, AssetQuote>> {
    const latest = await this.deps.quotes.latest('gratuito');
    const quotes = new Map<string, AssetQuote>();
    for (const [assetId, quote] of latest) {
      const previous = quote.storedPreviousClose ?? quote.previousClose;
      quotes.set(assetId, {
        price: quote.price,
        change: previous ? percentChange(quote.price, previous) : null,
        at: quote.at.toISOString(),
        source: 'brapi',
      });
    }
    return quotes;
  }

  /** Situação da coleta para a tela do colaborador (SPEC-009 e 040, §5.3). */
  async status(): Promise<QuoteCollectionStatus> {
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    const year = yearOf(today);
    const [last, published, assets] = await Promise.all([
      this.deps.runs.lastRun(TASK),
      this.deps.calendars.findYears(year, year + 1),
      this.deps.quotes.activeAssets(),
    ]);
    const cycle = await this.cycle(now, today, last);
    const calendar = tradingCalendarOf(published);
    const decision =
      assets.length > 0
        ? await this.decide(now, today, calendar, dueCollection(today, now) ?? 0, last)
        : null;
    const lastStatus = last?.status;
    return {
      lastRunAt: (last?.finishedAt ?? last?.startedAt)?.toISOString() ?? null,
      lastStatus:
        lastStatus === 'sucesso' ||
        lastStatus === 'parcial' ||
        lastStatus === 'falha' ||
        lastStatus === 'cota_esgotada'
          ? lastStatus
          : null,
      intervalMinutes: decision?.intervalMinutes ?? 30,
      requestsUsed: Math.max(0, cycle.limit - cycle.remaining),
      quota: cycle.limit,
      quotaResetsAt: cycle.resetsAt?.toISOString() ?? null,
      quotaExhausted:
        last?.status === 'cota_esgotada' && Boolean(last.quota && last.quota.resetsAt > now),
      tokenConfigured: this.deps.source.tokenConfigured,
      quotaCounted: Boolean(last && (last.requests > 0 || last.quota)),
    };
  }

  /**
   * Cota que sobra no ciclo e quando ele acaba: a que a brapi informou na última resposta; se o
   * ciclo dela já virou, a cota cheia menos o que foi gasto desde então; sem nenhuma informação
   * (a lista não desconta da cota), a cota configurada menos o gasto do mês.
   */
  private async cycle(
    now: Date,
    today: IsoDate,
    last: RunSummary | null,
  ): Promise<{ remaining: number; limit: number; resetsAt: Date | null; endsOn: IsoDate }> {
    if (last?.quota && last.quota.resetsAt > now) {
      return {
        remaining: last.quota.remaining,
        limit: last.quota.limit,
        resetsAt: last.quota.resetsAt,
        endsOn: isoDateInBrasilia(last.quota.resetsAt),
      };
    }
    if (last?.quota) {
      // O ciclo renovou depois da última resposta: o próximo deve vir uns 30 dias depois.
      const used = await this.deps.runs.requestsSince(TASK, last.quota.resetsAt);
      const nextReset = new Date(last.quota.resetsAt.getTime() + 30 * DAY_MS);
      return {
        remaining: Math.max(0, last.quota.limit - used),
        limit: last.quota.limit,
        resetsAt: null,
        endsOn: isoDateInBrasilia(nextReset),
      };
    }
    const monthStart = isoDate(yearOf(today), monthOf(today), 1);
    const used = await this.deps.runs.requestsSince(TASK, brasiliaInstant(monthStart, 0));
    const nextMonth = addDays(isoDate(yearOf(today), monthOf(today), 28), 4);
    const endsOn = addDays(isoDate(yearOf(nextMonth), monthOf(nextMonth), 1), -1);
    return {
      remaining: Math.max(0, this.deps.monthlyQuota - used),
      limit: this.deps.monthlyQuota,
      resetsAt: null,
      endsOn,
    };
  }

  /**
   * Regra do intervalo (SPEC-009), agora contando as 2 consultas da lista por coleta. Enquanto a
   * brapi não desconta a lista, sempre sobra cota; se um dia descontar, as coletas se espaçam.
   */
  private async decide(
    now: Date,
    today: IsoDate,
    calendar: TradingCalendar,
    slotIndex: number,
    last: RunSummary | null,
  ): Promise<QuotaDecision> {
    const cycle = await this.cycle(now, today, last);
    const reserve = Math.ceil(cycle.limit * RESERVE);
    // Hoje sempre conta; depois, cada dia de pregão até o fim do ciclo.
    const slotsPerDay = [collectionMinutes(today).length];
    for (let day = addDays(today, 1); day <= cycle.endsOn; day = addDays(day, 1)) {
      if (isTradingDayOrWeekday(calendar, day)) slotsPerDay.push(collectionMinutes(day).length);
    }
    const doneToday = await this.deps.runs.runsSince(TASK, brasiliaInstant(today, 0));
    return planCollection({
      assets: LIST_KINDS.length,
      available: cycle.remaining - reserve,
      slotsPerDay,
      slotIndex,
      doneToday,
    });
  }

  private async run(moment: Moment): Promise<RunResult> {
    const { assets, today } = moment;
    return this.record(async (log) => {
      const listed = new Map<string, ListedAsset>();
      for (const kind of LIST_KINDS) {
        const listing = await this.ask(kind, log);
        if (listing === 'stop') break;
        if (!listing) continue;
        log.answered += 1;
        for (const asset of listing.assets) listed.set(asset.ticker, asset);
      }
      if (log.answered === 0) return;

      // Horário da coleta, em segundos inteiros: a lista não traz o horário de cada preço.
      const at = new Date(Math.floor(moment.now.getTime() / 1000) * 1000);
      const previousCloses = await this.deps.quotes.closesBefore(today);
      const fresh: IntradayQuote[] = [];
      for (const asset of assets) {
        const item = listed.get(asset.ticker);
        if (!item) {
          log.missing.push(asset.ticker);
          continue;
        }
        if (!item.price) continue;
        if (isYesterdays(item, previousCloses.get(asset.id))) continue;
        fresh.push({
          assetId: asset.id,
          at,
          level: 'gratuito',
          price: item.price,
          open: null,
          high: null,
          low: null,
          previousClose: null,
          source: 'brapi',
        });
      }

      const saved = await this.deps.quotes.save(fresh);
      log.records += saved;
      for (const quote of fresh) log.assets.add(quote.assetId);
    }, today);
  }

  /**
   * Consulta uma lista: uma nova tentativa em erro de rede ou 5xx. `'stop'` encerra a coleta (429
   * ou cota esgotada); `null` é uma lista que falhou, e a coleta segue com a outra.
   */
  private async ask(kind: ListKind, log: CollectionLog): Promise<AssetListing | 'stop' | null> {
    const label = kind === 'fii' ? 'lista de FIIs' : 'lista de ações';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const listing = await this.deps.source.list(kind);
        // Só conta na cota o que a brapi descontou (ela informa a cota nos cabeçalhos).
        if (listing.usage) {
          log.requests += listing.requests;
          log.usage = listing.usage;
        }
        return listing;
      } catch (error) {
        if (!(error instanceof QuoteSourceError)) throw error;
        if (error.usage) {
          log.requests += 1;
          log.usage = error.usage;
        }
        if (error.kind === 'unavailable' && attempt === 0) {
          await this.sleep(this.retryDelayMs);
          continue;
        }
        if (error.kind === 'quota_exhausted' || error.kind === 'rate_limited') {
          log.stopped = error.kind;
          log.error(
            error.kind === 'quota_exhausted'
              ? 'cota do plano da brapi esgotada: as coletas voltam quando ela renovar'
              : 'brapi pediu para esperar (429): a próxima coleta tenta de novo',
          );
          return 'stop';
        }
        log.error(`${label}: ${error.message}`);
        return null;
      }
    }
    return null;
  }

  /** Sem calendário do ano: nada é coletado, e o motivo fica registrado uma vez por dia. */
  private async missingCalendar(
    today: IsoDate,
    year: number,
    last: RunSummary | null,
  ): Promise<RunResult | null> {
    if (last && last.startedAt.getTime() >= brasiliaInstant(today, 0).getTime()) return null;
    return this.record((log) => {
      log.error(`calendário de pregão de ${year} não publicado: nenhuma cotação coletada`);
      return Promise.resolve();
    }, today);
  }

  private async record(
    body: (log: CollectionLog) => Promise<void>,
    today: IsoDate,
  ): Promise<RunResult> {
    const runId = await this.deps.runs.start(TASK, this.clock());
    const log = new CollectionLog();
    try {
      await body(log);
    } catch (error) {
      log.error(`erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = log.result(today);
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }
}

/** Erros e totais de uma coleta, montados enquanto ela anda. */
class CollectionLog {
  readonly errors: RunError[] = [];
  private hidden = 0;
  readonly assets = new Set<string>();
  /** Ativos do catálogo que não vieram na lista (ticker que mudou, papel que saiu da brapi). */
  readonly missing: string[] = [];
  records = 0;
  requests = 0;
  /** Listas que responderam. */
  answered = 0;
  usage: QuoteUsage | null = null;
  stopped: 'quota_exhausted' | 'rate_limited' | null = null;

  error(message: string, assetId: string | null = null, date: IsoDate | null = null): void {
    if (this.errors.length < MAX_STORED_ERRORS) this.errors.push({ message, assetId, date });
    else this.hidden += 1;
  }

  result(today: IsoDate): RunResult {
    const errors =
      this.hidden > 0
        ? [...this.errors, { message: `mais ${this.hidden} erros não guardados` }]
        : this.errors;
    return {
      status: this.status(),
      records: this.records,
      affectedAssets: this.assets.size,
      periodStart: this.records > 0 ? today : null,
      periodEnd: this.records > 0 ? today : null,
      errors,
      requests: this.requests,
      quota: this.usage,
      totals: {
        missing: this.missing.length,
        missingTickers: this.missing.slice(0, MISSING_TICKERS_SHOWN),
      },
    };
  }

  private status(): RunStatus {
    if (this.stopped === 'quota_exhausted') return 'cota_esgotada';
    if (this.answered === 0) return 'falha';
    if (this.errors.length > 0 || this.stopped) return 'parcial';
    return 'sucesso';
  }
}

/**
 * A lista ainda mostra o pregão anterior (antes da abertura, ou em dia de abertura tardia, como a
 * Quarta-feira de Cinzas): o preço é o fechamento guardado de ontem, mas a variação não é zero (é a
 * de ontem). Se hoje o preço voltasse mesmo ao fechamento de ontem, a variação seria zero.
 */
function isYesterdays(item: ListedAsset, previousClose: string | undefined): boolean {
  if (!item.price || !previousClose || item.change === null) return false;
  return sameAtCents(item.price, previousClose) && compareDecimals(item.change, '0') !== 0;
}

function tradingCalendarOf(
  published: Array<{ year: number; nonTradingDays: Array<{ date: IsoDate }> }>,
): TradingCalendar {
  return new TradingCalendar(
    published.map((stored) => ({
      year: stored.year,
      nonTradingDays: stored.nonTradingDays.map((day) => day.date),
    })),
  );
}

/** Dia de pregão pelo calendário; num ano ainda sem calendário, conta os dias úteis. */
function isTradingDayOrWeekday(calendar: TradingCalendar, date: IsoDate): boolean {
  try {
    return calendar.isTradingDay(date);
  } catch {
    return !isWeekend(date);
  }
}
