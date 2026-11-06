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
import {
  canSpend,
  cashLedger,
  compareMovements,
  toCents,
  type LedgerLine,
} from '../../financial-calculation/cash-ledger.js';
import {
  InsufficientCashError,
  PortfolioLimitReachedError,
  PortfolioValidationError,
} from '../domain/errors.js';
import { ledgerItems, ownedPortfolio, type LedgerItem } from './ledger.js';
import type {
  LedgerRepository,
  NewStoredCashEntry,
  PortfolioCalendar,
  PortfolioMarket,
  PortfolioRepository,
  StoredPortfolio,
} from './ports.js';

export interface PortfolioServiceDeps {
  portfolios: PortfolioRepository;
  /** SPECs 013 e 014: o livro-razão da carteira. */
  ledger: LedgerRepository;
  calendar: PortfolioCalendar;
  /** SPEC-014: o ticker das compras e vendas no extrato e na exportação. */
  market: Pick<PortfolioMarket, 'asset'>;
  clock?: () => Date;
}

/**
 * Carteiras de simulação (SPEC-012): cada usuário vê e mexe só nas próprias (RB02, RB03). O tipo
 * e a data de início não mudam depois da criação (RB24). SPEC-013: o caixa de cada carteira é a
 * conta dos lançamentos (RB09), que nunca são alterados nem apagados (RB08); desde a SPEC-014,
 * as compras e vendas entram na mesma conta.
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
   * cada lançamento, `CASH_PAGE_SIZE` por vez a partir de `offset`. Desde a SPEC-014, com as
   * compras e vendas.
   */
  async statement(userId: string, id: string, offset = 0): Promise<CashStatement> {
    await this.owned(userId, id);
    const ledger = cashLedger(ledgerItems(await this.deps.ledger.ledger(id)));
    const newestFirst = [...ledger.lines].reverse();
    const page = newestFirst.slice(offset, offset + CASH_PAGE_SIZE);
    const tickers = await this.tickers(
      page.flatMap((line) => (line.kind === 'trade' ? [line.entry.assetId] : [])),
    );
    return {
      balance: ledger.balance,
      entries: page.map((line) => toPublicEntry(line, tickers)),
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
    const stored = await this.deps.ledger.appendCashLocked(id, (current): NewStoredCashEntry => {
      const ledger = cashLedger(ledgerItems(current));
      const last = ledger.lines.at(-1);
      if (last && date < last.date) {
        throw new PortfolioValidationError({ date: 'before_last_entry' });
      }
      if (input.type === 'withdrawal' && !canSpend(ledger.balance, input.amount)) {
        throw new InsufficientCashError(ledger.balance);
      }
      const change = toCents(input.amount) * (input.type === 'deposit' ? 1n : -1n);
      balance = centsToAmount(toCents(ledger.balance) + change);
      return { type: input.type, amount: input.amount, date, recordedAt: now };
    });
    // O novo é sempre o último do livro (data igual ou depois da última, registrado agora).
    return {
      entry: {
        id: stored.id,
        type: stored.type,
        amount: stored.amount,
        date: stored.date,
        recordedAt: stored.recordedAt.toISOString(),
        balanceAfter: balance,
      },
      balance,
    };
  }

  /**
   * SPEC-034: a seção `portfolios` do arquivo "Baixar meus dados", com os aportes e retiradas
   * (SPEC-013) e as compras e vendas (SPEC-014) de cada carteira, na ordem do livro-razão.
   */
  async exportForUser(userId: string): Promise<PersonalDataExport['portfolios']> {
    const portfolios = await this.deps.portfolios.listByUser(userId);
    const ledgers = await this.deps.ledger.ledgers(portfolios.map((p) => p.id));
    const tickers = await this.tickers(
      [...ledgers.values()].flatMap((ledger) => ledger.trades.map((trade) => trade.assetId)),
    );
    return portfolios.map((portfolio) => {
      const ledger = ledgers.get(portfolio.id) ?? { cash: [], trades: [] };
      return {
        ...toPublic(portfolio),
        cashEntries: [...ledger.cash].sort(compareMovements).map((entry) => ({
          type: entry.type,
          amount: entry.amount,
          date: entry.date,
          recordedAt: entry.recordedAt.toISOString(),
        })),
        trades: [...ledger.trades].sort(compareMovements).map((trade) => ({
          type: trade.type,
          ticker: tickers.get(trade.assetId) ?? '',
          quantity: trade.quantity,
          price: trade.price,
          total: trade.total,
          date: trade.date,
          recordedAt: trade.recordedAt.toISOString(),
          quotedAt: trade.quotedAt.toISOString(),
          level: trade.level,
        })),
      };
    });
  }

  /** O ticker atual de cada ativo (o ticker pode mudar no catálogo, SPEC-006). */
  private async tickers(assetIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(assetIds)];
    const assets = await Promise.all(unique.map((id) => this.deps.market.asset(id)));
    return new Map(unique.map((id, index) => [id, assets[index]?.ticker ?? '']));
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

  private owned(userId: string, id: string): Promise<StoredPortfolio> {
    return ownedPortfolio(this.deps.portfolios, userId, id);
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

function toPublicEntry(line: LedgerLine<LedgerItem>, tickers: Map<string, string>): CashEntry {
  const base = {
    id: line.id,
    type: line.type,
    amount: line.amount,
    date: line.date,
    recordedAt: line.recordedAt.toISOString(),
    balanceAfter: line.balanceAfter,
  };
  if (line.kind === 'cash') return base;
  return {
    ...base,
    trade: {
      assetId: line.entry.assetId,
      ticker: tickers.get(line.entry.assetId) ?? '',
      quantity: line.entry.quantity,
      price: line.entry.price,
    },
  };
}
