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
  type IncomeDetail,
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
import {
  firstTimelineBreak,
  type DerivedMovement,
  type IncomeCredit,
} from '../../financial-calculation/corporate-actions.js';
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
  cashMovements,
  corporateData,
  ledgerItems,
  ledgerTimeline,
  ownedPortfolio,
  reversalTimes,
  type LedgerItem,
} from './ledger.js';
import type {
  LedgerRepository,
  NewStoredCashEntry,
  PortfolioCalendar,
  PortfolioLedger,
  PortfolioMarket,
  PortfolioRepository,
  StoredPortfolio,
} from './ports.js';

export interface PortfolioServiceDeps {
  portfolios: PortfolioRepository;
  /** SPECs 013 e 014: o livro-razão da carteira. */
  ledger: LedgerRepository;
  calendar: PortfolioCalendar;
  /**
   * SPEC-014: o ticker das compras e vendas no extrato e na exportação. SPEC-043: os proventos e
   * eventos, para o saldo e a conferência do livro.
   */
  market: Pick<PortfolioMarket, 'asset' | 'corporateEvents' | 'income' | 'incomeEnabled'>;
  clock?: () => Date;
}

/** Uma linha do extrato: lançamento do usuário ou provento e fração da SPEC-043. */
type StatementItem = LedgerItem | DerivedMovement;

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
    const today = isoDateInBrasilia(this.clock());
    // SPEC-015: o saldo (e o de cada linha) é o do livro sem os estornados; eles aparecem riscados.
    // SPEC-043: com os proventos pagos e as frações vendidas, que não se estornam.
    const reversed = reversalTimes(full);
    const active = activeLedger(full);
    const line = ledgerTimeline(active, await corporateData(this.deps.market, full), today);
    const book = cashLedger(cashMovements(active, line));
    const balanceAfter = new Map(book.lines.map((entry) => [entry.id, entry.balanceAfter]));
    const newestFirst: StatementItem[] = [...ledgerItems(full), ...line.movements]
      .sort(compareMovements)
      .reverse();
    const page = newestFirst.slice(offset, offset + CASH_PAGE_SIZE);
    const tickers = await this.tickers([
      ...page.map(itemAssetId).filter((assetId): assetId is string => assetId !== null),
      ...line.pending.map((credit) => credit.assetId),
    ]);
    return {
      balance: book.balance,
      entries: page.map((item) =>
        item.kind === 'income' || item.kind === 'fraction'
          ? toDerivedEntry(item, tickers, balanceAfter.get(item.id) ?? null)
          : toPublicEntry(item, tickers, {
              balanceAfter: balanceAfter.get(item.id) ?? null,
              reversedAt: reversed.get(item.id) ?? null,
              reversible: !reversed.has(item.id) && withinWindow(portfolio, item, today),
            }),
      ),
      hasMore: newestFirst.length > offset + CASH_PAGE_SIZE,
      total: newestFirst.length,
      pendingIncome: line.pending.map((credit) => incomeDetail(credit, tickers)),
      incomeEnabled: this.deps.market.incomeEnabled,
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
    const before = await this.deps.ledger.ledger(id);
    const tickers = await this.tickers(before.trades.map((trade) => trade.assetId));
    // SPEC-043: proventos e eventos lidos antes da trava; a conferência conta com eles.
    const data = await corporateData(this.deps.market, before);

    let reversedType: LedgerItem['type'] | null = null;
    const stored = await this.deps.ledger.appendReversalLocked(id, (current) => {
      const item = ledgerItems(current).find((candidate) => candidate.id === entryId);
      if (!item) throw new EntryNotFoundError();
      if (current.reversals.some((reversal) => reversal.entryId === entryId)) {
        throw new AlreadyReversedError();
      }
      if (!withinWindow(portfolio, item, today)) throw new ReversalWindowClosedError();
      const active = activeLedger(current);
      const remaining: PortfolioLedger = {
        cash: active.cash.filter((entry) => entry.id !== entryId),
        trades: active.trades.filter((trade) => trade.id !== entryId),
        reversals: [],
      };
      const line = ledgerTimeline(remaining, data, today);
      const broken = firstTimelineBreak(cashMovements(remaining, line), line.oversold);
      if (broken) {
        const at = ledgerItems(remaining).find((other) => other.id === broken.id);
        throw new ReversalBreaksLedgerError(
          broken.reason,
          at ? breakDetails(at, tickers) : { entryId: broken.id },
        );
      }
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
      cash: cashLedger(cashMovements(after, ledgerTimeline(after, data, today))).balance,
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
    // SPEC-043: proventos e eventos lidos antes da trava.
    const data = await corporateData(this.deps.market, await this.deps.ledger.ledger(id));

    let balance = '0.00';
    const stored = await this.deps.ledger.appendCashLocked(id, (current): NewStoredCashEntry => {
      // SPEC-015: estornados não contam, nem no saldo nem no "último lançamento" (RB25).
      const active = activeLedger(current);
      const last = ledgerItems(active)
        .map((item) => item.date)
        .sort()
        .at(-1);
      if (last && date < last) {
        throw new PortfolioValidationError({ date: 'before_last_entry' });
      }
      // SPEC-043: o saldo na data, com os proventos pagos até ela.
      const ledger = cashLedger(cashMovements(active, ledgerTimeline(active, data, date)));
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
          // SPEC-016: na histórica, sem horário nem nível (fechamento da B3 do dia).
          quotedAt: trade.quotedAt?.toISOString() ?? null,
          level: trade.level,
          source: trade.source,
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

function itemAssetId(item: StatementItem): string | null {
  if (item.kind === 'trade') return item.entry.assetId;
  if (item.kind === 'income') return item.income.assetId;
  if (item.kind === 'fraction') return item.fraction.assetId;
  return null;
}

function incomeDetail(credit: IncomeCredit, tickers: Map<string, string>): IncomeDetail {
  return {
    assetId: credit.assetId,
    ticker: tickers.get(credit.assetId) ?? '',
    kind: credit.kind,
    quantity: credit.quantity,
    perShare: credit.perShare,
    gross: credit.gross,
    tax: credit.tax,
    net: credit.net,
    exDate: credit.exDate,
    paymentDate: credit.paymentDate,
    source: 'investidor10',
  };
}

/**
 * SPEC-043: provento pago ou fração vendida no extrato. Não se estornam (vêm dos dados da
 * SPEC-042); o horário é a meia-noite de Brasília do dia, porque não houve registro.
 */
function toDerivedEntry(
  item: DerivedMovement,
  tickers: Map<string, string>,
  balanceAfter: string | null,
): CashEntry {
  const base = {
    id: item.id,
    type: 'income' as const,
    amount: item.amount,
    date: item.date,
    recordedAt: `${item.date}T03:00:00.000Z`,
    balanceAfter,
    reversedAt: null,
    reversible: false,
  };
  if (item.kind === 'income') return { ...base, income: incomeDetail(item.income, tickers) };
  return {
    ...base,
    fraction: {
      assetId: item.fraction.assetId,
      ticker: tickers.get(item.fraction.assetId) ?? '',
      shares: item.fraction.shares,
      price: item.fraction.price,
    },
  };
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
