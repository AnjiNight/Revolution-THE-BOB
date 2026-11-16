import {
  addDays,
  centsToAmount,
  FREE_QUOTE_DELAY_MINUTES,
  isoDateInBrasilia,
  yearOf,
  type IsoDate,
  type NewTradeInput,
  type BenchmarkSummary,
  type ComparedPerformance,
  type ComparisonBenchmark,
  type ComparisonQuery,
  type PerformancePoint,
  type PerformanceQuery,
  type PerformanceWarning,
  type PortfolioComparison,
  type PortfolioPerformance,
  type PortfolioPositions,
  type Position,
  type PositionEvent,
  type QuoteLevelCode,
  type Trade,
  type TradeBlockReason,
  type TradeQuote,
  type TradeResult,
} from '@simulador/shared';
import { canSpend, cashLedger, toCents } from '../../financial-calculation/cash-ledger.js';
import {
  priceAfterEvents,
  type AppliedEvent,
  type Timeline,
} from '../../financial-calculation/corporate-actions.js';
import { allocation } from '../../financial-calculation/allocation.js';
import {
  cdiBenchmark,
  cdiShare,
  indexBenchmark,
  sameMoney,
  type BenchmarkSeries,
  type CdiRate,
} from '../../financial-calculation/benchmarks.js';
import {
  chartDays,
  comparisonStart,
  performanceStart,
  sharedBaseDate,
} from '../../financial-calculation/comparison.js';
import { performance, type PerformanceResult } from '../../financial-calculation/performance.js';
import {
  displayPrice,
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
import {
  activeLedger,
  cashMovements,
  corporateData,
  ledgerItems,
  ledgerTimeline,
  ownedPortfolio,
  tradeMovements,
} from './ledger.js';
import { MarketReads } from './market-reads.js';
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

/** SPEC-043: o tipo do evento (SPEC-042) como a carteira mostra. */
const EVENT_KIND: Record<AppliedEvent['kind'], PositionEvent['kind']> = {
  desdobramento: 'split',
  grupamento: 'reverse_split',
  bonificacao: 'bonus',
};

/** Até a SPEC-026 (assinatura), todo usuário vê o nível gratuito (DA16). */
const USER_LEVEL: QuoteLevelCode = 'free';

export interface TradingServiceDeps {
  portfolios: PortfolioRepository;
  ledger: LedgerRepository;
  calendar: PortfolioCalendar;
  market: PortfolioMarket;
  clock?: () => Date;
}

/** SPEC-019 (e SPEC-022): a conta de uma carteira no período, antes das referências. */
interface Measured {
  /** O primeiro dia da conta: o início do período ou, depois dele, o primeiro lançamento. */
  start: IsoDate;
  result: PerformanceResult;
  /** SPEC-020: algum FII esteve em posição no período (o IFIX aparece). */
  hadFii: boolean;
  warnings: PerformanceWarning[];
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

  /**
   * SPEC-014 §5.1: posições em ordem de ticker, com o caixa, o valor em ativos e o total. SPEC-043:
   * com os proventos pagos no caixa e a quantidade e o preço médio corrigidos pelos eventos.
   */
  async positions(userId: string, id: string): Promise<PortfolioPositions> {
    await ownedPortfolio(this.deps.portfolios, userId, id);
    // SPEC-015: as negociações e lançamentos estornados não contam.
    const ledger = activeLedger(await this.deps.ledger.ledger(id));
    return this.positionsOf(ledger, isoDateInBrasilia(this.clock()), this.reads());
  }

  /** As posições de hoje do livro que vale; a comparação (SPEC-022) usa a mesma conta. */
  private async positionsOf(
    ledger: PortfolioLedger,
    today: IsoDate,
    reads: MarketReads,
  ): Promise<PortfolioPositions> {
    const data = await corporateData(reads, reads, ledger);
    const line = ledgerTimeline(ledger, data, today);
    const cash = cashLedger(cashMovements(ledger, line)).balance;
    const holdingList = [...line.holdings.values()];
    const loaded = await this.deps.market.incomeLoaded(holdingList.map((h) => h.assetId));
    const positions = (
      await Promise.all(holdingList.map((holding) => this.position(holding, line, loaded, reads)))
    ).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const value = positions.reduce(
      (sum, position) => sum + (position.marketValue ? toCents(position.marketValue) : 0n),
      0n,
    );
    // SPEC-021: a distribuição de hoje, com as mesmas posições e o preço médio de 6 casas.
    const distribution = allocation({
      cash,
      positions: positions.map((position) => ({
        assetId: position.assetId,
        ticker: position.ticker,
        assetClass: position.class,
        sector: position.sector,
        quantity: position.quantity,
        averagePrice: line.holdings.get(position.assetId)?.averagePrice ?? position.averagePrice,
        marketValue: position.marketValue,
      })),
    });
    const received = [...line.received.values()].reduce((sum, cents) => sum + cents, 0n);
    const pending = line.pending.reduce((sum, credit) => sum + toCents(credit.net), 0n);
    const next = line.pending
      .filter((credit) => credit.paymentDate !== null)
      .sort((a, b) => (a.paymentDate ?? '').localeCompare(b.paymentDate ?? ''));
    const nextDate = next[0]?.paymentDate ?? null;
    return {
      cash,
      positionsValue: centsToAmount(value),
      total: centsToAmount(toCents(cash) + value),
      positions,
      lastEntryDate: lastDate(ledger),
      income: centsToAmount(received),
      pendingIncome: centsToAmount(pending),
      nextPayment: nextDate
        ? {
            date: nextDate,
            amount: centsToAmount(
              next
                .filter((credit) => credit.paymentDate === nextDate)
                .reduce((sum, credit) => sum + toCents(credit.net), 0n),
            ),
          }
        : null,
      incomeEnabled: this.deps.market.incomeEnabled,
      allocation: distribution,
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
    // SPEC-043: na histórica, o caixa e a posição naquela data, com os proventos pagos até ela e os
    // eventos já aplicados; na ao vivo, os de hoje.
    const until = portfolio.type === 'historical' && date ? date : isoDateInBrasilia(this.clock());
    const line = ledgerTimeline(
      ledger,
      await corporateData(this.deps.market, this.deps.calendar, ledger),
      until,
    );
    const common = {
      cash: cashLedger(cashMovements(ledger, line)).balance,
      held: line.holdings.get(assetId)?.quantity ?? 0,
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
    // SPEC-043: proventos e eventos lidos antes da trava (a conta, com o livro travado).
    const data = await corporateData(
      this.deps.market,
      this.deps.calendar,
      await this.deps.ledger.ledger(id),
      {
        assetId: asset.id,
        from: priced.date,
      },
    );

    let after: PortfolioLedger = { cash: [], trades: [], reversals: [] };
    const stored = await this.deps.ledger.appendTradeLocked(id, (locked): NewStoredTrade => {
      const current = activeLedger(locked);
      // RB25: na histórica, nada antes do último lançamento que vale.
      const last = lastDate(current);
      if (priced.kind === 'historical' && last && priced.date < last) {
        throw new PortfolioValidationError({ date: 'before_last_entry' });
      }
      // Na histórica não há lançamento do usuário depois da data (RB25): o caixa e a posição são
      // os do livro até ela, com os proventos pagos e os eventos até ela (SPEC-043).
      const line = ledgerTimeline(current, data, priced.date);
      const cash = cashLedger(cashMovements(current, line)).balance;
      if (input.type === 'buy' && !canSpend(cash, total)) throw new InsufficientCashError(cash);
      if (input.type === 'sell') {
        const held = line.holdings.get(asset.id)?.quantity ?? 0;
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

    const line = ledgerTimeline(after, data, priced.date);
    const holding = line.holdings.get(asset.id);
    const loaded = await this.deps.market.incomeLoaded([asset.id]);
    return {
      trade: toPublicTrade(stored, asset.ticker),
      cash: cashLedger(cashMovements(after, line)).balance,
      position: holding ? await this.position(holding, line, loaded, this.reads()) : null,
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

  /**
   * SPEC-019: rentabilidade da cota, resultado em R$ e a evolução do patrimônio no período, do
   * livro que vale (RB09), com os proventos e eventos da SPEC-043 e os fechamentos da B3. Nas duas
   * carteiras, até hoje com a cotação do pregão (DA17).
   */
  async performance(
    userId: string,
    id: string,
    query: PerformanceQuery,
  ): Promise<PortfolioPerformance> {
    const portfolio = await ownedPortfolio(this.deps.portfolios, userId, id);
    const today = isoDateInBrasilia(this.clock());
    let from: IsoDate;
    let to: IsoDate;
    if ('period' in query) {
      to = today;
      from = performanceStart(query.period, today, portfolio.startDate);
    } else {
      if (query.to > today) throw new PortfolioValidationError({ to: 'after_today' });
      ({ from, to } = query);
    }

    const ledger = activeLedger(await this.deps.ledger.ledger(id));
    const measured = await this.measure(ledger, from, to, today, this.reads());
    if (!measured) return emptyPerformance(from, to);
    const { start, result } = measured;
    const weekly = daysBetween(start, to) > WEEKLY_AFTER_DAYS;
    const references = await this.benchmarks(result, to, measured.hadFii);
    const series = result.points.map((point, index) => ({
      ...point,
      ...references.at(index),
    }));
    return {
      from: start,
      to,
      startValue: result.startValue,
      endValue: result.endValue,
      netFlows: result.netFlows,
      result: result.result,
      return: result.return,
      series: weekly ? lastOfEachWeek(series) : series,
      weekly,
      warnings: measured.warnings,
      empty: false,
      baseDate: result.baseDate,
      benchmarks: references.summary,
      cdiShare: cdiShare(result.return, references.cdiReturn),
    };
  }

  /**
   * SPEC-022: de 2 a 4 carteiras do usuário no mesmo período, cada uma com a mesma conta da tela
   * dela (rentabilidade, SPECs 019 e 020; distribuição de hoje, SPEC-021). Num pedido só: o mesmo
   * "hoje" e as mesmas cotações para todas, e o que se repete entre elas (fechamentos, cotações,
   * calendário) lido uma vez.
   */
  async comparison(userId: string, query: ComparisonQuery): Promise<PortfolioComparison> {
    // RB03: todas do usuário antes de qualquer conta; a de outra pessoa é o mesmo 404, sem dizer qual.
    const portfolios: StoredPortfolio[] = [];
    for (const id of query.ids) {
      portfolios.push(await ownedPortfolio(this.deps.portfolios, userId, id));
    }
    const today = isoDateInBrasilia(this.clock());
    let from: IsoDate;
    let to: IsoDate;
    if ('period' in query) {
      to = today;
      from = comparisonStart(
        query.period,
        today,
        portfolios.map((portfolio) => portfolio.startDate),
      );
    } else {
      if (query.to > today) throw new PortfolioValidationError({ to: 'after_today' });
      ({ from, to } = query);
    }

    const ledgers = await Promise.all(
      portfolios.map(async (portfolio) =>
        activeLedger(await this.deps.ledger.ledger(portfolio.id)),
      ),
    );
    // §4.2: o fechamento de um ativo em mais de uma carteira é lido uma vez, desde a primeira
    // negociação dele em qualquer uma; o calendário de todos os anos, também uma vez.
    const reads = this.reads();
    let first: IsoDate | null = null;
    for (const ledger of ledgers) {
      for (const item of ledgerItems(ledger)) {
        if (item.date <= to && (first === null || item.date < first)) first = item.date;
      }
      for (const trade of ledger.trades) {
        if (trade.date <= to) reads.reserveCloses(trade.assetId, trade.date);
      }
    }
    if (first !== null) await reads.loadCalendar(yearOf(first), yearOf(to));

    const [measured, positions] = await Promise.all([
      Promise.all(ledgers.map((ledger) => this.measure(ledger, from, to, today, reads))),
      Promise.all(ledgers.map((ledger) => this.positionsOf(ledger, today, reads))),
    ]);
    const present = measured.flatMap((item) => (item ? [item] : []));
    const daily = chartDays(present.map((item) => item.result.points.map((point) => point.date)));
    const base = sharedBaseDate(present.map((item) => item.result.baseDate));
    const chartStart = daily[0];
    const weekly = chartStart !== undefined && daysBetween(chartStart, to) > WEEKLY_AFTER_DAYS;
    // §4.2: as referências uma vez, do mesmo dia-base para todas; o IFIX se alguma teve FII.
    const references =
      base === null
        ? null
        : await this.referenceSeries(
            base,
            daily,
            to,
            present.some((item) => item.hadFii),
          );

    const compared = portfolios.map((portfolio, index) => {
      const item = measured[index];
      return {
        id: portfolio.id,
        name: portfolio.name,
        type: portfolio.type,
        startDate: portfolio.startDate,
        performance: item
          ? comparedPerformance(item, references?.rates ?? [], weekly)
          : emptyComparedPerformance(from),
        allocation: (positions[index] as PortfolioPositions).allocation,
      };
    });

    // Os dias do gráfico; acima de 2 anos, os pontos semanais das carteiras.
    const axis = weekly
      ? chartDays(compared.map((item) => item.performance.series.map((point) => point.date)))
      : daily;
    const position = new Map(daily.map((date, index) => [date, index]));
    const at = (series: BenchmarkSeries | null | undefined, date: IsoDate) =>
      series?.points[position.get(date) ?? -1] ?? null;
    return {
      from,
      to,
      baseDate: base,
      weekly,
      benchmarks: references
        ? [
            comparisonBenchmark('cdi', references.cdi, 'bcb'),
            comparisonBenchmark('ibov', references.ibov, 'b3'),
            ...(references.ifix ? [comparisonBenchmark('ifix', references.ifix, 'b3')] : []),
          ]
        : [],
      benchmarkSeries: axis.map((date) => ({
        date,
        benchmarks: {
          cdi: at(references?.cdi, date),
          ibov: at(references?.ibov, date),
          ifix: at(references?.ifix, date),
        },
      })),
      portfolios: compared,
    };
  }

  /**
   * A conta de uma carteira no período (SPEC-019), sem as referências: a tela da carteira e a
   * comparação (SPEC-022) usam a mesma, para os números baterem (CA03). `null` sem lançamento até
   * o fim do período.
   */
  private async measure(
    ledger: PortfolioLedger,
    from: IsoDate,
    to: IsoDate,
    today: IsoDate,
    reads: MarketReads,
  ): Promise<Measured | null> {
    const items = ledgerItems(ledger).filter((item) => item.date <= to);
    const first = items.map((item) => item.date).sort()[0];
    if (!first) return null;
    const start = from > first ? from : first;

    const calendar = await reads.tradingCalendar(yearOf(first), yearOf(to));
    const days: IsoDate[] = [];
    for (let day = first; day <= to; day = addDays(day, 1)) {
      if (calendar.isTradingDay(day)) days.push(day);
    }
    // Lançamento depois do último pregão (aporte de sábado na ao vivo): o dia dele fecha a conta.
    const lastItem = items
      .map((item) => item.date)
      .sort()
      .at(-1) as IsoDate;
    if (days.length === 0 || lastItem > (days.at(-1) as IsoDate)) days.push(lastItem);

    const active: PortfolioLedger = {
      cash: ledger.cash.filter((entry) => entry.date <= to),
      trades: ledger.trades.filter((trade) => trade.date <= to),
      reversals: [],
    };
    const data = await corporateData(reads, reads, active);
    const firstTrade = new Map<string, IsoDate>();
    for (const trade of active.trades) {
      const current = firstTrade.get(trade.assetId);
      if (!current || trade.date < current) firstTrade.set(trade.assetId, trade.date);
    }
    const closes = new Map(
      await Promise.all(
        [...firstTrade].map(
          async ([assetId, date]) => [assetId, await reads.closesFrom(assetId, date)] as const,
        ),
      ),
    );
    // Até hoje: o último dia da conta usa o mesmo último preço das posições (a cotação do pregão;
    // sem ela, o último fechamento), para o patrimônio bater com o total delas (CA03).
    const live = new Map<string, string>();
    if (to === today) {
      const line = ledgerTimeline(active, data, today);
      for (const assetId of line.holdings.keys()) {
        const { price } = await this.lastKnownPrice(assetId, line, reads);
        if (price !== undefined) live.set(assetId, price);
      }
    }

    const result = performance({
      movements: ledgerItems(active),
      trades: tradeMovements(active.trades),
      income: data.income,
      events: data.events,
      closes,
      days,
      from: start,
      live: { date: days.at(-1) as IsoDate, prices: live },
    });
    const assets = new Map(
      await Promise.all(
        [...firstTrade.keys()].map(
          async (assetId) => [assetId, await reads.asset(assetId)] as const,
        ),
      ),
    );
    return {
      start,
      result,
      // SPEC-020: o IFIX aparece se algum FII esteve em posição no período.
      hadFii: [...result.heldAssets].some((assetId) => assets.get(assetId)?.assetClass === 'fii'),
      warnings: result.warnings.map((warning) => ({
        ...warning,
        ticker: assets.get(warning.assetId)?.ticker ?? '',
      })),
    };
  }

  /**
   * SPEC-020: CDI, Ibovespa e, com FII no período, IFIX, desde o dia-base da cota, em cada ponto
   * (antes de escolher um por semana). Cada referência vai até o último dia que já tem dado.
   */
  private async benchmarks(result: PerformanceResult, to: IsoDate, withIfix: boolean) {
    const base = result.baseDate;
    const days = result.points.map((point) => point.date);
    const none = { cdi: null, ibov: null, ifix: null };
    if (base === null || days.length === 0) {
      return {
        summary: [],
        cdiReturn: null,
        at: () => ({ benchmarks: none, benchmarkValues: none }),
      };
    }
    const { cdi, ibov, ifix } = await this.referenceSeries(base, days, to, withIfix);
    // Decisão 3 (atualizada): os aportes e retiradas de cada ponto, para "o mesmo dinheiro".
    const last = result.points.at(-1);
    let invested = (last ? toCents(last.invested) : 0n) - toCents(result.netFlows);
    const flows = result.points.map((point) => {
      const flow = toCents(point.invested) - invested;
      invested = toCents(point.invested);
      return centsToAmount(flow);
    });
    const money = (series: BenchmarkSeries) =>
      sameMoney({ startValue: result.startValue, flows, factors: series.factors });
    const values = { cdi: money(cdi), ibov: money(ibov), ifix: ifix ? money(ifix) : null };
    const summarize = (
      code: BenchmarkSummary['code'],
      series: BenchmarkSeries,
      source: BenchmarkSummary['source'],
    ): BenchmarkSummary => {
      const until = series.until ? days.lastIndexOf(series.until) : -1;
      const endValue = until >= 0 ? (values[code]?.[until] ?? null) : null;
      return { code, return: series.return, until: series.until, endValue, source };
    };
    const summary: BenchmarkSummary[] = [
      summarize('cdi', cdi, 'bcb'),
      summarize('ibov', ibov, 'b3'),
      ...(ifix ? [summarize('ifix', ifix, 'b3')] : []),
    ];
    return {
      summary,
      cdiReturn: cdi.return,
      at: (index: number): Pick<PerformancePoint, 'benchmarks' | 'benchmarkValues'> => ({
        benchmarks: {
          cdi: cdi.points[index] ?? null,
          ibov: ibov.points[index] ?? null,
          ifix: ifix?.points[index] ?? null,
        },
        benchmarkValues: {
          cdi: values.cdi[index] ?? null,
          ibov: values.ibov[index] ?? null,
          ifix: values.ifix?.[index] ?? null,
        },
      }),
    };
  }

  /** SPEC-020: as séries das referências desde o dia-base, nos dias pedidos, com as taxas do CDI. */
  private async referenceSeries(
    base: IsoDate,
    days: readonly IsoDate[],
    to: IsoDate,
    withIfix: boolean,
  ) {
    // Uns dias antes do dia-base: o índice usa o último fechamento até ele.
    const lookback = addDays(base, -10);
    const [rates, ibovCloses, ifixCloses] = await Promise.all([
      this.deps.market.cdiRates(base, to),
      this.deps.market.indexCloses('IBOV', lookback, to),
      withIfix ? this.deps.market.indexCloses('IFIX', lookback, to) : Promise.resolve([]),
    ]);
    return {
      rates,
      cdi: cdiBenchmark({ base, days, rates }),
      ibov: indexBenchmark({ base, days, closes: ibovCloses }),
      ifix: withIfix ? indexBenchmark({ base, days, closes: ifixCloses }) : null,
    };
  }

  /** As leituras do mercado de um pedido, cada uma feita uma vez (SPEC-022). */
  private reads(): MarketReads {
    return new MarketReads(this.deps.market, this.deps.calendar);
  }

  private async asset(assetId: string): Promise<MarketAsset> {
    const asset = await this.deps.market.asset(assetId);
    if (!asset) throw new TradeAssetNotFoundError();
    return asset;
  }

  /**
   * O último preço conhecido do ativo: a cotação do pregão; sem ela, o último fechamento. SPEC-043:
   * se ele é de antes de um evento já aplicado à quantidade (a cotação de sexta na segunda, antes da
   * primeira do dia), vem dividido pelo multiplicador, para não inflar o valor da posição.
   */
  private async lastKnownPrice(assetId: string, line: Timeline, reads: MarketReads) {
    const quote = await reads.latestQuote(assetId, USER_LEVEL);
    const close = quote ? null : await reads.lastClose(assetId);
    const raw = quote?.price ?? close?.close;
    const date = quote ? isoDateInBrasilia(quote.at) : close?.date;
    const events = line.events.filter((event) => event.assetId === assetId);
    const price =
      raw !== undefined && date !== undefined ? priceAfterEvents(raw, date, events) : raw;
    return { quote, close, price };
  }

  /**
   * A posição com o último preço conhecido: a cotação do pregão; sem ela, o último fechamento.
   * SPEC-043: a quantidade e o preço médio já vêm corrigidos pelos eventos (os desde a primeira
   * compra em posição aparecem em `events`), com os proventos pagos do ativo.
   */
  private async position(
    holding: Holding,
    line: Timeline,
    loaded: ReadonlySet<string>,
    reads: MarketReads,
  ): Promise<Position> {
    const asset = (await reads.asset(holding.assetId)) ?? {
      id: holding.assetId,
      ticker: '',
      name: '',
      assetClass: 'stock' as const,
      active: false,
    };
    const events = line.events
      .filter((event) => event.assetId === holding.assetId && event.exDate >= holding.since)
      .map((event) => ({
        kind: EVENT_KIND[event.kind],
        exDate: event.exDate,
        multiplier: event.multiplier,
        quantityBefore: event.quantityBefore,
        quantityAfter: event.quantityAfter,
      }));
    const base = {
      ...basePosition(holding, asset),
      events,
      income: centsToAmount(line.received.get(holding.assetId) ?? 0n),
      incomeLoaded: loaded.has(holding.assetId),
    };
    const { quote, close, price } = await this.lastKnownPrice(holding.assetId, line, reads);
    if (price === undefined) return base;
    const priced: Position = {
      ...base,
      lastPrice: roundToCents(price),
      ...(quote
        ? { lastPriceKind: 'intraday', lastPriceAt: quote.at.toISOString() }
        : { lastPriceKind: 'close', lastPriceDate: close?.date ?? null }),
    };
    const valuation = valuate(holding, price);
    return {
      ...priced,
      marketValue: valuation.marketValue,
      change: valuation.change,
      changePercent: valuation.changePercent,
    };
  }
}

/** SPEC-019, decisão 4: acima de 2 anos, um ponto por semana. */
const WEEKLY_AFTER_DAYS = 730;

function daysBetween(from: IsoDate, to: IsoDate): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** O último ponto de cada semana (de segunda a domingo); o último ponto sempre fica. */
function lastOfEachWeek<T extends { date: IsoDate }>(points: readonly T[]): T[] {
  const week = (date: IsoDate) => {
    const day = new Date(`${date}T00:00:00Z`);
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
    return monday.toISOString().slice(0, 10);
  };
  return points.filter((point, index) => {
    const next = points[index + 1];
    return !next || week(next.date) !== week(point.date);
  });
}

function emptyPerformance(from: IsoDate, to: IsoDate): PortfolioPerformance {
  return {
    from,
    to,
    startValue: '0.00',
    endValue: '0.00',
    netFlows: '0.00',
    result: '0.00',
    return: '0.00',
    series: [],
    weekly: false,
    warnings: [],
    empty: true,
    baseDate: null,
    benchmarks: [],
    cdiShare: null,
  };
}

/**
 * SPEC-022: a rentabilidade de uma carteira na comparação, com os números da tela dela (CA03). O
 * "% do CDI" usa o CDI desde o dia-base desta carteira (SPEC-020), das taxas já lidas.
 */
function comparedPerformance(
  measured: Measured,
  rates: readonly CdiRate[],
  weekly: boolean,
): ComparedPerformance {
  const { result } = measured;
  const days = result.points.map((point) => point.date);
  const cdi =
    result.baseDate === null || days.length === 0
      ? null
      : cdiBenchmark({ base: result.baseDate, days, rates }).return;
  const series = result.points.map((point) => ({ date: point.date, return: point.return }));
  return {
    from: measured.start,
    startValue: result.startValue,
    endValue: result.endValue,
    netFlows: result.netFlows,
    result: result.result,
    return: result.return,
    cdiShare: cdiShare(result.return, cdi),
    empty: false,
    warnings: measured.warnings,
    series: weekly ? lastOfEachWeek(series) : series,
  };
}

/** Carteira sem lançamento até o fim do período: "Sem lançamentos no período", sem linha. */
function emptyComparedPerformance(from: IsoDate): ComparedPerformance {
  return {
    from,
    startValue: '0.00',
    endValue: '0.00',
    netFlows: '0.00',
    result: '0.00',
    return: '0.00',
    cdiShare: null,
    empty: true,
    warnings: [],
    series: [],
  };
}

/** SPEC-020: a referência no período, sem "o mesmo dinheiro" (cada carteira tem o seu). */
function comparisonBenchmark(
  code: ComparisonBenchmark['code'],
  series: BenchmarkSeries,
  source: ComparisonBenchmark['source'],
): ComparisonBenchmark {
  return { code, return: series.return, until: series.until, source };
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
    income: '0.00',
    incomeLoaded: false,
    sector: asset.sector ?? 'outros',
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
