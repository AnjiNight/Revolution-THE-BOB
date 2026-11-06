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
  InsufficientCashError,
  InsufficientPositionError,
  MarketClosedError,
  NoQuoteTodayError,
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

type Tradability =
  | { ok: true; quote: MarketQuote }
  | {
      ok: false;
      reason: TradeBlockReason;
      nextTradingDay: IsoDate | null;
      /** O ano sem calendário, no `calendar_not_published`. */
      year?: number;
    };

/**
 * Compra e venda na carteira ao vivo (SPEC-014): com a última cotação do pregão do nível do usuário,
 * que precisa ser de hoje, em dia de pregão (RB07, RB11). A compra precisa de caixa (RB05) e a
 * venda, de posição (RB06). As posições e o preço médio vêm das negociações (RB09, RB10).
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
    };
  }

  /** O preço que a negociação usaria agora, ou o motivo de não dar (SPEC-014 §5.1). */
  async tradeQuote(userId: string, id: string, assetId: string): Promise<TradeQuote> {
    const portfolio = await ownedPortfolio(this.deps.portfolios, userId, id);
    const asset = await this.asset(assetId);
    const ledger = activeLedger(await this.deps.ledger.ledger(id));
    const common = {
      cash: cashLedger(ledgerItems(ledger)).balance,
      held: holdings(tradeMovements(ledger.trades)).get(assetId)?.quantity ?? 0,
      buyable: asset.active,
    };
    const status = await this.tradability(portfolio, asset.id);
    if (!status.ok) {
      return {
        ...common,
        tradable: false,
        reason: status.reason,
        nextTradingDay: status.nextTradingDay,
      };
    }
    return {
      ...common,
      tradable: true,
      price: roundToCents(status.quote.price),
      quotedAt: status.quote.at.toISOString(),
      level: status.quote.level,
      delayMinutes: FREE_QUOTE_DELAY_MINUTES,
    };
  }

  /**
   * Registra a compra ou a venda. Antes da trava: dia de pregão, cotação de hoje, ativo e a cotação
   * vista. Com a carteira travada: caixa na compra, posição na venda.
   */
  async trade(userId: string, id: string, input: NewTradeInput): Promise<TradeResult> {
    const portfolio = await ownedPortfolio(this.deps.portfolios, userId, id);
    const asset = await this.asset(input.assetId);
    const status = await this.tradability(portfolio, asset.id);
    if (!status.ok) throw blockError(status);
    if (input.type === 'buy' && !asset.active) throw new AssetInactiveError();

    const { quote } = status;
    const price = roundToCents(quote.price);
    if (quote.at.toISOString() !== input.quotedAt) {
      throw new QuoteChangedError(price, quote.at.toISOString());
    }
    const total = tradeTotal(input.quantity, price);
    const now = this.clock();

    let after: PortfolioLedger = { cash: [], trades: [], reversals: [] };
    const stored = await this.deps.ledger.appendTradeLocked(id, (locked): NewStoredTrade => {
      const current = activeLedger(locked);
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
        price,
        total,
        date: isoDateInBrasilia(now),
        recordedAt: now,
        quotedAt: quote.at,
        level: quote.level,
        source: quote.source,
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
      position: holding ? this.valued(holding, asset, quote) : null,
    };
  }

  /**
   * Pode negociar agora? Carteira ao vivo (a histórica é da SPEC-016), dia de pregão (RB11) e
   * cotação do pregão de hoje, no horário de Brasília (RB07). Depois do fechamento, vale a última
   * cotação do dia (SPEC-014 §4.1, decisão 1).
   */
  private async tradability(portfolio: StoredPortfolio, assetId: string): Promise<Tradability> {
    if (portfolio.type === 'historical') {
      return { ok: false, reason: 'historical_portfolio', nextTradingDay: null };
    }
    const today = isoDateInBrasilia(this.clock());
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
    return { ok: true, quote };
  }

  private async asset(assetId: string): Promise<MarketAsset> {
    const asset = await this.deps.market.asset(assetId);
    if (!asset) throw new TradeAssetNotFoundError();
    return asset;
  }

  /** A posição com o último preço conhecido: a cotação do pregão; sem ela, o último fechamento. */
  private async position(holding: Holding): Promise<Position> {
    const asset = (await this.deps.market.asset(holding.assetId)) ?? {
      id: holding.assetId,
      ticker: '',
      name: '',
      assetClass: 'stock' as const,
      active: false,
    };
    const quote = await this.deps.market.latestQuote(holding.assetId, USER_LEVEL);
    if (quote) return this.valued(holding, asset, quote);
    const close = await this.deps.market.lastClose(holding.assetId);
    const base = basePosition(holding, asset);
    if (!close) return base;
    const valuation = valuate(holding, close.close);
    return {
      ...base,
      lastPrice: roundToCents(close.close),
      lastPriceKind: 'close',
      lastPriceDate: close.date,
      marketValue: valuation.marketValue,
      change: valuation.change,
      changePercent: valuation.changePercent,
    };
  }

  private valued(holding: Holding, asset: MarketAsset, quote: MarketQuote): Position {
    const valuation = valuate(holding, quote.price);
    return {
      ...basePosition(holding, asset),
      lastPrice: roundToCents(quote.price),
      lastPriceKind: 'intraday',
      lastPriceAt: quote.at.toISOString(),
      marketValue: valuation.marketValue,
      change: valuation.change,
      changePercent: valuation.changePercent,
    };
  }
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
    quotedAt: trade.quotedAt.toISOString(),
    level: trade.level,
  };
}
