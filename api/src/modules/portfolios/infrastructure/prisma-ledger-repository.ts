import type { CashEntryType, IsoDate, QuoteLevelCode } from '@simulador/shared';
import type {
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
  NewStoredTrade,
  PortfolioLedger,
  StoredCashEntry,
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
    quotedAt: row.cotacaoEm,
    level: row.nivelCotacao === 'assinante' ? 'subscriber' : 'free',
    source: 'brapi',
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
    nivelCotacao: LEVEL_TO_NIVEL[trade.level],
    fonteCotacao: trade.source,
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
  const [cash, trades] = await Promise.all([
    client.lancamentoCaixa.findMany({ where: { carteiraId: portfolioId } }),
    client.transacao.findMany({ where: { carteiraId: portfolioId } }),
  ]);
  return { cash: cash.map(toStoredCashEntry), trades: trades.map(toStoredTrade) };
}

/**
 * Livro-razão da carteira (SPECs 013 e 014) no PostgreSQL. Só inclui: o banco recusa alteração
 * (RB08, gatilhos nas duas tabelas).
 */
export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  ledger(portfolioId: string): Promise<PortfolioLedger> {
    return readLedger(this.prisma, portfolioId);
  }

  async ledgers(portfolioIds: readonly string[]): Promise<Map<string, PortfolioLedger>> {
    const result = new Map<string, PortfolioLedger>(
      portfolioIds.map((id) => [id, { cash: [], trades: [] }]),
    );
    if (portfolioIds.length === 0) return result;
    const where = { carteiraId: { in: [...portfolioIds] } };
    const [cash, trades] = await Promise.all([
      this.prisma.lancamentoCaixa.findMany({ where }),
      this.prisma.transacao.findMany({ where }),
    ]);
    for (const row of cash) result.get(row.carteiraId)?.cash.push(toStoredCashEntry(row));
    for (const row of trades) result.get(row.carteiraId)?.trades.push(toStoredTrade(row));
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
}
