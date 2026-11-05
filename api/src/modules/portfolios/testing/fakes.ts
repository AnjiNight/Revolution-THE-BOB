import { randomUUID } from 'node:crypto';
import type {
  NewStoredPortfolio,
  PortfolioRepository,
  StoredPortfolio,
} from '../application/ports.js';
import { PortfolioNameInUseError } from '../domain/errors.js';

/** Carteiras em memória (SPEC-012), com a mesma regra de nome único do PostgreSQL. */
export class InMemoryPortfolioRepository implements PortfolioRepository {
  readonly portfolios = new Map<string, StoredPortfolio & { nameKey: string }>();
  readonly deletions: Array<{ portfolioId: string; type: string; entries: number; at: Date }> = [];

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
      this.deletions.push({ portfolioId: id, type: current.type, entries: 0, at });
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
