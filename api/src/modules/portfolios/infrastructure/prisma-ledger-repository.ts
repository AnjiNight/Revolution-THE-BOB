import type { CashEntryType, IsoDate, QuoteLevelCode } from '@simulador/shared';
import type {
  Estorno,
  LancamentoCaixa,
  NivelCotacao,
  Prisma,
  PrismaClient,
  TipoLancamentoCaixa,
  Transacao,
} from '../../../generated/prisma/client.js';
import type {
  LedgerRepository,
  NewStoredCashEntry,
  NewStoredReversal,
  NewStoredTrade,
  PortfolioLedger,
  StoredCashEntry,
  StoredReversal,
  StoredTrade,
} from '../application/ports.js';
import { PortfolioNotFoundError } from '../domain/errors.js';

const TYPE_TO_TIPO: Record<CashEntryType, TipoLancamentoCaixa> = {
  deposit: 'aporte',
  withdrawal: 'retirada',
};

const LEVEL_TO_NIVEL: Record<QuoteLevelCode, NivelCotacao> = {
  free: 'gratuito',
  subscriber: 'assinante',
};

function isoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toStoredCashEntry(row: LancamentoCaixa): StoredCashEntry {
  return {
    id: row.id,
    portfolioId: row.carteiraId,
    type: row.tipo === 'retirada' ? 'withdrawal' : 'deposit',
    amount: row.valor.toFixed(2),
    date: isoDate(row.data),
    recordedAt: row.registradoEm,
  };
}

export function toStoredTrade(row: Transacao): StoredTrade {
  return {
    id: row.id,
    portfolioId: row.carteiraId,
    assetId: row.ativoId,
    type: row.tipo === 'venda' ? 'sell' : 'buy',
    quantity: row.quantidade,
    price: row.precoUnitario.toFixed(2),
    total: row.valorTotal.toFixed(2),
    date: isoDate(row.data),
    recordedAt: row.registradoEm,
    // SPEC-016: a negociação da histórica não tem horário nem nível (fechamento da B3 do dia).
    quotedAt: row.cotacaoEm,
    level:
      row.nivelCotacao === null ? null : row.nivelCotacao === 'assinante' ? 'subscriber' : 'free',
    source: row.fonteCotacao === 'b3_cotahist' ? 'b3' : 'brapi',
  };
}

/** Colunas de um lançamento novo, para `create` e para a criação aninhada na carteira. */
export function cashEntryData(entry: NewStoredCashEntry) {
  return {
    tipo: TYPE_TO_TIPO[entry.type],
    valor: entry.amount,
    data: fromIsoDate(entry.date),
    registradoEm: entry.recordedAt,
  };
}

function tradeData(portfolioId: string, trade: NewStoredTrade) {
  return {
    carteiraId: portfolioId,
    ativoId: trade.assetId,
    tipo: trade.type === 'sell' ? ('venda' as const) : ('compra' as const),
    quantidade: trade.quantity,
    precoUnitario: trade.price,
    valorTotal: trade.total,
    data: fromIsoDate(trade.date),
    registradoEm: trade.recordedAt,
    cotacaoEm: trade.quotedAt,
    nivelCotacao: trade.level === null ? null : LEVEL_TO_NIVEL[trade.level],
    fonteCotacao: trade.source === 'b3' ? ('b3_cotahist' as const) : ('brapi' as const),
  };
}

/**
 * Trava a linha da carteira até o fim da transação. Sem linha, a carteira foi apagada enquanto o
 * pedido chegava: responde como carteira inexistente.
 */
export async function lockPortfolio(tx: Prisma.TransactionClient, portfolioId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "carteira" WHERE "id" = ${portfolioId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new PortfolioNotFoundError();
}

async function readLedger(
  client: Prisma.TransactionClient | PrismaClient,
  portfolioId: string,
): Promise<PortfolioLedger> {
  const where = { carteiraId: portfolioId };
  const [cash, trades, reversals] = await Promise.all([
    client.lancamentoCaixa.findMany({ where }),
    client.transacao.findMany({ where }),
    client.estorno.findMany({ where }),
  ]);
  return {
    cash: cash.map(toStoredCashEntry),
    trades: trades.map(toStoredTrade),
    reversals: reversals.map(toStoredReversal),
  };
}

export function toStoredReversal(row: Estorno): StoredReversal {
  return {
    id: row.id,
    portfolioId: row.carteiraId,
    entryId: (row.lancamentoCaixaId ?? row.transacaoId) as string,
    entryKind: row.lancamentoCaixaId ? 'cash' : 'trade',
    recordedAt: row.registradoEm,
  };
}

/**
 * Livro-razão da carteira (SPECs 013, 014 e 015) no PostgreSQL. Só inclui: o banco recusa alteração
 * (RB08, gatilhos nas duas tabelas).
 */
export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  ledger(portfolioId: string): Promise<PortfolioLedger> {
    return readLedger(this.prisma, portfolioId);
  }

  async ledgers(portfolioIds: readonly string[]): Promise<Map<string, PortfolioLedger>> {
    const result = new Map<string, PortfolioLedger>(
      portfolioIds.map((id) => [id, { cash: [], trades: [], reversals: [] }]),
    );
    if (portfolioIds.length === 0) return result;
    const where = { carteiraId: { in: [...portfolioIds] } };
    const [cash, trades, reversals] = await Promise.all([
      this.prisma.lancamentoCaixa.findMany({ where }),
      this.prisma.transacao.findMany({ where }),
      this.prisma.estorno.findMany({ where }),
    ]);
    for (const row of cash) result.get(row.carteiraId)?.cash.push(toStoredCashEntry(row));
    for (const row of trades) result.get(row.carteiraId)?.trades.push(toStoredTrade(row));
    for (const row of reversals) {
      result.get(row.carteiraId)?.reversals.push(toStoredReversal(row));
    }
    return result;
  }

  appendCashLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredCashEntry,
  ): Promise<StoredCashEntry> {
    return this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, portfolioId);
      const entry = decide(await readLedger(tx, portfolioId));
      const row = await tx.lancamentoCaixa.create({
        data: { carteiraId: portfolioId, ...cashEntryData(entry) },
      });
      return toStoredCashEntry(row);
    });
  }

  appendTradeLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredTrade,
  ): Promise<StoredTrade> {
    return this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, portfolioId);
      const trade = decide(await readLedger(tx, portfolioId));
      const row = await tx.transacao.create({ data: tradeData(portfolioId, trade) });
      return toStoredTrade(row);
    });
  }

  appendReversalLocked(
    portfolioId: string,
    decide: (current: PortfolioLedger) => NewStoredReversal,
  ): Promise<StoredReversal> {
    return this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, portfolioId);
      const reversal = decide(await readLedger(tx, portfolioId));
      const row = await tx.estorno.create({
        data: {
          carteiraId: portfolioId,
          ...(reversal.entryKind === 'cash'
            ? { lancamentoCaixaId: reversal.entryId }
            : { transacaoId: reversal.entryId }),
          registradoEm: reversal.recordedAt,
        },
      });
      return toStoredReversal(row);
    });
  }
}
