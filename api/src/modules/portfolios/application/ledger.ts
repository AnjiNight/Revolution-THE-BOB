import { yearOf, type IsoDate } from '@simulador/shared';
import type { LedgerMovement } from '../../financial-calculation/cash-ledger.js';
import {
  timeline,
  type EventInput,
  type IncomeInput,
  type Timeline,
} from '../../financial-calculation/corporate-actions.js';
import type { TradeMovement } from '../../financial-calculation/positions.js';
import {
  CalendarNotPublishedError,
  type TradingCalendar,
} from '../../financial-calculation/trading-calendar.js';
import { PortfolioNotFoundError } from '../domain/errors.js';
import type {
  PortfolioCalendar,
  PortfolioLedger,
  PortfolioMarket,
  PortfolioRepository,
  StoredCashEntry,
  StoredPortfolio,
  StoredTrade,
} from './ports.js';

/** SPEC-015: quando cada lançamento estornado foi estornado, pelo id do lançamento. */
export function reversalTimes(ledger: PortfolioLedger): Map<string, Date> {
  return new Map(ledger.reversals.map((reversal) => [reversal.entryId, reversal.recordedAt]));
}

/**
 * O livro que vale para as contas (RB28): sem os lançamentos estornados. Os estornos em si não
 * mexem em nada; só tiram o original.
 */
export function activeLedger(ledger: PortfolioLedger): PortfolioLedger {
  const reversed = reversalTimes(ledger);
  return {
    cash: ledger.cash.filter((entry) => !reversed.has(entry.id)),
    trades: ledger.trades.filter((trade) => !reversed.has(trade.id)),
    reversals: [],
  };
}

/** Movimento do caixa com o lançamento guardado junto, para o extrato. */
export type LedgerItem = LedgerMovement &
  ({ kind: 'cash'; entry: StoredCashEntry } | { kind: 'trade'; entry: StoredTrade });

/** Aportes, retiradas, compras e vendas como movimentos do caixa (SPEC-013, SPEC-014). */
export function ledgerItems(ledger: PortfolioLedger): LedgerItem[] {
  return [
    ...ledger.cash.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      date: entry.date,
      recordedAt: entry.recordedAt,
      kind: 'cash' as const,
      entry,
    })),
    ...ledger.trades.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.total,
      date: entry.date,
      recordedAt: entry.recordedAt,
      kind: 'trade' as const,
      entry,
    })),
  ];
}

export function tradeMovements(trades: readonly StoredTrade[]): TradeMovement[] {
  return trades.map((trade) => ({
    id: trade.id,
    assetId: trade.assetId,
    type: trade.type,
    quantity: trade.quantity,
    total: trade.total,
    date: trade.date,
    recordedAt: trade.recordedAt,
  }));
}

/** SPEC-043: os proventos e eventos dos ativos que a carteira negociou. */
export interface CorporateData {
  income: IncomeInput[];
  events: EventInput[];
}

/**
 * SPEC-043: lê os proventos e eventos de cada ativo negociado, da primeira negociação dele em
 * diante (as estornadas também: não muda a conta e evita ler de novo). `extra` acrescenta um ativo
 * que vai ser negociado agora, a partir da data dele. Fica fora da trava do livro. Cada evento sai
 * com o pregão em que passa a valer (o seguinte à data com), pelo calendário (SPEC-005).
 */
export async function corporateData(
  market: Pick<PortfolioMarket, 'corporateEvents' | 'income'>,
  calendar: PortfolioCalendar,
  ledger: PortfolioLedger,
  extra?: { assetId: string; from: IsoDate },
): Promise<CorporateData> {
  const from = new Map<string, IsoDate>();
  for (const trade of ledger.trades) {
    const current = from.get(trade.assetId);
    if (!current || trade.date < current) from.set(trade.assetId, trade.date);
  }
  if (extra) {
    const current = from.get(extra.assetId);
    if (!current || extra.from < current) from.set(extra.assetId, extra.from);
  }
  const loaded = await Promise.all(
    [...from].map(([assetId, date]) =>
      Promise.all([market.income(assetId, date), market.corporateEvents(assetId, date)]),
    ),
  );
  return {
    income: loaded.flatMap(([income]) => income),
    events: await withEffectiveDates(
      calendar,
      loaded.flatMap(([, events]) => events),
    ),
  };
}

/**
 * O pregão seguinte à data com de cada evento. Com o ano (ou o seguinte) sem calendário publicado,
 * o evento fica sem a data, e a conta usa o dia seguinte à data com.
 */
async function withEffectiveDates(
  calendar: PortfolioCalendar,
  events: readonly EventInput[],
): Promise<EventInput[]> {
  const byYear = new Map<number, Promise<TradingCalendar | null>>();
  const load = (year: number) => {
    let found = byYear.get(year);
    if (!found) {
      found = publishedOrNull(() => calendar.tradingCalendar(year, year + 1)).then(
        (days) => days ?? publishedOrNull(() => calendar.tradingCalendar(year, year)),
      );
      byYear.set(year, found);
    }
    return found;
  };
  return Promise.all(
    events.map(async (event) => {
      const days = await load(yearOf(event.exDate));
      if (!days) return event;
      try {
        return { ...event, effectiveDate: days.nextTradingDay(event.exDate) };
      } catch (error) {
        if (error instanceof CalendarNotPublishedError) return event;
        throw error;
      }
    }),
  );
}

/** O calendário dos anos pedidos; `null` se algum deles não foi publicado. */
async function publishedOrNull(
  load: () => Promise<TradingCalendar>,
): Promise<TradingCalendar | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof CalendarNotPublishedError) return null;
    throw error;
  }
}

/** SPEC-043: a linha do tempo do livro que vale (sem estornados) até o dia pedido. */
export function ledgerTimeline(
  ledger: PortfolioLedger,
  data: CorporateData,
  until: IsoDate,
): Timeline {
  return timeline({
    trades: tradeMovements(ledger.trades),
    income: data.income,
    events: data.events,
    until,
  });
}

/** Os lançamentos do usuário e os da linha do tempo, para o saldo e a conferência do livro. */
export function cashMovements(ledger: PortfolioLedger, line: Timeline): LedgerMovement[] {
  return [...ledgerItems(ledger), ...line.movements];
}

/**
 * A carteira do usuário (RB03). De outra pessoa: `PortfolioNotFoundError(true)`, que a rota
 * responde como inexistente e registra no log.
 */
export async function ownedPortfolio(
  portfolios: PortfolioRepository,
  userId: string,
  id: string,
): Promise<StoredPortfolio> {
  const portfolio = await portfolios.findById(id);
  if (!portfolio) throw new PortfolioNotFoundError();
  if (portfolio.userId !== userId) throw new PortfolioNotFoundError(true);
  return portfolio;
}
