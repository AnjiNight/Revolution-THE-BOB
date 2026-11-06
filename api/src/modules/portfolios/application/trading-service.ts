import {
  centsToAmount,
  FREE_QUOTE_DELAY_MINUTES,
  isoDateInBrasilia,
  yearOf,
  type IsoDate,
  type NewTradeInput,
  type PortfolioPositions,
  type Position,
  type QuoteLevelCode,
  type Trade,
  type TradeBlockReason,
  type TradeQuote,
  type TradeResult,
} from '@simulador/shared';
import { canSpend, cashLedger, toCents } from '../../financial-calculation/cash-ledger.js';
import {
  displayPrice,
  holdings,
  roundToCents,
  tradeTotal,
  valuate,
  type Holding,
} from '../../financial-calculation/positions.js';
import { CalendarNotPublishedError } from '../../financial-calculation/trading-calendar.js';
import {
  AssetInactiveError,
  HistoricalPortfolioError,
  HistoryPendingError,
  InsufficientCashError,
  InsufficientPositionError,
  MarketClosedError,
  NoCloseThatDayError,
  NoQuoteTodayError,
  PortfolioValidationError,
  QuoteChangedError,
  TradeAssetNotFoundError,
} from '../domain/errors.js';
import { activeLedger, ledgerItems, ownedPortfolio, tradeMovements } from './ledger.js';
import type {
  LedgerRepository,
  MarketAsset,
  MarketQuote,
  NewStoredTrade,
  PortfolioCalendar,
  PortfolioLedger,
  PortfolioMarket,
  PortfolioRepository,
  StoredPortfolio,
  StoredTrade,
} from './ports.js';

/** Até a SPEC-026 (assinatura), todo usuário vê o nível gratuito (DA16). */
const USER_LEVEL: QuoteLevelCode = 'free';

export interface TradingServiceDeps {
  portfolios: PortfolioRepository;
  ledger: LedgerRepository;
  calendar: PortfolioCalendar;
  market: PortfolioMarket;
  clock?: () => Date;
}

/** O preço da negociação e de onde veio: na ao vivo, a cotação do pregão; na histórica, o fechamento. */
type Priced =
  | { kind: 'live'; price: string; date: IsoDate; quote: MarketQuote }
  | { kind: 'historical'; price: string; date: IsoDate };

type Tradability =
  | { ok: true; priced: Priced }
  | {
      ok: false;
      reason: TradeBlockReason;
      nextTradingDay: IsoDate | null;
      /** SPEC-016, no `no_close_that_day`: o último dia com negócio antes do escolhido. */
      lastTradingDay?: IsoDate | null;
      /** O ano sem calendário, no `calendar_not_published`. */
      year?: number;
    };

/**
 * Compra e venda (SPEC-014 e SPEC-016). Na carteira ao vivo, com a última cotação do pregão do nível
 * do usuário, que precisa ser de hoje, em dia de pregão (RB07, RB11). Na histórica, com o fechamento
 * da B3 do dia escolhido, com as regras de data da histórica (RB11, RB12, RB25). Nas duas, a compra
 * precisa de caixa (RB05) e a venda, de posição (RB06); posições e preço médio vêm das negociações
 * (RB09, RB10), sem as estornadas (RB28).
 */
export class TradingService {
  private readonly clock: () => Date;

  constructor(private readonly deps: TradingServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** SPEC-014 §5.1: posições em ordem de ticker, com o caixa, o valor em ativos e o total. */
  async positions(userId: string, id: string): Promise<PortfolioPositions> {
    await ownedPortfolio(this.deps.portfolios, userId, id);
    // SPEC-015: as negociações e lançamentos estornados não contam.
    const ledger = activeLedger(await this.deps.ledger.ledger(id));
    const cash = cashLedger(ledgerItems(ledger)).balance;
    const positions = (
      await Promise.all(
        [...holdings(tradeMovements(ledger.trades)).values()].map((holding) =>
          this.position(holding),
        ),
      )
    ).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const value = positions.reduce(
      (sum, position) => sum + (position.marketValue ? toCents(position.marketValue) : 0n),
      0n,
    );
    return {
      cash,
      positionsValue: centsToAmount(value),
      total: centsToAmount(toCents(cash) + value),
      positions,
      lastEntryDate: lastDate(ledger),
    };
  }

  /**
   * O preço que a negociação usaria, ou o motivo de não dar (SPEC-014 §5.1). Na histórica, para a
   * data pedida (SPEC-016 §5.1); data fora das regras é `validation_error`, como no POST.
   */
  async tradeQuote(
    userId: string,
    id: string,
    assetId: string,
    date?: IsoDate,
  ): Promise<TradeQuote> {
    const portfolio = await ownedPortfolio(this.deps.portfolios, userId, id);
    const asset = await this.asset(assetId);
    const ledger = activeLedger(await this.deps.ledger.ledger(id));
    const common = {
      cash: cashLedger(ledgerItems(ledger)).balance,
      held: holdings(tradeMovements(ledger.trades)).get(assetId)?.quantity ?? 0,
      // SPEC-016: na histórica, o ativo desativado pode ser comprado (estava na bolsa naquele dia).
      buyable: portfolio.type === 'historical' || asset.active,
    };
    const status = await this.tradability(portfolio, asset.id, date, ledger);
    if (!status.ok) {
      return {
        ...common,
        tradable: false,
        reason: status.reason,
        nextTradingDay: status.nextTradingDay,
        ...(status.reason === 'no_close_that_day'
          ? { lastTradingDay: status.lastTradingDay ?? null }
          : {}),
      };
    }
    const { priced } = status;
    return {
      ...common,
      tradable: true,
      price: priced.price,
      date: priced.date,
      source: priced.kind === 'live' ? 'brapi' : 'b3',
      quotedAt: priced.kind === 'live' ? priced.quote.at.toISOString() : null,
      level: priced.kind === 'live' ? priced.quote.level : null,
      delayMinutes: priced.kind === 'live' ? FREE_QUOTE_DELAY_MINUTES : null,
    };
  }

  /**
   * Registra a compra ou a venda. Antes da trava: o preço (cotação de hoje ou fechamento do dia), o
   * ativo e, na ao vivo, a cotação vista. Com a carteira travada: a data na histórica (RB25), caixa
   * na compra, posição na venda.
   */
  async trade(userId: string, id: string, input: NewTradeInput): Promise<TradeResult> {
    const portfolio = await ownedPortfolio(this.deps.portfolios, userId, id);
    if (portfolio.type === 'live' && input.quotedAt === undefined) {
      throw new PortfolioValidationError({ quotedAt: 'required' });
    }
    const asset = await this.asset(input.assetId);
    const status = await this.tradability(portfolio, asset.id, input.date, null);
    if (!status.ok) throw blockError(status);
    const { priced } = status;
    if (priced.kind === 'live') {
      if (input.type === 'buy' && !asset.active) throw new AssetInactiveError();
      if (priced.quote.at.toISOString() !== input.quotedAt) {
        throw new QuoteChangedError(priced.price, priced.quote.at.toISOString());
      }
    }
    const total = tradeTotal(input.quantity, priced.price);
    const now = this.clock();

    let after: PortfolioLedger = { cash: [], trades: [], reversals: [] };
    const stored = await this.deps.ledger.appendTradeLocked(id, (locked): NewStoredTrade => {
      const current = activeLedger(locked);
      // RB25: na histórica, nada antes do último lançamento que vale.
      const last = lastDate(current);
      if (priced.kind === 'historical' && last && priced.date < last) {
        throw new PortfolioValidationError({ date: 'before_last_entry' });
      }
      // Na histórica não há nada depois da data (RB25): o caixa e a posição de agora são os dela.
      const cash = cashLedger(ledgerItems(current)).balance;
      if (input.type === 'buy' && !canSpend(cash, total)) throw new InsufficientCashError(cash);
      if (input.type === 'sell') {
        const held = holdings(tradeMovements(current.trades)).get(asset.id)?.quantity ?? 0;
        if (held < input.quantity) throw new InsufficientPositionError(held);
      }
      const trade: NewStoredTrade = {
        assetId: asset.id,
        type: input.type,
        quantity: input.quantity,
        price: priced.price,
        total,
        date: priced.date,
        recordedAt: now,
        quotedAt: priced.kind === 'live' ? priced.quote.at : null,
        level: priced.kind === 'live' ? priced.quote.level : null,
        source: priced.kind === 'live' ? priced.quote.source : 'b3',
      };
      after = {
        cash: current.cash,
        trades: [...current.trades, { ...trade, id: 'nova', portfolioId: id }],
        reversals: [],
      };
      return trade;
    });

    const holding = holdings(tradeMovements(after.trades)).get(asset.id);
    return {
      trade: toPublicTrade(stored, asset.ticker),
      cash: cashLedger(ledgerItems(after)).balance,
      position: holding ? await this.position(holding) : null,
    };
  }

  /**
   * Pode negociar? Ao vivo (SPEC-014): dia de pregão (RB11) e cotação do pregão de hoje, no horário
   * de Brasília (RB07); depois do fechamento, vale a última cotação do dia. Histórica (SPEC-016):
   * a data pedida dentro das regras da histórica e o fechamento da B3 desse dia.
   */
  private async tradability(
    portfolio: StoredPortfolio,
    assetId: string,
    requested: IsoDate | undefined,
    ledger: PortfolioLedger | null,
  ): Promise<Tradability> {
    const today = isoDateInBrasilia(this.clock());
    if (portfolio.type === 'historical') {
      return this.historicalPrice(portfolio, assetId, requested, today, ledger);
    }
    // DA17: na ao vivo, o momento é o do servidor.
    if (requested !== undefined) throw new PortfolioValidationError({ date: 'not_allowed' });
    try {
      const calendar = await this.deps.calendar.tradingCalendar(yearOf(today), yearOf(today));
      if (!calendar.isTradingDay(today)) {
        return { ok: false, reason: 'market_closed', nextTradingDay: nextDay(calendar, today) };
      }
    } catch (error) {
      if (error instanceof CalendarNotPublishedError) {
        return {
          ok: false,
          reason: 'calendar_not_published',
          nextTradingDay: null,
          year: error.year,
        };
      }
      throw error;
    }
    const quote = await this.deps.market.latestQuote(assetId, USER_LEVEL);
    if (!quote || isoDateInBrasilia(quote.at) !== today) {
      return { ok: false, reason: 'no_quote_today', nextTradingDay: null };
    }
    return {
      ok: true,
      priced: { kind: 'live', price: roundToCents(quote.price), date: today, quote },
    };
  }

  /**
   * SPEC-016: a data da histórica (as regras do aporte da SPEC-013) e o fechamento da B3 do dia,
   * como publicado (§4.1, decisão 1). Com o livro, confere também o último lançamento (RB25); a
   * negociação confere de novo com a carteira travada.
   */
  private async historicalPrice(
    portfolio: StoredPortfolio,
    assetId: string,
    requested: IsoDate | undefined,
    today: IsoDate,
    ledger: PortfolioLedger | null,
  ): Promise<Tradability> {
    if (requested === undefined) throw new PortfolioValidationError({ date: 'required' });
    if (requested < portfolio.startDate) {
      throw new PortfolioValidationError({ date: 'before_start' });
    }
    if (requested >= today) throw new PortfolioValidationError({ date: 'future' });
    try {
      const calendar = await this.deps.calendar.tradingCalendar(
        yearOf(requested),
        yearOf(requested),
      );
      if (!calendar.isTradingDay(requested)) {
        throw new PortfolioValidationError({ date: 'not_trading_day' });
      }
    } catch (error) {
      if (error instanceof CalendarNotPublishedError) {
        return {
          ok: false,
          reason: 'calendar_not_published',
          nextTradingDay: null,
          year: error.year,
        };
      }
      throw error;
    }
    const last = ledger ? lastDate(ledger) : null;
    if (last && requested < last) throw new PortfolioValidationError({ date: 'before_last_entry' });

    if (!(await this.deps.market.historyRange(assetId))) {
      return { ok: false, reason: 'history_pending', nextTradingDay: null };
    }
    const close = await this.deps.market.closeOn(assetId, requested);
    if (close === null) {
      return {
        ok: false,
        reason: 'no_close_that_day',
        nextTradingDay: null,
        lastTradingDay: await this.deps.market.lastTradingDayBefore(assetId, requested),
      };
    }
    return {
      ok: true,
      priced: { kind: 'historical', price: roundToCents(close), date: requested },
    };
  }

  private async asset(assetId: string): Promise<MarketAsset> {
    const asset = await this.deps.market.asset(assetId);
    if (!asset) throw new TradeAssetNotFoundError();
    return asset;
  }

  /**
   * A posição com o último preço conhecido: a cotação do pregão; sem ela, o último fechamento.
   * SPEC-016: com desdobramento, grupamento ou bonificação desde a primeira compra em posição, o
   * valor atual e a variação ficam de fora até a SPEC-043 (a quantidade ainda não é corrigida).
   */
  private async position(holding: Holding): Promise<Position> {
    const asset = (await this.deps.market.asset(holding.assetId)) ?? {
      id: holding.assetId,
      ticker: '',
      name: '',
      assetClass: 'stock' as const,
      active: false,
    };
    const events = await this.deps.market.eventsFrom(holding.assetId, holding.since);
    const base = { ...basePosition(holding, asset), events };
    const quote = await this.deps.market.latestQuote(holding.assetId, USER_LEVEL);
    const close = quote ? null : await this.deps.market.lastClose(holding.assetId);
    const price = quote?.price ?? close?.close;
    if (price === undefined) return base;
    const priced: Position = {
      ...base,
      lastPrice: roundToCents(price),
      ...(quote
        ? { lastPriceKind: 'intraday', lastPriceAt: quote.at.toISOString() }
        : { lastPriceKind: 'close', lastPriceDate: close?.date ?? null }),
    };
    if (events.length > 0) return priced;
    const valuation = valuate(holding, price);
    return {
      ...priced,
      marketValue: valuation.marketValue,
      change: valuation.change,
      changePercent: valuation.changePercent,
    };
  }
}

/** O dia do último lançamento que vale (caixa ou negociação), ou `null`. */
function lastDate(ledger: PortfolioLedger): IsoDate | null {
  let last: IsoDate | null = null;
  for (const item of ledgerItems(ledger)) if (last === null || item.date > last) last = item.date;
  return last;
}

function basePosition(holding: Holding, asset: MarketAsset): Position {
  return {
    assetId: holding.assetId,
    ticker: asset.ticker,
    name: asset.name,
    class: asset.assetClass,
    quantity: holding.quantity,
    averagePrice: displayPrice(holding.averagePrice),
    lastPrice: null,
    lastPriceKind: null,
    lastPriceAt: null,
    lastPriceDate: null,
    marketValue: null,
    change: null,
    changePercent: null,
    events: [],
  };
}

/** O próximo pregão, se o calendário do ano seguinte já estiver publicado. */
function nextDay(
  calendar: { nextTradingDay(date: IsoDate): IsoDate },
  today: IsoDate,
): IsoDate | null {
  try {
    return calendar.nextTradingDay(today);
  } catch (error) {
    if (error instanceof CalendarNotPublishedError) return null;
    throw error;
  }
}

function blockError(status: Extract<Tradability, { ok: false }>) {
  switch (status.reason) {
    case 'historical_portfolio':
      return new HistoricalPortfolioError();
    case 'market_closed':
      return new MarketClosedError(status.nextTradingDay);
    case 'no_quote_today':
      return new NoQuoteTodayError();
    case 'calendar_not_published':
      return new CalendarNotPublishedError(status.year ?? 0);
    case 'no_close_that_day':
      return new NoCloseThatDayError(status.lastTradingDay ?? null);
    case 'history_pending':
      return new HistoryPendingError();
  }
}

function toPublicTrade(trade: StoredTrade, ticker: string): Trade {
  return {
    id: trade.id,
    type: trade.type,
    assetId: trade.assetId,
    ticker,
    quantity: trade.quantity,
    price: trade.price,
    total: trade.total,
    date: trade.date,
    recordedAt: trade.recordedAt.toISOString(),
    quotedAt: trade.quotedAt?.toISOString() ?? null,
    level: trade.level,
    source: trade.source,
  };
}
