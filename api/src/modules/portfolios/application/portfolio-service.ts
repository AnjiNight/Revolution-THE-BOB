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
  type ReversalResult,
} from '@simulador/shared';
import {
  canSpend,
  cashLedger,
  compareMovements,
  toCents,
} from '../../financial-calculation/cash-ledger.js';
import { firstBreak, type CheckedMovement } from '../../financial-calculation/positions.js';
import {
  AlreadyReversedError,
  EntryNotFoundError,
  InsufficientCashError,
  PortfolioLimitReachedError,
  PortfolioValidationError,
  ReversalBreaksLedgerError,
  ReversalWindowClosedError,
} from '../domain/errors.js';
import {
  activeLedger,
  ledgerItems,
  ownedPortfolio,
  reversalTimes,
  type LedgerItem,
} from './ledger.js';
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
    const portfolio = await this.owned(userId, id);
    const full = await this.deps.ledger.ledger(id);
    // SPEC-015: o saldo (e o de cada linha) é o do livro sem os estornados; eles aparecem riscados.
    const reversed = reversalTimes(full);
    const active = cashLedger(ledgerItems(activeLedger(full)));
    const balanceAfter = new Map(active.lines.map((line) => [line.id, line.balanceAfter]));
    const newestFirst = ledgerItems(full).sort(compareMovements).reverse();
    const page = newestFirst.slice(offset, offset + CASH_PAGE_SIZE);
    const today = isoDateInBrasilia(this.clock());
    const tickers = await this.tickers(
      page.flatMap((item) => (item.kind === 'trade' ? [item.entry.assetId] : [])),
    );
    return {
      balance: active.balance,
      entries: page.map((item) =>
        toPublicEntry(item, tickers, {
          balanceAfter: balanceAfter.get(item.id) ?? null,
          reversedAt: reversed.get(item.id) ?? null,
          reversible: !reversed.has(item.id) && withinWindow(portfolio, item, today),
        }),
      ),
      hasMore: newestFirst.length > offset + CASH_PAGE_SIZE,
      total: newestFirst.length,
    };
  }

  /**
   * SPEC-015: estorna um aporte, retirada, compra ou venda. O estorno anula o original (RB28): só é
   * aceito se o livro sem ele continuar válido em todos os momentos; na carteira ao vivo, compra e
   * venda só no dia em que foram feitas. Tudo conferido com a carteira travada.
   */
  async reverse(userId: string, id: string, entryId: string): Promise<ReversalResult> {
    const portfolio = await this.owned(userId, id);
    const now = this.clock();
    const today = isoDateInBrasilia(now);
    // Os tickers, para dizer em qual negociação o livro quebraria (lidos antes da trava).
    const tickers = await this.tickers(
      (await this.deps.ledger.ledger(id)).trades.map((trade) => trade.assetId),
    );

    let reversedType: LedgerItem['type'] | null = null;
    const stored = await this.deps.ledger.appendReversalLocked(id, (current) => {
      const item = ledgerItems(current).find((candidate) => candidate.id === entryId);
      if (!item) throw new EntryNotFoundError();
      if (current.reversals.some((reversal) => reversal.entryId === entryId)) {
        throw new AlreadyReversedError();
      }
      if (!withinWindow(portfolio, item, today)) throw new ReversalWindowClosedError();
      const remaining = ledgerItems(activeLedger(current)).filter((other) => other.id !== entryId);
      const broken = firstBreak(remaining.map(toChecked));
      const at = broken && remaining.find((other) => other.id === broken.id);
      if (broken && at)
        throw new ReversalBreaksLedgerError(broken.reason, breakDetails(at, tickers));
      reversedType = item.type;
      return { entryId, entryKind: item.kind, recordedAt: now };
    });

    const after = activeLedger(await this.deps.ledger.ledger(id));
    return {
      reversal: {
        entryId,
        type: reversedType ?? 'deposit',
        reversedAt: stored.recordedAt.toISOString(),
      },
      cash: cashLedger(ledgerItems(after)).balance,
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
      // SPEC-015: estornados não contam, nem no saldo nem no "último lançamento" (RB25).
      const ledger = cashLedger(ledgerItems(activeLedger(current)));
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
        reversedAt: null,
        // Aporte e retirada se estornam a qualquer momento (RB28).
        reversible: true,
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
      const ledger = ledgers.get(portfolio.id) ?? { cash: [], trades: [], reversals: [] };
      const reversed = reversalTimes(ledger);
      const reversedAt = (entryId: string) => reversed.get(entryId)?.toISOString() ?? null;
      return {
        ...toPublic(portfolio),
        cashEntries: [...ledger.cash].sort(compareMovements).map((entry) => ({
          type: entry.type,
          amount: entry.amount,
          date: entry.date,
          recordedAt: entry.recordedAt.toISOString(),
          reversedAt: reversedAt(entry.id),
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
          reversedAt: reversedAt(trade.id),
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

function toPublicEntry(
  item: LedgerItem,
  tickers: Map<string, string>,
  state: { balanceAfter: string | null; reversedAt: Date | null; reversible: boolean },
): CashEntry {
  const base = {
    id: item.id,
    type: item.type,
    amount: item.amount,
    date: item.date,
    recordedAt: item.recordedAt.toISOString(),
    balanceAfter: state.balanceAfter,
    reversedAt: state.reversedAt?.toISOString() ?? null,
    reversible: state.reversible,
  };
  if (item.kind === 'cash') return base;
  return {
    ...base,
    trade: {
      assetId: item.entry.assetId,
      ticker: tickers.get(item.entry.assetId) ?? '',
      quantity: item.entry.quantity,
      price: item.entry.price,
    },
  };
}

/**
 * RB28: na carteira ao vivo, compra e venda só se estornam no dia em que foram feitas (o dia do
 * registro em Brasília); aporte e retirada, sempre; na histórica, sem prazo.
 */
function withinWindow(portfolio: StoredPortfolio, item: LedgerItem, today: IsoDate): boolean {
  return portfolio.type === 'historical' || item.kind === 'cash' || item.date === today;
}

/** O lançamento para a conferência do livro (com o ativo e a quantidade, se for negociação). */
function toChecked(item: LedgerItem): CheckedMovement {
  const base = {
    id: item.id,
    type: item.type,
    amount: item.amount,
    date: item.date,
    recordedAt: item.recordedAt,
  };
  return item.kind === 'trade'
    ? { ...base, assetId: item.entry.assetId, quantity: item.entry.quantity }
    : base;
}

/** O lançamento em que o livro quebraria, para a tela dizer qual estornar antes. */
function breakDetails(item: LedgerItem, tickers: Map<string, string>): Record<string, string> {
  return {
    entryId: item.id,
    type: item.type,
    date: item.date,
    amount: item.amount,
    ...(item.kind === 'trade'
      ? {
          ticker: tickers.get(item.entry.assetId) ?? '',
          quantity: String(item.entry.quantity),
        }
      : {}),
  };
}
