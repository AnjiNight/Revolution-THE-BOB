import {
  CASH_PAGE_SIZE,
  centsToAmount,
  isoDateInBrasilia,
  PORTFOLIO_LIMIT,
  portfolioNameKey,
  yearOf,
  type CashEntry,
  type CashEntryResult,
  type CashStatement,
  type IsoDate,
  type NewCashEntryInput,
  type NewPortfolioInput,
  type PersonalDataExport,
  type Portfolio,
  type PortfolioList,
} from '@simulador/shared';
import { canWithdraw, cashLedger, toCents } from '../../financial-calculation/cash-ledger.js';
import {
  InsufficientCashError,
  PortfolioLimitReachedError,
  PortfolioNotFoundError,
  PortfolioValidationError,
} from '../domain/errors.js';
import type {
  CashEntryRepository,
  NewStoredCashEntry,
  PortfolioCalendar,
  PortfolioRepository,
  StoredCashEntry,
  StoredPortfolio,
} from './ports.js';

export interface PortfolioServiceDeps {
  portfolios: PortfolioRepository;
  /** SPEC-013: o livro-razão do caixa. */
  cash: CashEntryRepository;
  calendar: PortfolioCalendar;
  clock?: () => Date;
}

/**
 * Carteiras de simulação (SPEC-012): cada usuário vê e mexe só nas próprias (RB02, RB03). O tipo
 * e a data de início não mudam depois da criação (RB24). SPEC-013: o caixa de cada carteira é a
 * conta dos aportes e retiradas (RB09), que nunca são alterados nem apagados (RB08).
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
   * último pregão antes de hoje (a validação compartilhada já recusou antes de 2016). Com "Valor
   * inicial" (SPEC-013), o primeiro aporte é gravado junto: na ao vivo, agora; na histórica, na
   * data de início.
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
      if (!(await this.isTradingDay(startDate))) {
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
      ...(input.initialAmount
        ? {
            initialDeposit: {
              type: 'deposit' as const,
              amount: input.initialAmount,
              date: startDate,
              recordedAt: now,
            },
          }
        : {}),
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

  /**
   * SPEC-013 §4.2: saldo atual e o extrato do mais recente ao mais antigo, com o saldo depois de
   * cada lançamento, `CASH_PAGE_SIZE` por vez a partir de `offset`.
   */
  async statement(userId: string, id: string, offset = 0): Promise<CashStatement> {
    await this.owned(userId, id);
    const ledger = cashLedger(await this.deps.cash.listByPortfolio(id));
    const newestFirst = [...ledger.lines].reverse();
    return {
      balance: ledger.balance,
      entries: newestFirst.slice(offset, offset + CASH_PAGE_SIZE).map(toPublicEntry),
      hasMore: newestFirst.length > offset + CASH_PAGE_SIZE,
      total: newestFirst.length,
    };
  }

  /**
   * Aporte ou retirada (SPEC-013 §4.1). Ao vivo: no momento atual, em qualquer dia (a data não pode
   * ser enviada). Histórica: num dia de pregão escolhido, não antes do início da carteira nem do
   * último lançamento (RB25) e antes de hoje (RB12). A retirada nunca passa do saldo (RB26).
   */
  async addCashEntry(
    userId: string,
    id: string,
    input: NewCashEntryInput,
  ): Promise<CashEntryResult> {
    const portfolio = await this.owned(userId, id);
    const now = this.clock();
    const date = await this.entryDate(portfolio, input.date, isoDateInBrasilia(now));

    let balance = '0.00';
    const stored = await this.deps.cash.appendLocked(id, (current): NewStoredCashEntry => {
      const ledger = cashLedger(current);
      const last = ledger.lines.at(-1);
      if (last && date < last.date) {
        throw new PortfolioValidationError({ date: 'before_last_entry' });
      }
      if (input.type === 'withdrawal' && !canWithdraw(ledger.balance, input.amount)) {
        throw new InsufficientCashError(ledger.balance);
      }
      const change = toCents(input.amount) * (input.type === 'deposit' ? 1n : -1n);
      balance = centsToAmount(toCents(ledger.balance) + change);
      return { type: input.type, amount: input.amount, date, recordedAt: now };
    });
    // O novo é sempre o último do livro (data igual ou depois da última, registrado agora).
    return { entry: toPublicEntry({ ...stored, balanceAfter: balance }), balance };
  }

  /**
   * SPEC-034: a seção `portfolios` do arquivo "Baixar meus dados", com os aportes e retiradas de
   * cada carteira na ordem do livro-razão (SPEC-013).
   */
  async exportForUser(userId: string): Promise<PersonalDataExport['portfolios']> {
    const portfolios = await this.deps.portfolios.listByUser(userId);
    const entries = await this.deps.cash.listByPortfolios(portfolios.map((p) => p.id));
    return portfolios.map((portfolio) => ({
      ...toPublic(portfolio),
      cashEntries: cashLedger(entries.get(portfolio.id) ?? []).lines.map((line) => ({
        type: line.type,
        amount: line.amount,
        date: line.date,
        recordedAt: line.recordedAt.toISOString(),
      })),
    }));
  }

  /** O dia do lançamento, conferido contra o tipo da carteira e o calendário (antes da trava). */
  private async entryDate(
    portfolio: StoredPortfolio,
    requested: IsoDate | undefined,
    today: IsoDate,
  ): Promise<IsoDate> {
    if (portfolio.type === 'live') {
      // DA17: na ao vivo, o momento é o do servidor.
      if (requested !== undefined) throw new PortfolioValidationError({ date: 'not_allowed' });
      return today;
    }
    if (requested === undefined) throw new PortfolioValidationError({ date: 'required' });
    if (requested < portfolio.startDate) {
      throw new PortfolioValidationError({ date: 'before_start' });
    }
    if (requested >= today) throw new PortfolioValidationError({ date: 'future' });
    if (!(await this.isTradingDay(requested))) {
      throw new PortfolioValidationError({ date: 'not_trading_day' });
    }
    return requested;
  }

  /** Lança CalendarNotPublishedError se o ano não tiver calendário publicado. */
  private async isTradingDay(date: IsoDate): Promise<boolean> {
    const calendar = await this.deps.calendar.tradingCalendar(yearOf(date), yearOf(date));
    return calendar.isTradingDay(date);
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

function toPublicEntry(entry: StoredCashEntry & { balanceAfter: string }): CashEntry {
  return {
    id: entry.id,
    type: entry.type,
    amount: entry.amount,
    date: entry.date,
    recordedAt: entry.recordedAt.toISOString(),
    balanceAfter: entry.balanceAfter,
  };
}
