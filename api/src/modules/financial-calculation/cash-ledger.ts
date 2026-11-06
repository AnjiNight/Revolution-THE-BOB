import { centsToAmount, type IsoDate } from '@simulador/shared';

/**
 * Um lançamento do livro-razão do caixa (SPEC-013, DA09): aporte e retirada, e, desde a SPEC-014,
 * compra (tira o total do caixa) e venda (põe o total).
 */
export interface LedgerMovement {
  id: string;
  type: 'deposit' | 'withdrawal' | 'buy' | 'sell';
  /** Decimal positivo com até 2 casas; na compra e na venda, o total da negociação. */
  amount: string;
  date: IsoDate;
  recordedAt: Date;
}

export type LedgerLine<T extends LedgerMovement> = T & { balanceAfter: string };

export interface CashLedger<T extends LedgerMovement> {
  /** Do mais antigo ao mais recente, com o saldo logo depois de cada um. */
  lines: Array<LedgerLine<T>>;
  balance: string;
}

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/** "1234.5" → 123450n; aceita sinal e qualquer tamanho (um saldo pode somar muitos aportes). */
export function toCents(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new RangeError(`valor monetário inválido: "${value}"`);
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** O que a ordem do livro olha em qualquer lançamento (caixa ou negociação). */
export interface Ordered {
  id: string;
  date: IsoDate;
  recordedAt: Date;
}

/** Ordem do livro: o dia, depois o momento do registro e, no empate, o id (sempre a mesma). */
export function compareMovements(a: Ordered, b: Ordered): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = a.recordedAt.getTime() - b.recordedAt.getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function signedCents(movement: LedgerMovement): bigint {
  const value = toCents(movement.amount);
  if (value <= 0n) {
    throw new RangeError(`valor inválido no lançamento ${movement.id}: "${movement.amount}"`);
  }
  return movement.type === 'deposit' || movement.type === 'sell' ? value : -value;
}

/**
 * Saldo em caixa (RB09): aportes − retiradas − compras + vendas, em centavos (RNF12), na ordem do
 * livro. Não confere se o caixa ficou negativo: quem grava confere antes (RB05, RB26, `canSpend`).
 */
export function cashLedger<T extends LedgerMovement>(movements: readonly T[]): CashLedger<T> {
  let balance = 0n;
  const lines = [...movements].sort(compareMovements).map((movement) => {
    balance += signedCents(movement);
    return { ...movement, balanceAfter: centsToAmount(balance) };
  });
  return { lines, balance: centsToAmount(balance) };
}

/** A retirada (RB26) ou a compra (RB05) cabe no saldo? */
export function canSpend(balance: string, amount: string): boolean {
  return toCents(amount) <= toCents(balance);
}
