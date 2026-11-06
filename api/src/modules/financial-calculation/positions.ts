import { centsToAmount, type IsoDate } from '@simulador/shared';
import { compareMovements, toCents, type LedgerMovement } from './cash-ledger.js';
import { divideHalfUp, isDecimalText } from './decimal.js';

/** Uma compra ou venda do livro-razão (SPEC-014), para a conta das posições. */
export interface TradeMovement {
  id: string;
  assetId: string;
  type: 'buy' | 'sell';
  /** RB27: inteira, de 1 a 1.000.000. */
  quantity: number;
  /** Quantidade × preço, com 2 casas. */
  total: string;
  date: IsoDate;
  recordedAt: Date;
}

/** A posição de um ativo: quantidade e preço médio com 6 casas (SPEC-014 §4.2). */
export interface Holding {
  assetId: string;
  quantity: number;
  averagePrice: string;
}

/** O preço médio anda em milionésimos de real: arredondar a cada compra não acumula erro. */
const MICROS_PER_CENT = 10_000n;

function formatMicros(micros: bigint): string {
  const text = micros.toString().padStart(7, '0');
  return `${text.slice(0, -6)}.${text.slice(-6)}`;
}

function microsOf(text: string): bigint {
  if (!isDecimalText(text) || text.startsWith('-')) {
    throw new RangeError(`preço inválido: "${text}"`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

/**
 * Posições a partir das negociações (RB09), na ordem do livro. Na compra, o preço médio passa a ser
 * (preço médio × quantidade + total da compra) ÷ nova quantidade, com 6 casas, meio para cima; na
 * venda, não muda (RB10). A posição zerada sai, e a próxima compra começa um preço médio novo.
 * Venda maior que a posição é erro: quem grava confere antes (RB06).
 */
export function holdings(trades: readonly TradeMovement[]): Map<string, Holding> {
  const positions = new Map<string, { quantity: bigint; average: bigint }>();
  for (const trade of [...trades].sort(compareMovements)) {
    if (!Number.isInteger(trade.quantity) || trade.quantity < 1) {
      throw new RangeError(`quantidade inválida na negociação ${trade.id}: ${trade.quantity}`);
    }
    const quantity = BigInt(trade.quantity);
    const current = positions.get(trade.assetId) ?? { quantity: 0n, average: 0n };
    if (trade.type === 'buy') {
      const cost = current.average * current.quantity + toCents(trade.total) * MICROS_PER_CENT;
      const total = current.quantity + quantity;
      positions.set(trade.assetId, { quantity: total, average: divideHalfUp(cost, total) });
      continue;
    }
    if (quantity > current.quantity) {
      throw new RangeError(`venda maior que a posição na negociação ${trade.id}`);
    }
    const left = current.quantity - quantity;
    if (left === 0n) positions.delete(trade.assetId);
    else positions.set(trade.assetId, { quantity: left, average: current.average });
  }
  return new Map(
    [...positions].map(([assetId, position]) => [
      assetId,
      {
        assetId,
        quantity: Number(position.quantity),
        averagePrice: formatMicros(position.average),
      },
    ]),
  );
}

/** Um lançamento para a conferência do livro: os do caixa e as negociações (com ativo e quantidade). */
export type CheckedMovement = LedgerMovement & { assetId?: string; quantity?: number };

export interface LedgerBreak {
  /** O lançamento em que o livro quebra. */
  id: string;
  /** `cash`: o caixa fica negativo (RB05, RB26); `position`: a venda passa da posição (RB06). */
  reason: 'cash' | 'position';
}

/**
 * SPEC-015: percorre os lançamentos na ordem do livro e devolve o primeiro que deixa o caixa
 * negativo ou vende mais que a posição; `null` se o livro é válido em todos os momentos. O estorno
 * confere o livro sem o lançamento estornado.
 */
export function firstBreak(movements: readonly CheckedMovement[]): LedgerBreak | null {
  let cash = 0n;
  const held = new Map<string, number>();
  for (const movement of [...movements].sort(compareMovements)) {
    const value = toCents(movement.amount);
    if (movement.type === 'deposit' || movement.type === 'sell') cash += value;
    else cash -= value;
    if (movement.type === 'buy' || movement.type === 'sell') {
      const assetId = movement.assetId ?? '';
      const quantity = movement.quantity ?? 0;
      const current = held.get(assetId) ?? 0;
      if (movement.type === 'sell' && quantity > current) {
        return { id: movement.id, reason: 'position' };
      }
      held.set(assetId, movement.type === 'buy' ? current + quantity : current - quantity);
    }
    if (cash < 0n) return { id: movement.id, reason: 'cash' };
  }
  return null;
}

/** Preço da cotação (até 6 casas) → o preço da negociação, com 2 casas, meio para cima (RB13). */
export function roundToCents(price: string): string {
  return centsToAmount(divideHalfUp(microsOf(price), MICROS_PER_CENT));
}

/** Quantidade × preço com 2 casas: exato em centavos, sem arredondar. */
export function tradeTotal(quantity: number, price: string): string {
  return centsToAmount(BigInt(quantity) * toCents(price));
}

/** Preço médio de 6 casas → 2 casas, para mostrar. */
export function displayPrice(averagePrice: string): string {
  return roundToCents(averagePrice);
}

export interface Valuation {
  /** Quantidade × último preço (este já com 2 casas). */
  marketValue: string;
  /** Quantidade × preço médio, com 2 casas. */
  cost: string;
  change: string;
  /** Variação sobre o custo, em %, com 2 casas; "0.00" se o custo for zero. */
  changePercent: string;
}

/** Valor atual da posição e a variação sobre o preço médio (SPEC-014 §4.2), sem custos (RB20). */
export function valuate(holding: Holding, lastPrice: string): Valuation {
  const quantity = BigInt(holding.quantity);
  const market = quantity * toCents(roundToCents(lastPrice));
  const cost = divideHalfUp(microsOf(holding.averagePrice) * quantity, MICROS_PER_CENT);
  const change = market - cost;
  const percent = cost === 0n ? 0n : divideHalfUp(change * 10_000n, cost);
  return {
    marketValue: centsToAmount(market),
    cost: centsToAmount(cost),
    change: centsToAmount(change),
    changePercent: centsToAmount(percent),
  };
}
