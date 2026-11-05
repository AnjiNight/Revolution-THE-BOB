import {
  isoDateInBrasilia,
  PORTFOLIO_LIMIT,
  portfolioNameKey,
  yearOf,
  type NewPortfolioInput,
  type PersonalDataExport,
  type Portfolio,
  type PortfolioList,
} from '@simulador/shared';
import {
  PortfolioLimitReachedError,
  PortfolioNotFoundError,
  PortfolioValidationError,
} from '../domain/errors.js';
import type { PortfolioCalendar, PortfolioRepository, StoredPortfolio } from './ports.js';

export interface PortfolioServiceDeps {
  portfolios: PortfolioRepository;
  calendar: PortfolioCalendar;
  clock?: () => Date;
}

/**
 * Carteiras de simulação (SPEC-012): cada usuário vê e mexe só nas próprias (RB02, RB03). O tipo
 * e a data de início não mudam depois da criação (RB24).
 */
export class PortfolioService {
  private readonly clock: () => Date;

  constructor(private readonly deps: PortfolioServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async list(userId: string): Promise<PortfolioList> {
    const portfolios = await this.deps.portfolios.listByUser(userId);
    return { portfolios: portfolios.map(toPublic), limit: PORTFOLIO_LIMIT };
  }

  async get(userId: string, id: string): Promise<Portfolio> {
    return toPublic(await this.owned(userId, id));
  }

  /**
   * Ao vivo: começa hoje, no horário de Brasília. Histórica: um dia de pregão de 04/01/2016 até o
   * último pregão antes de hoje (a validação compartilhada já recusou antes de 2016).
   */
  async create(userId: string, input: NewPortfolioInput): Promise<Portfolio> {
    if ((await this.deps.portfolios.countByUser(userId)) >= PORTFOLIO_LIMIT) {
      throw new PortfolioLimitReachedError();
    }
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    let startDate = today;
    if (input.type === 'historical') {
      startDate = input.startDate as string;
      // Hoje ainda não tem fechamento da B3: não serve de início.
      if (startDate >= today) throw new PortfolioValidationError({ startDate: 'future' });
      const calendar = await this.deps.calendar.tradingCalendar(
        yearOf(startDate),
        yearOf(startDate),
      );
      if (!calendar.isTradingDay(startDate)) {
        throw new PortfolioValidationError({ startDate: 'not_trading_day' });
      }
    }
    const created = await this.deps.portfolios.create({
      userId,
      name: input.name,
      nameKey: portfolioNameKey(input.name),
      type: input.type,
      startDate,
      at: now,
    });
    return toPublic(created);
  }

  /** O mesmo nome (já limpo) não grava nada. */
  async rename(userId: string, id: string, name: string): Promise<Portfolio> {
    const portfolio = await this.owned(userId, id);
    if (portfolio.name === name) return toPublic(portfolio);
    return toPublic(
      await this.deps.portfolios.rename(id, name, portfolioNameKey(name), this.clock()),
    );
  }

  /** Exclusão definitiva (OPEN-15), com o registro sem dado pessoal. */
  async delete(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.deps.portfolios.delete(id, this.clock());
  }

  /** SPEC-034: a seção `portfolios` do arquivo "Baixar meus dados". */
  async exportForUser(userId: string): Promise<PersonalDataExport['portfolios']> {
    return (await this.deps.portfolios.listByUser(userId)).map(toPublic);
  }

  private async owned(userId: string, id: string): Promise<StoredPortfolio> {
    const portfolio = await this.deps.portfolios.findById(id);
    if (!portfolio) throw new PortfolioNotFoundError();
    if (portfolio.userId !== userId) throw new PortfolioNotFoundError(true);
    return portfolio;
  }
}

function toPublic(portfolio: StoredPortfolio): Portfolio {
  return {
    id: portfolio.id,
    name: portfolio.name,
    type: portfolio.type,
    startDate: portfolio.startDate,
    createdAt: portfolio.createdAt.toISOString(),
    updatedAt: portfolio.updatedAt.toISOString(),
  };
}
