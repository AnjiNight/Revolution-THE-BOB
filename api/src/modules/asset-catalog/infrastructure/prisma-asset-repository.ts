import type { AssetClass, SectorCode } from '@simulador/shared';
import {
  Prisma,
  type Ativo,
  type ClasseAtivo,
  type PrismaClient,
} from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../../audit/application/audit.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type { AssetFilter, AssetModification, AssetRepository } from '../application/ports.js';
import type { StoredAsset } from '../domain/asset.js';
import { TickerInUseError } from '../domain/errors.js';

const CLASS_TO_CLASSE: Record<AssetClass, ClasseAtivo> = { stock: 'acao', fii: 'fii' };
const CLASSE_TO_CLASS: Record<ClasseAtivo, AssetClass> = { acao: 'stock', fii: 'fii' };

function toStored(row: Ativo): StoredAsset {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.nome,
    assetClass: CLASSE_TO_CLASS[row.classe],
    // A chave estrangeira (classe, setor) garante um código da lista fixa.
    sector: row.setor as SectorCode,
    createdAt: row.criadoEm,
    updatedAt: row.atualizadoEm,
    deactivatedAt: row.desativadoEm,
  };
}

function isTickerViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Catálogo de ativos (SPEC-006) no PostgreSQL; cada alteração grava a auditoria junto. */
export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: AssetFilter): Promise<StoredAsset[]> {
    const rows = await this.prisma.ativo.findMany({
      where: {
        ...(filter.status === 'active' ? { desativadoEm: null } : {}),
        ...(filter.status === 'inactive' ? { desativadoEm: { not: null } } : {}),
        ...(filter.assetClass ? { classe: CLASS_TO_CLASSE[filter.assetClass] } : {}),
        ...(filter.sector ? { setor: filter.sector } : {}),
      },
    });
    return rows.map(toStored);
  }

  countActive(): Promise<number> {
    return this.prisma.ativo.count({ where: { desativadoEm: null } });
  }

  async findById(id: string): Promise<StoredAsset | null> {
    const row = await this.prisma.ativo.findUnique({ where: { id } });
    return row ? toStored(row) : null;
  }

  async create(asset: StoredAsset, audit: AuditEntry): Promise<StoredAsset> {
    try {
      const [row] = await this.prisma.$transaction([
        this.prisma.ativo.create({
          data: {
            id: asset.id,
            ticker: asset.ticker,
            nome: asset.name,
            classe: CLASS_TO_CLASSE[asset.assetClass],
            setor: asset.sector,
            criadoEm: asset.createdAt,
            atualizadoEm: asset.updatedAt,
            desativadoEm: asset.deactivatedAt,
          },
        }),
        this.prisma.registroAuditoria.create({ data: auditRow(audit) }),
      ]);
      return toStored(row);
    } catch (error) {
      if (isTickerViolation(error)) throw new TickerInUseError();
      throw error;
    }
  }

  /**
   * Numa transação: trava a linha (FOR UPDATE), decide com o estado atual e grava a mudança e a
   * auditoria. Duas edições juntas do mesmo ativo esperam uma pela outra.
   */
  async modify(
    id: string,
    decide: (current: StoredAsset) => AssetModification | null,
  ): Promise<StoredAsset | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM ativo WHERE id = ${id}::uuid FOR UPDATE`;
        if (locked.length === 0) return null;
        const current = toStored(await tx.ativo.findUniqueOrThrow({ where: { id } }));
        const decision = decide(current);
        if (!decision) return current;

        const { changes } = decision;
        const row = await tx.ativo.update({
          where: { id },
          data: {
            ...(changes.ticker !== undefined ? { ticker: changes.ticker } : {}),
            ...(changes.name !== undefined ? { nome: changes.name } : {}),
            ...(changes.sector !== undefined ? { setor: changes.sector } : {}),
            ...(changes.deactivatedAt !== undefined ? { desativadoEm: changes.deactivatedAt } : {}),
            atualizadoEm: decision.updatedAt,
          },
        });
        await tx.registroAuditoria.create({ data: auditRow(decision.audit) });
        return toStored(row);
      });
    } catch (error) {
      if (isTickerViolation(error)) throw new TickerInUseError();
      throw error;
    }
  }
}
