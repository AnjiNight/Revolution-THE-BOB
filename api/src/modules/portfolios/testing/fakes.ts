import { randomUUID } from 'node:crypto';
import type {
  LedgerRepository,
  MarketAsset,
  MarketQuote,
  NewStoredCashEntry,
  NewStoredPortfolio,
  NewStoredReversal,
  NewStoredTrade,
  PortfolioLedger,
  PortfolioMarket,
  PortfolioRepository,
  StoredCashEntry,
  StoredPortfolio,
  StoredReversal,
  StoredTrade,
} from '../application/ports.js';
import { PortfolioNameInUseError } from '../domain/errors.js';

/**
 * Livro-razão da carteira em memória (SPECs 013 e 014). A trava é uma fila por carteira: cada
 * inclusão espera a anterior da mesma carteira terminar, como o SELECT … FOR UPDATE do PostgreSQL.
 */
export class InMemoryLedgerRepository implements LedgerRepository {
  readonly entries: StoredCashEntry[] = [];
  readonly trades: StoredTrade[] = [];
  readonly reversals: StoredReversal[] = [];
  private readonly locks = new Map<string, Promise<unknown>>();

  ledger(portfolioId: string): Promise<PortfolioLedger> {
    return Promise.resolve(this.of(portfolioId));
  }

  ledgers(portfolioIds: readonly string[]): Promise<Map<string, PortfolioLedger>> {
    return Promise.resolve(new Map(portfolioIds.map((id) => [id, this.of(id)])));
  }

  appendCashLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredCashEntry,
  ): Promise<StoredCashEntry> {
    return this.locked(portfolioId, (current) => this.add(portfolioId, decide(current)));
  }

  appendTradeLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredTrade,
  ): Promise<StoredTrade> {
    return this.locked(portfolioId, (current) => {
      const stored = { id: randomUUID(), portfolioId, ...decide(current) };
      this.trades.push(stored);
      return { ...stored };
    });
  }

  appendReversalLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredReversal,
  ): Promise<StoredReversal> {
    return this.locked(portfolioId, (current) => {
      const stored = { id: randomUUID(), portfolioId, ...decide(current) };
      // Como o índice único do banco: um estorno por lançamento.
      if (this.reversals.some((reversal) => reversal.entryId === stored.entryId)) {
        throw new Error('lançamento já estornado');
      }
      this.reversals.push(stored);
      return { ...stored };
    });
  }

  /** A carteira nova grava o aporte inicial por aqui (mesma "transação" do repositório). */
  add(portfolioId: string, entry: NewStoredCashEntry): StoredCashEntry {
    const stored = { id: randomUUID(), portfolioId, ...entry };
    this.entries.push(stored);
    return { ...stored };
  }

  /** Apaga os lançamentos da carteira e diz quantos eram (caixa e negociações). */
  removePortfolio(portfolioId: string): number {
    let removed = 0;
    for (const list of [this.entries, this.trades, this.reversals] as Array<
      Array<{ portfolioId: string }>
    >) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i]?.portfolioId === portfolioId) {
          list.splice(i, 1);
          removed += 1;
        }
      }
    }
    return removed;
  }

  private locked<T>(portfolioId: string, write: (current: PortfolioLedger) => T): Promise<T> {
    const previous = this.locks.get(portfolioId) ?? Promise.resolve();
    const next = previous.then(async () => {
      // Um ciclo de espera entre ler e gravar: sem a fila, dois pedidos leriam o mesmo saldo.
      const current = this.of(portfolioId);
      await new Promise((resolve) => setImmediate(resolve));
      return write(current);
    });
    this.locks.set(
      portfolioId,
      next.catch(() => undefined),
    );
    return next;
  }

  private of(portfolioId: string): PortfolioLedger {
    return {
      cash: this.entries
        .filter((entry) => entry.portfolioId === portfolioId)
        .map((entry) => ({ ...entry })),
      trades: this.trades
        .filter((trade) => trade.portfolioId === portfolioId)
        .map((trade) => ({ ...trade })),
      reversals: this.reversals
        .filter((reversal) => reversal.portfolioId === portfolioId)
        .map((reversal) => ({ ...reversal })),
    };
  }
}

/**
 * Catálogo e cotações em memória para a carteira (SPEC-014): os testes põem os ativos, a última
 * cotação do pregão e o último fechamento de cada um.
 */
export class FakePortfolioMarket implements PortfolioMarket {
  readonly assets = new Map<string, MarketAsset>();
  readonly quotes = new Map<string, MarketQuote>();
  readonly closes = new Map<string, { date: string; close: string }>();

  asset(assetId: string): Promise<MarketAsset | null> {
    return Promise.resolve(this.assets.get(assetId) ?? null);
  }

  latestQuote(assetId: string): Promise<MarketQuote | null> {
    return Promise.resolve(this.quotes.get(assetId) ?? null);
  }

  lastClose(assetId: string): Promise<{ date: string; close: string } | null> {
    return Promise.resolve(this.closes.get(assetId) ?? null);
  }
}

/** Carteiras em memória (SPEC-012), com a mesma regra de nome único do PostgreSQL. */
export class InMemoryPortfolioRepository implements PortfolioRepository {
  readonly portfolios = new Map<string, StoredPortfolio & { nameKey: string }>();
  readonly deletions: Array<{ portfolioId: string; type: string; entries: number; at: Date }> = [];

  /** SPECs 013 e 014: o livro das carteiras, para o aporte inicial e a contagem na exclusão. */
  constructor(readonly ledger = new InMemoryLedgerRepository()) {}

  listByUser(userId: string): Promise<StoredPortfolio[]> {
    return Promise.resolve(
      [...this.portfolios.values()]
        .filter((portfolio) => portfolio.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(({ nameKey: _key, ...portfolio }) => ({ ...portfolio })),
    );
  }

  countByUser(userId: string): Promise<number> {
    return Promise.resolve(
      [...this.portfolios.values()].filter((portfolio) => portfolio.userId === userId).length,
    );
  }

  findById(id: string): Promise<StoredPortfolio | null> {
    const found = this.portfolios.get(id);
    if (!found) return Promise.resolve(null);
    const { nameKey: _key, ...portfolio } = found;
    return Promise.resolve({ ...portfolio });
  }

  create(portfolio: NewStoredPortfolio): Promise<StoredPortfolio> {
    if (this.taken(portfolio.userId, portfolio.nameKey)) {
      return Promise.reject(new PortfolioNameInUseError());
    }
    const stored = {
      id: randomUUID(),
      userId: portfolio.userId,
      name: portfolio.name,
      nameKey: portfolio.nameKey,
      type: portfolio.type,
      startDate: portfolio.startDate,
      createdAt: portfolio.at,
      updatedAt: portfolio.at,
    };
    this.portfolios.set(stored.id, stored);
    if (portfolio.initialDeposit) this.ledger.add(stored.id, portfolio.initialDeposit);
    const { nameKey: _key, ...result } = stored;
    return Promise.resolve({ ...result });
  }

  rename(id: string, name: string, nameKey: string, at: Date): Promise<StoredPortfolio> {
    const current = this.portfolios.get(id);
    if (!current) return Promise.reject(new Error(`carteira ${id} não existe`));
    if (this.taken(current.userId, nameKey, id)) {
      return Promise.reject(new PortfolioNameInUseError());
    }
    const updated = { ...current, name, nameKey, updatedAt: at };
    this.portfolios.set(id, updated);
    const { nameKey: _key, ...result } = updated;
    return Promise.resolve({ ...result });
  }

  delete(id: string, at: Date): Promise<void> {
    const current = this.portfolios.get(id);
    if (current) {
      this.portfolios.delete(id);
      const entries = this.ledger.removePortfolio(id);
      this.deletions.push({ portfolioId: id, type: current.type, entries, at });
    }
    return Promise.resolve();
  }

  private taken(userId: string, nameKey: string, except?: string): boolean {
    return [...this.portfolios.values()].some(
      (portfolio) =>
        portfolio.userId === userId && portfolio.nameKey === nameKey && portfolio.id !== except,
    );
  }
}
