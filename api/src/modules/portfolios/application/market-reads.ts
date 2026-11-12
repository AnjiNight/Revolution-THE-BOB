import type { IsoDate, QuoteLevelCode } from '@simulador/shared';
import type { EventInput, IncomeInput } from '../../financial-calculation/corporate-actions.js';
import type { DailyClose } from '../../financial-calculation/performance.js';
import type { TradingCalendar } from '../../financial-calculation/trading-calendar.js';
import type { MarketAsset, MarketQuote, PortfolioCalendar, PortfolioMarket } from './ports.js';

/**
 * As leituras do mercado de um pedido, cada uma feita uma vez (SPEC-022 §4.2). O mesmo ativo em mais
 * de uma carteira, ou na rentabilidade e na distribuição da mesma carteira, lê o fechamento, a
 * cotação, os proventos e os eventos uma vez só; o calendário também. Assim, todas as contas do
 * pedido veem os mesmos dados.
 */
export class MarketReads implements PortfolioCalendar {
  private readonly memo = new Map<string, Promise<unknown>>();
  private readonly reserved = new Map<string, IsoDate>();
  private readonly closeLists = new Map<string, { from: IsoDate; list: Promise<DailyClose[]> }>();
  private calendarRange: { from: number; to: number; calendar: TradingCalendar } | null = null;

  constructor(
    private readonly market: PortfolioMarket,
    private readonly calendar: PortfolioCalendar,
  ) {}

  asset(assetId: string): Promise<MarketAsset | null> {
    return this.once(`asset:${assetId}`, () => this.market.asset(assetId));
  }

  latestQuote(assetId: string, level: QuoteLevelCode): Promise<MarketQuote | null> {
    return this.once(`quote:${level}:${assetId}`, () => this.market.latestQuote(assetId, level));
  }

  lastClose(assetId: string): Promise<{ date: IsoDate; close: string } | null> {
    return this.once(`close:${assetId}`, () => this.market.lastClose(assetId));
  }

  income(assetId: string, from: IsoDate): Promise<IncomeInput[]> {
    return this.once(`income:${assetId}:${from}`, () => this.market.income(assetId, from));
  }

  corporateEvents(assetId: string, from: IsoDate): Promise<EventInput[]> {
    return this.once(`events:${assetId}:${from}`, () => this.market.corporateEvents(assetId, from));
  }

  /**
   * Antes das contas: o primeiro dia de que alguma carteira vai precisar dos fechamentos do ativo.
   * A leitura começa nele, e cada carteira recebe só os fechamentos desde a data que pediu.
   */
  reserveCloses(assetId: string, from: IsoDate): void {
    const current = this.reserved.get(assetId);
    if (current === undefined || from < current) this.reserved.set(assetId, from);
  }

  /** SPEC-019: os fechamentos da B3 desde a data, em ordem, como `PortfolioMarket.closesFrom`. */
  closesFrom(assetId: string, from: IsoDate): Promise<DailyClose[]> {
    let entry = this.closeLists.get(assetId);
    if (!entry || entry.from > from) {
      const reserved = this.reserved.get(assetId);
      const start = reserved !== undefined && reserved < from ? reserved : from;
      entry = { from: start, list: this.market.closesFrom(assetId, start) };
      this.closeLists.set(assetId, entry);
    }
    const loaded = entry;
    return loaded.list.then((closes) =>
      loaded.from === from ? closes : closes.slice(firstOnOrAfter(closes, from)),
    );
  }

  /** Antes das contas: o calendário de todos os anos que as carteiras vão pedir, lido uma vez. */
  async loadCalendar(from: number, to: number): Promise<void> {
    this.calendarRange = { from, to, calendar: await this.calendar.tradingCalendar(from, to) };
  }

  tradingCalendar(from: number, to: number): Promise<TradingCalendar> {
    const range = this.calendarRange;
    if (range && range.from <= from && range.to >= to) return Promise.resolve(range.calendar);
    return this.once(`calendar:${from}:${to}`, () => this.calendar.tradingCalendar(from, to));
  }

  private once<T>(key: string, read: () => Promise<T>): Promise<T> {
    let found = this.memo.get(key) as Promise<T> | undefined;
    if (!found) {
      found = read();
      this.memo.set(key, found);
    }
    return found;
  }
}

/** Busca binária: o primeiro fechamento com data a partir do dia. */
function firstOnOrAfter(closes: readonly DailyClose[], day: IsoDate): number {
  let low = 0;
  let high = closes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((closes[middle] as DailyClose).date < day) low = middle + 1;
    else high = middle;
  }
  return low;
}
