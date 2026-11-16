import type { IsoDate, PortfolioType } from '@simulador/shared';
import {
  Prisma,
  type Carteira,
  type PrismaClient,
  type TipoCarteira,
} from '../../../generated/prisma/client.js';
import type {
  NewStoredPortfolio,
  NewStoredPortfolioCopy,
  PortfolioLedger,
  PortfolioRepository,
  StoredPortfolio,
  StoredPortfolioCopy,
} from '../application/ports.js';
import { PortfolioNameInUseError } from '../domain/errors.js';
import { cashEntryData, lockPortfolio, readLedger, tradeData } from './prisma-ledger-repository.js';

const TYPE_TO_TIPO: Record<PortfolioType, TipoCarteira> = {
  live: 'ao_vivo',
  historical: 'historica',
};

function toStored(row: Carteira): StoredPortfolio {
  return {
    id: row.id,
    userId: row.usuarioId,
    name: row.nome,
    type: row.tipo === 'historica' ? 'historical' : 'live',
    startDate: row.inicioEm.toISOString().slice(0, 10),
    createdAt: row.criadaEm,
    updatedAt: row.atualizadaEm,
    copiedFromId: row.origemId,
  };
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function isNameViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Carteiras (SPEC-012) no PostgreSQL. */
export class PrismaPortfolioRepository implements PortfolioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByUser(userId: string): Promise<StoredPortfolio[]> {
    const rows = await this.prisma.carteira.findMany({
      where: { usuarioId: userId },
      orderBy: [{ criadaEm: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toStored);
  }

  countByUser(userId: string): Promise<number> {
    return this.prisma.carteira.count({ where: { usuarioId: userId } });
  }

  async findById(id: string): Promise<StoredPortfolio | null> {
    const row = await this.prisma.carteira.findUnique({ where: { id } });
    return row ? toStored(row) : null;
  }

  async create(portfolio: NewStoredPortfolio): Promise<StoredPortfolio> {
    try {
      const row = await this.prisma.carteira.create({
        data: {
          usuarioId: portfolio.userId,
          nome: portfolio.name,
          nomeChave: portfolio.nameKey,
          tipo: TYPE_TO_TIPO[portfolio.type],
          inicioEm: fromIsoDate(portfolio.startDate),
          criadaEm: portfolio.at,
          atualizadaEm: portfolio.at,
          // SPEC-013: o "Valor inicial" entra na mesma instrução, então vai junto ou nada fica.
          ...(portfolio.initialDeposit
            ? { lancamentosCaixa: { create: [cashEntryData(portfolio.initialDeposit)] } }
            : {}),
        },
      });
      return toStored(row);
    } catch (error) {
      if (isNameViolation(error)) throw new PortfolioNameInUseError();
      throw error;
    }
  }

  async rename(id: string, name: string, nameKey: string, at: Date): Promise<StoredPortfolio> {
    try {
      const row = await this.prisma.carteira.update({
        where: { id },
        data: { nome: name, nomeChave: nameKey, atualizadaEm: at },
      });
      return toStored(row);
    } catch (error) {
      if (isNameViolation(error)) throw new PortfolioNameInUseError();
      throw error;
    }
  }

  /**
   * SPEC-023: tudo numa transação, com a original travada (a foto do livro é de um instante só e o
   * limite de 20 é conferido dentro da trava). Os lançamentos copiados entram com os ids novos e o
   * resto igual, inclusive o horário de registro: o banco exige que a data case com ele.
   */
  async copyLocked(
    sourceId: string,
    decide: (current: PortfolioLedger, count: number) => NewStoredPortfolioCopy,
  ): Promise<StoredPortfolioCopy> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockPortfolio(tx, sourceId);
        const source = await tx.carteira.findUniqueOrThrow({ where: { id: sourceId } });
        const count = await tx.carteira.count({ where: { usuarioId: source.usuarioId } });
        const copy = decide(await readLedger(tx, sourceId), count);
        const row = await tx.carteira.create({
          data: {
            usuarioId: source.usuarioId,
            nome: copy.name,
            nomeChave: copy.nameKey,
            tipo: source.tipo,
            inicioEm: source.inicioEm,
            criadaEm: copy.at,
            atualizadaEm: copy.at,
            origemId: sourceId,
          },
        });
        if (copy.cash.length > 0) {
          await tx.lancamentoCaixa.createMany({
            data: copy.cash.map((entry) => ({ carteiraId: row.id, ...cashEntryData(entry) })),
          });
        }
        if (copy.trades.length > 0) {
          await tx.transacao.createMany({
            data: copy.trades.map((trade) => tradeData(row.id, trade)),
          });
        }
        return {
          portfolio: toStored(row),
          copied: { cashEntries: copy.cash.length, trades: copy.trades.length },
        };
      });
    } catch (error) {
      if (isNameViolation(error)) throw new PortfolioNameInUseError();
      throw error;
    }
  }

  async namesOf(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.carteira.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nome: true },
    });
    return new Map(rows.map((row) => [row.id, row.nome]));
  }

  /**
   * Os lançamentos vão junto em cascata, e o registro guarda quantos eram (SPEC-013). A carteira é
   * travada antes de contar: um aporte chegando ao mesmo tempo entra antes ou não entra.
   */
  async delete(id: string, at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, id);
      // SPEC-014: as compras e vendas também são lançamentos.
      // SPEC-015: os estornos também são lançamentos (DA09).
      const where = { carteiraId: id };
      const [cash, trades, reversals] = await Promise.all([
        tx.lancamentoCaixa.count({ where }),
        tx.transacao.count({ where }),
        tx.estorno.count({ where }),
      ]);
      const entries = cash + trades + reversals;
      const row = await tx.carteira.delete({ where: { id } });
      await tx.exclusaoCarteira.create({
        data: { carteiraId: row.id, tipo: row.tipo, lancamentos: entries, excluidaEm: at },
      });
    });
  }
}
