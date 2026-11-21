import type { ClasseAtivo, PrismaClient } from '../../../generated/prisma/client.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type {
  AutomaticChange,
  CatalogEntry,
  CatalogImportRepository,
  ImportedAsset,
} from '../application/ports.js';

const CLASS_TO_CLASSE = { stock: 'acao', fii: 'fii' } as const satisfies Record<
  ImportedAsset['assetClass'],
  ClasseAtivo
>;

/**
 * Escritas da importação diária no catálogo (SPEC-040), no PostgreSQL. Cada mudança grava o
 * registro de auditoria na mesma transação, sem colaborador (é o processador).
 */
export class PrismaCatalogImportRepository implements CatalogImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async entries(): Promise<CatalogEntry[]> {
    const rows = await this.prisma.ativo.findMany({
      select: {
        id: true,
        ticker: true,
        classe: true,
        criadoEm: true,
        desativadoEm: true,
        desativadoAutomaticamente: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      ticker: row.ticker,
      assetClass: row.classe === 'fii' ? 'fii' : 'stock',
      createdAt: row.criadoEm,
      deactivatedAt: row.desativadoEm,
      autoDeactivated: row.desativadoAutomaticamente,
    }));
  }

  /**
   * Cria tudo numa transação. Um ticker que alguém cadastrou enquanto a importação rodava é pulado
   * (a chave única do ticker), e só os criados ganham o registro de auditoria.
   */
  createImported(assets: ImportedAsset[], at: Date): Promise<ImportedAsset[]> {
    if (assets.length === 0) return Promise.resolve([]);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.ativo.createManyAndReturn({
        data: assets.map((asset) => ({
          id: asset.id,
          ticker: asset.ticker,
          nome: asset.name,
          classe: CLASS_TO_CLASSE[asset.assetClass],
          setor: asset.sector,
          criadoEm: at,
          atualizadoEm: at,
          origem: 'importacao' as const,
          classificacaoConferidaEm: null,
        })),
        skipDuplicates: true,
        select: { id: true },
      });
      const createdIds = new Set(rows.map((row) => row.id));
      const created = assets.filter((asset) => createdIds.has(asset.id));
      if (created.length > 0) {
        await tx.registroAuditoria.createMany({
          data: created.map((asset) =>
            auditRow({
              at,
              collaboratorId: null,
              action: 'asset_imported',
              entity: 'asset',
              entityId: asset.id,
              details: {
                after: {
                  ticker: asset.ticker,
                  name: asset.name,
                  class: asset.assetClass,
                  sector: asset.sector,
                },
              },
            }),
          ),
        });
      }
      return created;
    });
  }

  /** Só os que ainda estão ativos: se um colaborador desativou antes, nada muda. */
  async autoDeactivate(changes: AutomaticChange[], at: Date): Promise<number> {
    let changed = 0;
    for (const change of changes) {
      const done = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ativo.updateMany({
          where: { id: change.id, desativadoEm: null },
          data: { desativadoEm: at, desativadoAutomaticamente: true, atualizadoEm: at },
        });
        if (updated.count === 0) return false;
        await tx.registroAuditoria.create({
          data: auditRow({
            at,
            collaboratorId: null,
            action: 'asset_auto_deactivated',
            entity: 'asset',
            entityId: change.id,
            details: {
              before: { active: true },
              after: { active: false, lastTradedOn: change.lastTradedOn },
            },
          }),
        });
        return true;
      });
      if (done) changed += 1;
    }
    return changed;
  }

  /** Só os que o processador desativou: o que um colaborador desativou nunca volta sozinho. */
  async autoReactivate(changes: AutomaticChange[], at: Date): Promise<number> {
    let changed = 0;
    for (const change of changes) {
      const done = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ativo.updateMany({
          where: { id: change.id, desativadoEm: { not: null }, desativadoAutomaticamente: true },
          data: { desativadoEm: null, desativadoAutomaticamente: false, atualizadoEm: at },
        });
        if (updated.count === 0) return false;
        await tx.registroAuditoria.create({
          data: auditRow({
            at,
            collaboratorId: null,
            action: 'asset_auto_reactivated',
            entity: 'asset',
            entityId: change.id,
            details: {
              before: { active: false },
              after: { active: true, lastTradedOn: change.lastTradedOn },
            },
          }),
        });
        return true;
      });
      if (done) changed += 1;
    }
    return changed;
  }
}
