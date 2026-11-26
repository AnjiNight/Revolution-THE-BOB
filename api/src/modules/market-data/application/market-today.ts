import {
  isoDateInBrasilia,
  isWeekend,
  MARKET_TODAY_SYMBOLS,
  yearOf,
  type IsoDate,
  type MarketReading,
  type MarketToday,
  type MarketTodaySymbol,
} from '@simulador/shared';
import { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import { percentChange } from '../../financial-calculation/decimal.js';
import { dueSlot, isStale } from '../domain/market-hours.js';
import {
  MarketQuoteSourceError,
  type CalendarRepository,
  type MarketQuoteRepository,
  type MarketQuoteSource,
  type RunError,
  type RunResult,
  type TaskRunReader,
  type TaskRunRepository,
} from './ports.js';

const TASK = 'mercado_yahoo' as const;
/** Leituras guardadas por 30 dias, como as cotações do pregão (SPEC-009). */
export const MARKET_TODAY_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

const NAMES: Record<MarketTodaySymbol, string> = { ibovespa: 'Ibovespa', dollar: 'dólar' };

export interface MarketTodayDeps {
  source: MarketQuoteSource;
  quotes: MarketQuoteRepository;
  runs: TaskRunRepository & TaskRunReader;
  calendars: CalendarRepository;
  clock?: () => Date;
}

/**
 * "Mercado hoje" (SPEC-048): o processador chama `collect` a cada 5 minutos; cada um (o Ibovespa e o
 * dólar) é coletado quando chega a vez dele nos horários da decisão 2. O servidor lê o painel por
 * `today`, com o aviso de desatualizado.
 */
export class MarketTodayCollection {
  private readonly clock: () => Date;

  constructor(private readonly deps: MarketTodayDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /**
   * Coleta os que chegaram na vez; sem nenhum, devolve `null` (e não grava execução). Uma coleta que
   * falhou só tenta de novo na vez seguinte. `force` ("Executar agora"): os dois, a qualquer hora.
   */
  async collect(options: { force?: boolean } = {}): Promise<RunResult | null> {
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    let due: MarketTodaySymbol[] = [...MARKET_TODAY_SYMBOLS];
    if (!options.force) {
      const [last, open] = await Promise.all([this.deps.runs.lastRun(TASK), this.openDays(today)]);
      due = due.filter((symbol) => {
        const slot = dueSlot(symbol, today, open[symbol], now);
        return slot !== null && (!last || last.startedAt.getTime() < slot.getTime());
      });
    }
    if (due.length === 0) return null;
    return this.run(due, today);
  }

  /** Apaga as leituras com mais de 30 dias. */
  cleanup(): Promise<number> {
    return this.deps.quotes.deleteBefore(
      new Date(this.clock().getTime() - MARKET_TODAY_RETENTION_DAYS * DAY_MS),
    );
  }

  /** `GET /api/market/today`: a última leitura de cada um, com a variação e o aviso. */
  async today(): Promise<MarketToday> {
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    const [open, ibovespa, dollar] = await Promise.all([
      this.openDays(today),
      this.deps.quotes.latest('ibovespa'),
      this.deps.quotes.latest('dollar'),
    ]);
    const reading = (symbol: MarketTodaySymbol): MarketReading | null => {
      const stored = symbol === 'ibovespa' ? ibovespa : dollar;
      if (!stored) return null;
      return {
        value: stored.value,
        previousClose: stored.previousClose,
        change: stored.previousClose ? percentChange(stored.value, stored.previousClose) : null,
        at: stored.at.toISOString(),
        stale: isStale(symbol, today, open[symbol], now, stored),
      };
    };
    return { ibovespa: reading('ibovespa'), dollar: reading('dollar') };
  }

  /**
   * O mercado abre hoje? O Ibovespa pelo calendário de pregão; num ano ainda sem calendário, os
   * dias úteis (o painel não para à espera da publicação). O dólar: os dias úteis.
   */
  private async openDays(today: IsoDate): Promise<Record<MarketTodaySymbol, boolean>> {
    const weekday = !isWeekend(today);
    const year = yearOf(today);
    const published = await this.deps.calendars.findYears(year, year);
    let trading = weekday;
    if (published.length > 0) {
      trading = new TradingCalendar(
        published.map((stored) => ({
          year: stored.year,
          nonTradingDays: stored.nonTradingDays.map((day) => day.date),
        })),
      ).isTradingDay(today);
    }
    return { ibovespa: trading, dollar: weekday };
  }

  private async run(symbols: MarketTodaySymbol[], today: IsoDate): Promise<RunResult> {
    const runId = await this.deps.runs.start(TASK, this.clock());
    const errors: RunError[] = [];
    let saved = 0;
    for (const symbol of symbols) {
      try {
        const quote = await this.deps.source.quote(symbol);
        await this.deps.quotes.save({ ...quote, symbol, collectedAt: this.clock() });
        saved += 1;
      } catch (error) {
        const detail =
          error instanceof MarketQuoteSourceError || error instanceof Error
            ? error.message
            : String(error);
        errors.push({ message: `${NAMES[symbol]}: ${detail}`, assetId: null, date: today });
      }
    }
    const result: RunResult = {
      status: saved === 0 ? 'falha' : errors.length > 0 ? 'parcial' : 'sucesso',
      records: saved,
      affectedAssets: 0,
      periodStart: saved > 0 ? today : null,
      periodEnd: saved > 0 ? today : null,
      errors,
    };
    await this.deps.runs.finish(runId, result, this.clock());
    return result;
  }
}
