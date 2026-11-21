import type { SectorCode } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type {
  ClassificationRepository,
  SectorSuggestion,
  StoredB3Classification,
  UnreviewedAsset,
} from '../application/ports.js';

/**
 * Classificação setorial da B3 por empresa e troca da classificação sugerida dos ativos a revisar
 * (SPEC-021), no PostgreSQL. Cada troca grava o registro de auditoria na mesma transação, sem
 * colaborador (é o processador, como na importação da SPEC-040).
 */
export class PrismaClassificationRepository implements ClassificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async b3Classifications(): Promise<Map<string, StoredB3Classification>> {
    const rows = await this.prisma.classificacaoB3.findMany();
    return new Map(
      rows.map((row) => [
        row.codigo,
        {
          code: row.codigo,
          codeCvm: row.codigoCvm,
          sector: row.setor,
          subsector: row.subsetor,
          segment: row.segmento,
          collectedAt: row.coletadaEm,
        },
      ]),
    );
  }

  async saveB3Classification(row: StoredB3Classification): Promise<void> {
    const data = {
      codigoCvm: row.codeCvm,
      setor: row.sector,
      subsetor: row.subsector,
      segmento: row.segment,
      coletadaEm: row.collectedAt,
    };
    await this.prisma.classificacaoB3.upsert({
      where: { codigo: row.code },
      create: { codigo: row.code, ...data },
      update: data,
    });
  }

  async unreviewed(): Promise<UnreviewedAsset[]> {
    const rows = await this.prisma.ativo.findMany({
      where: { classificacaoConferidaEm: null },
      select: {
        id: true,
        ticker: true,
        classe: true,
        setor: true,
        informacaoFii: { select: { tipoFundo: true, segmento: true } },
      },
      orderBy: { ticker: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      ticker: row.ticker,
      assetClass: row.classe === 'fii' ? 'fii' : 'stock',
      sector: row.setor as SectorCode,
      fundType: row.informacaoFii?.tipoFundo ?? null,
      fundSegment: row.informacaoFii?.segmento ?? null,
    }));
  }

  /** Só o que continua a revisar e com o setor de antes: se a equipe mexeu no meio, nada muda. */
  async suggest(changes: readonly SectorSuggestion[], at: Date): Promise<number> {
    let changed = 0;
    for (const change of changes) {
      const done = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ativo.updateMany({
          where: { id: change.assetId, classificacaoConferidaEm: null, setor: change.from },
          data: { setor: change.to, atualizadoEm: at },
        });
        if (updated.count === 0) return false;
        await tx.registroAuditoria.create({
          data: auditRow({
            at,
            collaboratorId: null,
            action: 'classification_suggested',
            entity: 'asset',
            entityId: change.assetId,
            details: {
              before: { sector: change.from },
              after: { sector: change.to, source: change.source },
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
