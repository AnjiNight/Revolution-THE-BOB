import { addDays, centsToAmount, type IsoDate } from '@simulador/shared';
import { compareMovements, credits, toCents, type LedgerMovement } from './cash-ledger.js';
import { timeline, type EventInput, type IncomeInput } from './corporate-actions.js';
import { divideHalfUp } from './decimal.js';
import { roundToCents, type Holding, type TradeMovement } from './positions.js';
import { eventBetween } from './price-adjustment.js';
import { isPriceJump } from './price-history.js';

/**
 * Rentabilidade e evolução patrimonial (SPEC-019), em inteiros (RNF12). Percorre os pregões uma
 * vez: em cada um, o patrimônio é o caixa (com os proventos da SPEC-043) mais a quantidade corrigida
 * de cada ativo vezes o fechamento da B3 do dia (ou o último antes dele).
 */

export interface DailyClose {
  date: IsoDate;
  close: string;
}

export interface PerformanceInput {
  /** Aportes, retiradas, compras e vendas que valem (sem os estornados). */
  movements: readonly LedgerMovement[];
  trades: readonly TradeMovement[];
  income: readonly IncomeInput[];
  events: readonly EventInput[];
  /** Fechamentos por ativo, em ordem de data, desde a primeira negociação dele. */
  closes: ReadonlyMap<string, readonly DailyClose[]>;
  /** Os dias da conta, em ordem: os pregões do primeiro lançamento até `to`. */
  days: readonly IsoDate[];
  /** Primeiro dia do período (os anteriores só formam o patrimônio inicial). */
  from: IsoDate;
  /** Carteira ao vivo: a cotação do pregão de hoje, que vale no lugar do fechamento nesse dia. */
  live?: { date: IsoDate; prices: ReadonlyMap<string, string> };
}

export interface PerformancePointValue {
  date: IsoDate;
  equity: string;
  invested: string;
  return: string;
}

export type PerformanceAlert =
  | { kind: 'unexplained_jump'; assetId: string; date: IsoDate }
  | { kind: 'no_close'; assetId: string; until: IsoDate };

export interface PerformanceResult {
  startValue: string;
  endValue: string;
  netFlows: string;
  result: string;
  return: string;
  /** Um ponto por dia do período. */
  points: PerformancePointValue[];
  warnings: PerformanceAlert[];
}

/** A cota anda com 12 casas: 10 anos de pregões sem acumular erro na % de 2 casas. */
const QUOTA_ONE = 10n ** 12n;

export function performance(input: PerformanceInput): PerformanceResult {
  const to = input.days.at(-1);
  if (to === undefined) {
    return {
      startValue: '0.00',
      endValue: '0.00',
      netFlows: '0.00',
      result: '0.00',
      return: '0.00',
      points: [],
      warnings: [],
    };
  }
  const line = timeline({
    trades: input.trades,
    income: input.income,
    events: input.events,
    until: to,
  });
  const cashFlow = [...input.movements, ...line.movements].sort(compareMovements);
  const snapshots = holdingSnapshots(input, to);
  const prices = new PriceCursor(input);

  let cash = 0n;
  let invested = 0n;
  let cursor = 0;
  let previousDay: IsoDate | null = null;
  let previousEquity = 0n;
  let startValue = 0n;
  let netFlows = 0n;
  let quota = QUOTA_ONE;
  const points: PerformancePointValue[] = [];
  const warnings: PerformanceAlert[] = [];

  for (const day of input.days) {
    // Aportes e retiradas desde o dia anterior da conta (fim de semana entra no pregão seguinte).
    let flow = 0n;
    while (cursor < cashFlow.length && (cashFlow[cursor] as LedgerMovement).date <= day) {
      const movement = cashFlow[cursor] as LedgerMovement;
      const value = toCents(movement.amount);
      cash += credits(movement.type) ? value : -value;
      if (movement.type === 'deposit') flow += value;
      if (movement.type === 'withdrawal') flow -= value;
      cursor += 1;
    }
    invested += flow;
    const holdings = snapshots.at(day);
    let equity = cash;
    for (const holding of holdings.values()) {
      equity += BigInt(holding.quantity) * toCents(roundToCents(prices.at(holding, day)));
    }

    if (day >= input.from) {
      if (points.length === 0) startValue = previousEquity;
      netFlows += flow;
      // Decisão 1: o aporte do dia conta como feito antes do fechamento.
      const base = previousEquity + flow;
      if (base > 0n) quota = divideHalfUp(quota * equity, base);
      points.push({
        date: day,
        equity: centsToAmount(equity),
        invested: centsToAmount(invested),
        return: percent(quota),
      });
      if (previousDay) warnings.push(...jumps(input, snapshots, previousDay, day));
    }
    previousEquity = equity;
    previousDay = day;
  }

  for (const [assetId, until] of prices.missing) {
    warnings.push({ kind: 'no_close', assetId, until });
  }
  const end = toCents(points.at(-1)?.equity ?? '0.00');
  return {
    startValue: centsToAmount(startValue),
    endValue: centsToAmount(end),
    netFlows: centsToAmount(netFlows),
    result: centsToAmount(end - startValue - netFlows),
    return: points.at(-1)?.return ?? '0.00',
    points,
    warnings,
  };
}

/** Cota → % com 2 casas, meio para cima: "12.34", "-0.85". */
function percent(quota: bigint): string {
  return centsToAmount(divideHalfUp((quota - QUOTA_ONE) * 10_000n, QUOTA_ONE));
}

/**
 * As posições de cada dia: mudam só nos dias de negociação e no dia seguinte à data com de um
 * evento. Em cada um desses dias, a linha do tempo da SPEC-043 até ele.
 */
function holdingSnapshots(input: PerformanceInput, to: IsoDate) {
  const changes = [
    ...new Set([
      ...input.trades.map((trade) => trade.date),
      ...input.events.map((event) => addDays(event.exDate, 1)),
    ]),
  ]
    .filter((date) => date <= to)
    .sort();
  const states = changes.map((date) => ({
    date,
    holdings: timeline({
      trades: input.trades,
      income: input.income,
      events: input.events,
      until: date,
    }).holdings,
  }));
  const empty = new Map<string, Holding>();
  return {
    /** As posições no fim do dia. */
    at(day: IsoDate): ReadonlyMap<string, Holding> {
      let found: ReadonlyMap<string, Holding> = empty;
      for (const state of states) {
        if (state.date > day) break;
        found = state.holdings;
      }
      return found;
    },
  };
}

/** O preço de cada ativo no dia: o fechamento do dia ou o último antes; sem nenhum, o da compra. */
class PriceCursor {
  /** Ativos sem fechamento até a data (o primeiro fechamento deles), para o aviso. */
  readonly missing = new Map<string, IsoDate>();
  private readonly firstBuy = new Map<string, string>();

  constructor(private readonly input: PerformanceInput) {
    for (const trade of [...input.trades].sort(compareMovements)) {
      if (trade.type === 'buy' && !this.firstBuy.has(trade.assetId)) {
        this.firstBuy.set(
          trade.assetId,
          centsToAmount(divideHalfUp(toCents(trade.total), BigInt(trade.quantity))),
        );
      }
    }
  }

  at(holding: Holding, day: IsoDate): string {
    const live = this.input.live;
    const livePrice = live && live.date === day ? live.prices.get(holding.assetId) : undefined;
    if (livePrice !== undefined) return livePrice;
    const closes = this.input.closes.get(holding.assetId) ?? [];
    const close = lastOnOrBefore(closes, day);
    if (close) return close.close;
    const first = closes[0];
    if (!this.missing.has(holding.assetId)) {
      this.missing.set(holding.assetId, first ? addDays(first.date, -1) : day);
    }
    return this.firstBuy.get(holding.assetId) ?? holding.averagePrice;
  }
}

/** Busca binária: o último fechamento com data até o dia. */
function lastOnOrBefore(closes: readonly DailyClose[], day: IsoDate): DailyClose | undefined {
  let low = 0;
  let high = closes.length - 1;
  let found: DailyClose | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const close = closes[middle] as DailyClose;
    if (close.date <= day) {
      found = close;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

/**
 * Decisão 5: salto de preço (SPEC-010) entre o último fechamento até o dia anterior e o do dia,
 * num ativo em posição no fim do dia anterior, sem evento da B3 com data com entre os dois.
 */
function jumps(
  input: PerformanceInput,
  snapshots: ReturnType<typeof holdingSnapshots>,
  previousDay: IsoDate,
  day: IsoDate,
): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];
  for (const assetId of snapshots.at(previousDay).keys()) {
    const closes = input.closes.get(assetId) ?? [];
    const current = lastOnOrBefore(closes, day);
    if (!current || current.date <= previousDay) continue;
    const before = lastOnOrBefore(closes, addDays(current.date, -1));
    if (!before || !isPriceJump(before.close, current.close)) continue;
    const events = input.events.filter((event) => event.assetId === assetId);
    if (eventBetween(events, before.date, current.date)) continue;
    alerts.push({ kind: 'unexplained_jump', assetId, date: current.date });
  }
  return alerts;
}
