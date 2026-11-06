import type { CashEntryType, IsoDate } from '@simulador/shared';
import type {
  LancamentoCaixa,
  Prisma,
  PrismaClient,
  TipoLancamentoCaixa,
} from '../../../generated/prisma/client.js';
import type {
  CashEntryRepository,
  NewStoredCashEntry,
  StoredCashEntry,
} from '../application/ports.js';
import { PortfolioNotFoundError } from '../domain/errors.js';

const TYPE_TO_TIPO: Record<CashEntryType, TipoLancamentoCaixa> = {
  deposit: 'aporte',
  withdrawal: 'retirada',
};

export function toStoredCashEntry(row: LancamentoCaixa): StoredCashEntry {
  return {
    id: row.id,
    portfolioId: row.carteiraId,
    type: row.tipo === 'retirada' ? 'withdrawal' : 'deposit',
    amount: row.valor.toFixed(2),
    date: row.data.toISOString().slice(0, 10),
    recordedAt: row.registradoEm,
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

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
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

/** Livro-razão do caixa (SPEC-013) no PostgreSQL. Só inclui: o banco recusa alteração (RB08). */
export class PrismaCashEntryRepository implements CashEntryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByPortfolio(portfolioId: string): Promise<StoredCashEntry[]> {
    const rows = await this.prisma.lancamentoCaixa.findMany({
      where: { carteiraId: portfolioId },
      orderBy: [{ data: 'asc' }, { registradoEm: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStoredCashEntry);
  }

  async listByPortfolios(portfolioIds: readonly string[]): Promise<Map<string, StoredCashEntry[]>> {
    const result = new Map<string, StoredCashEntry[]>(portfolioIds.map((id) => [id, []]));
    if (portfolioIds.length === 0) return result;
    const rows = await this.prisma.lancamentoCaixa.findMany({
      where: { carteiraId: { in: [...portfolioIds] } },
      orderBy: [{ data: 'asc' }, { registradoEm: 'asc' }, { id: 'asc' }],
    });
    for (const row of rows) result.get(row.carteiraId)?.push(toStoredCashEntry(row));
    return result;
  }

  appendLocked(
    portfolioId: string,
    decide: (current: StoredCashEntry[]) => NewStoredCashEntry,
  ): Promise<StoredCashEntry> {
    return this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, portfolioId);
      const rows = await tx.lancamentoCaixa.findMany({ where: { carteiraId: portfolioId } });
      const entry = decide(rows.map(toStoredCashEntry));
      const row = await tx.lancamentoCaixa.create({
        data: { carteiraId: portfolioId, ...cashEntryData(entry) },
      });
      return toStoredCashEntry(row);
    });
  }
}
