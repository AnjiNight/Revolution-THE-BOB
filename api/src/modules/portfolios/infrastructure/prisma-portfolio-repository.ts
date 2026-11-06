import type { IsoDate, PortfolioType } from '@simulador/shared';
import {
  Prisma,
  type Carteira,
  type PrismaClient,
  type TipoCarteira,
} from '../../../generated/prisma/client.js';
import type {
  NewStoredPortfolio,
  PortfolioRepository,
  StoredPortfolio,
} from '../application/ports.js';
import { PortfolioNameInUseError } from '../domain/errors.js';
import { cashEntryData, lockPortfolio } from './prisma-ledger-repository.js';

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
   * Os lançamentos vão junto em cascata, e o registro guarda quantos eram (SPEC-013). A carteira é
   * travada antes de contar: um aporte chegando ao mesmo tempo entra antes ou não entra.
   */
  async delete(id: string, at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockPortfolio(tx, id);
      // SPEC-014: as compras e vendas também são lançamentos.
      const [cash, trades] = await Promise.all([
        tx.lancamentoCaixa.count({ where: { carteiraId: id } }),
        tx.transacao.count({ where: { carteiraId: id } }),
      ]);
      const entries = cash + trades;
      const row = await tx.carteira.delete({ where: { id } });
      await tx.exclusaoCarteira.create({
        data: { carteiraId: row.id, tipo: row.tipo, lancamentos: entries, excluidaEm: at },
      });
    });
  }
}
