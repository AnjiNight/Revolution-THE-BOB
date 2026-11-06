import { randomUUID } from 'node:crypto';
import type {
  CashEntryRepository,
  NewStoredCashEntry,
  NewStoredPortfolio,
  PortfolioRepository,
  StoredCashEntry,
  StoredPortfolio,
} from '../application/ports.js';
import { PortfolioNameInUseError } from '../domain/errors.js';

/**
 * Livro-razão do caixa em memória (SPEC-013). A trava é uma fila por carteira: cada `appendLocked`
 * espera o anterior da mesma carteira terminar, como o SELECT … FOR UPDATE do PostgreSQL.
 */
export class InMemoryCashEntryRepository implements CashEntryRepository {
  readonly entries: StoredCashEntry[] = [];
  private readonly locks = new Map<string, Promise<unknown>>();

  listByPortfolio(portfolioId: string): Promise<StoredCashEntry[]> {
    return Promise.resolve(this.of(portfolioId));
  }

  listByPortfolios(portfolioIds: readonly string[]): Promise<Map<string, StoredCashEntry[]>> {
    return Promise.resolve(new Map(portfolioIds.map((id) => [id, this.of(id)])));
  }

  appendLocked(
    portfolioId: string,
    decide: (current: StoredCashEntry[]) => NewStoredCashEntry,
  ): Promise<StoredCashEntry> {
    const previous = this.locks.get(portfolioId) ?? Promise.resolve();
    const next = previous.then(async () => {
      // Um ciclo de espera entre ler e gravar: sem a fila, dois pedidos leriam o mesmo saldo.
      const current = this.of(portfolioId);
      await new Promise((resolve) => setImmediate(resolve));
      return this.add(portfolioId, decide(current));
    });
    this.locks.set(
      portfolioId,
      next.catch(() => undefined),
    );
    return next;
  }

  /** A carteira nova grava o aporte inicial por aqui (mesma "transação" do repositório). */
  add(portfolioId: string, entry: NewStoredCashEntry): StoredCashEntry {
    const stored = { id: randomUUID(), portfolioId, ...entry };
    this.entries.push(stored);
    return { ...stored };
  }

  removePortfolio(portfolioId: string): number {
    const before = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (this.entries[i]?.portfolioId === portfolioId) this.entries.splice(i, 1);
    }
    return before - this.entries.length;
  }

  private of(portfolioId: string): StoredCashEntry[] {
    return this.entries
      .filter((entry) => entry.portfolioId === portfolioId)
      .map((entry) => ({ ...entry }));
  }
}

/** Carteiras em memória (SPEC-012), com a mesma regra de nome único do PostgreSQL. */
export class InMemoryPortfolioRepository implements PortfolioRepository {
  readonly portfolios = new Map<string, StoredPortfolio & { nameKey: string }>();
  readonly deletions: Array<{ portfolioId: string; type: string; entries: number; at: Date }> = [];

  /** SPEC-013: o caixa das carteiras, para o aporte inicial e a contagem na exclusão. */
  constructor(readonly cash = new InMemoryCashEntryRepository()) {}

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
    if (portfolio.initialDeposit) this.cash.add(stored.id, portfolio.initialDeposit);
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
      const entries = this.cash.removePortfolio(id);
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
