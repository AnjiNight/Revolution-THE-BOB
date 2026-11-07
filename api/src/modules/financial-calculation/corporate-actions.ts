import { addDays, centsToAmount, type DividendKind, type IsoDate } from '@simulador/shared';
import { compareMovements, credits, toCents, type LedgerMovement } from './cash-ledger.js';
import { divideHalfUp, toMicros } from './decimal.js';
import { formatMicros, type Holding, type LedgerBreak, type TradeMovement } from './positions.js';
import { multiplierText, shareMultiplier, type PriceEventInput } from './price-adjustment.js';

/**
 * Proventos e eventos corporativos na carteira (SPEC-043), em inteiros (RNF12). Nada disso é
 * gravado (§4.1, decisão 1): a linha do tempo junta as negociações que valem com os proventos e os
 * eventos da SPEC-042 cada vez que a carteira é lida.
 */

/** Provento por ação ou cota, como a SPEC-042 guarda (valor com até 10 casas). */
export interface IncomeInput {
  id: string;
  assetId: string;
  kind: DividendKind;
  /** Data com: recebe quem tinha o ativo no fim desse dia. */
  exDate: IsoDate;
  /** `null`: "provisionado", ainda sem data. */
  paymentDate: IsoDate | null;
  value: string;
}

/** Desdobramento, grupamento ou bonificação, com o fechamento da data com (para as frações). */
export interface EventInput extends PriceEventInput {
  id: string;
  assetId: string;
  close: string | null;
}

/** Um provento de quem tinha o ativo na data com, com o IR do JCP já tirado (decisão 3). */
export interface IncomeCredit {
  id: string;
  assetId: string;
  kind: DividendKind;
  exDate: IsoDate;
  paymentDate: IsoDate | null;
  quantity: number;
  perShare: string;
  gross: string;
  tax: string;
  net: string;
}

/** A fração de ação que sobrou num evento, vendida pelo fechamento ajustado (decisão 5). */
export interface FractionSale {
  eventId: string;
  assetId: string;
  /** A fração, com até 6 casas ("0.5"). */
  shares: string;
  /** Fechamento da data com dividido pelo multiplicador, com 2 casas. */
  price: string;
}

export interface AppliedEvent {
  id: string;
  assetId: string;
  kind: PriceEventInput['kind'];
  exDate: IsoDate;
  /** Quantas ações passa a valer uma ("4", "0.1", "1.02"). */
  multiplier: string;
  quantityBefore: number;
  quantityAfter: number;
}

/** Movimento do caixa que a linha do tempo cria: provento pago ou fração vendida. */
export type DerivedMovement = LedgerMovement & { type: 'income' } & (
    { kind: 'income'; income: IncomeCredit } | { kind: 'fraction'; fraction: FractionSale }
  );

export interface Timeline {
  /** As posições no fim de `until`, com a quantidade e o preço médio corrigidos. */
  holdings: Map<string, Holding>;
  /** Proventos pagos e frações vendidas até `until`, na ordem do livro. */
  movements: DerivedMovement[];
  /** Data com até `until`, pagamento depois dele (ou sem data): ainda não pode ser gasto. */
  pending: IncomeCredit[];
  events: AppliedEvent[];
  /** Total líquido de proventos pagos por ativo, em centavos. */
  received: Map<string, bigint>;
  /** Vendas maiores que a posição (contadas como venda de tudo), em ordem. */
  oversold: string[];
}

export interface TimelineInput {
  trades: readonly TradeMovement[];
  income: readonly IncomeInput[];
  events: readonly EventInput[];
  /** O último dia da conta: hoje, ou a data da negociação na histórica. */
  until: IsoDate;
}

/** No mesmo dia: eventos antes de tudo; o "quem tinha" da data com depois de tudo (§4.2). */
const START_OF_DAY = new Date(0);
const END_OF_DAY = new Date(8.64e15);
const VALUE_SCALE = 10n ** 10n;
/** Decisão 3: IR retido do JCP (LC 224/2025: 17,5% a partir de 01/01/2026). */
const JCP_RATE_CHANGE: IsoDate = '2026-01-01';

type Step =
  | { kind: 'trade'; id: string; date: IsoDate; recordedAt: Date; trade: TradeMovement }
  | { kind: 'event'; id: string; date: IsoDate; recordedAt: Date; event: EventInput }
  | { kind: 'income'; id: string; date: IsoDate; recordedAt: Date; income: IncomeInput };

interface State {
  quantity: bigint;
  /** Preço médio em milionésimos de real. */
  average: bigint;
  since: IsoDate;
}

export function timeline(input: TimelineInput): Timeline {
  const held = new Set(input.trades.map((trade) => trade.assetId));
  const steps: Step[] = [
    ...input.trades.map((trade) => ({
      kind: 'trade' as const,
      id: trade.id,
      date: trade.date,
      recordedAt: trade.recordedAt,
      trade,
    })),
    ...input.events
      .filter((event) => held.has(event.assetId))
      .map((event) => ({
        kind: 'event' as const,
        id: `event:${event.id}`,
        // Vale do dia seguinte à data com ("data ex") em diante.
        date: addDays(event.exDate, 1),
        recordedAt: START_OF_DAY,
        event,
      })),
    ...input.income
      .filter((income) => held.has(income.assetId))
      .map((income) => ({
        kind: 'income' as const,
        id: `income:${income.id}`,
        date: income.exDate,
        recordedAt: END_OF_DAY,
        income,
      })),
  ]
    .filter((step) => step.date <= input.until)
    .sort(compareMovements);

  const positions = new Map<string, State>();
  const result: Timeline = {
    holdings: new Map(),
    movements: [],
    pending: [],
    events: [],
    received: new Map(),
    oversold: [],
  };

  for (const step of steps) {
    if (step.kind === 'trade') {
      trade(positions, step.trade, result);
      continue;
    }
    if (step.kind === 'event') {
      event(positions, step.event, result);
      continue;
    }
    income(positions, step.income, input.until, result);
  }

  result.movements.sort(compareMovements);
  result.holdings = new Map(
    [...positions].map(([assetId, state]) => [
      assetId,
      {
        assetId,
        quantity: Number(state.quantity),
        averagePrice: formatMicros(state.average),
        since: state.since,
      },
    ]),
  );
  return result;
}

/** Compra e venda como em `holdings` (RB10); a venda maior que a posição vende tudo e é anotada. */
function trade(positions: Map<string, State>, movement: TradeMovement, result: Timeline): void {
  const quantity = BigInt(movement.quantity);
  const current = positions.get(movement.assetId) ?? {
    quantity: 0n,
    average: 0n,
    since: movement.date,
  };
  if (movement.type === 'buy') {
    const cost = current.average * current.quantity + toCents(movement.total) * 10_000n;
    const total = current.quantity + quantity;
    positions.set(movement.assetId, {
      quantity: total,
      average: divideHalfUp(cost, total),
      since: current.since,
    });
    return;
  }
  if (quantity > current.quantity) result.oversold.push(movement.id);
  const left = current.quantity > quantity ? current.quantity - quantity : 0n;
  if (left === 0n) positions.delete(movement.assetId);
  else positions.set(movement.assetId, { ...current, quantity: left });
}

/**
 * Decisão 5: a quantidade vezes o multiplicador, para baixo; o preço médio dividido por ele. A
 * fração que sobra é vendida pelo fechamento da data com dividido pelo multiplicador, em centavos
 * para baixo; sem fechamento, é descartada.
 */
function event(positions: Map<string, State>, input: EventInput, result: Timeline): void {
  const current = positions.get(input.assetId);
  if (!current) return;
  const { num, den } = shareMultiplier(input);
  const exact = current.quantity * num;
  const quantity = exact / den;
  const remainder = exact % den;
  result.events.push({
    id: input.id,
    assetId: input.assetId,
    kind: input.kind,
    exDate: input.exDate,
    multiplier: multiplierText(input),
    quantityBefore: Number(current.quantity),
    quantityAfter: Number(quantity),
  });
  if (quantity === 0n) positions.delete(input.assetId);
  else {
    positions.set(input.assetId, {
      ...current,
      quantity,
      average: divideHalfUp(current.average * den, num),
    });
  }
  if (remainder === 0n || input.close === null) return;
  const close = toMicros(input.close);
  const cents = (remainder * close) / (num * 10_000n);
  if (cents <= 0n) return;
  result.movements.push({
    id: `fraction:${input.id}`,
    type: 'income',
    amount: centsToAmount(cents),
    date: addDays(input.exDate, 1),
    recordedAt: START_OF_DAY,
    kind: 'fraction',
    fraction: {
      eventId: input.id,
      assetId: input.assetId,
      shares: trimZeros(formatMicros((remainder * 1_000_000n) / den)),
      price: centsToAmount(divideHalfUp(close * den, num * 10_000n)),
    },
  });
}

/**
 * Decisões 2, 3, 4 e 6: quem tinha o ativo no fim da data com recebe quantidade × valor, em
 * centavos para baixo; o JCP sai sem o IR (arredondado para cima). Pago até `until`, entra no
 * caixa na data de pagamento; senão, fica a receber. A amortização paga baixa o preço médio.
 */
function income(
  positions: Map<string, State>,
  input: IncomeInput,
  until: IsoDate,
  result: Timeline,
): void {
  const current = positions.get(input.assetId);
  if (!current) return;
  const value = scaledValue(input.value);
  const gross = (current.quantity * value) / (VALUE_SCALE / 100n);
  const tax = input.kind === 'jcp' ? jcpTax(gross, input.paymentDate ?? until) : 0n;
  const net = gross - tax;
  if (net <= 0n) return;
  const credit: IncomeCredit = {
    id: input.id,
    assetId: input.assetId,
    kind: input.kind,
    exDate: input.exDate,
    paymentDate: input.paymentDate,
    quantity: Number(current.quantity),
    perShare: input.value,
    gross: centsToAmount(gross),
    tax: centsToAmount(tax),
    net: centsToAmount(net),
  };
  if (input.paymentDate === null || input.paymentDate > until) {
    result.pending.push(credit);
    return;
  }
  result.movements.push({
    id: `income:${input.id}`,
    type: 'income',
    amount: credit.net,
    date: input.paymentDate,
    recordedAt: START_OF_DAY,
    kind: 'income',
    income: credit,
  });
  result.received.set(input.assetId, (result.received.get(input.assetId) ?? 0n) + net);
  if (input.kind === 'amortizacao') {
    const reduced = current.average - divideHalfUp(value, VALUE_SCALE / 1_000_000n);
    positions.set(input.assetId, { ...current, average: reduced > 0n ? reduced : 0n });
  }
}

function jcpTax(gross: bigint, paymentDate: IsoDate): bigint {
  const [num, den] = paymentDate < JCP_RATE_CHANGE ? [15n, 100n] : [175n, 1000n];
  return (gross * num + den - 1n) / den;
}

function scaledValue(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,10}))?$/.exec(value);
  if (!match) throw new RangeError(`valor de provento inválido: "${value}"`);
  return BigInt(match[1] ?? '0') * VALUE_SCALE + BigInt((match[2] ?? '').padEnd(10, '0'));
}

function trimZeros(text: string): string {
  return text.replace(/\.?0+$/, '');
}

/**
 * SPEC-015 com a SPEC-043: percorre o caixa inteiro (lançamentos do usuário e os da linha do tempo)
 * na ordem do livro e devolve o primeiro que deixa o caixa negativo ou vende mais que a posição.
 */
export function firstTimelineBreak(
  movements: readonly LedgerMovement[],
  oversold: readonly string[],
): LedgerBreak | null {
  const over = new Set(oversold);
  let cash = 0n;
  for (const movement of [...movements].sort(compareMovements)) {
    if (over.has(movement.id)) return { id: movement.id, reason: 'position' };
    const value = toCents(movement.amount);
    cash += credits(movement.type) ? value : -value;
    if (cash < 0n) return { id: movement.id, reason: 'cash' };
  }
  return null;
}
