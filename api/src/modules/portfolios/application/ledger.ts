import type { LedgerMovement } from '../../financial-calculation/cash-ledger.js';
import type { TradeMovement } from '../../financial-calculation/positions.js';
import { PortfolioNotFoundError } from '../domain/errors.js';
import type {
  PortfolioLedger,
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
