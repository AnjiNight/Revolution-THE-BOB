import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { AssetEventReader } from '../../asset-catalog/application/ports.js';
import type { PriceEventInput } from '../../financial-calculation/price-adjustment.js';
import type { CorporateEventRepository } from '../application/ports.js';
import type { CorporateEvent } from '../domain/b3-events.js';

function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Eventos corporativos das ações, pela B3 (SPEC-042). */
export class PrismaEventRepository implements CorporateEventRepository, AssetEventReader {
  constructor(private readonly prisma: PrismaClient) {}

  async replace(assetId: string, events: CorporateEvent[], at: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.eventoCorporativo.deleteMany({ where: { ativoId: assetId } }),
      this.prisma.eventoCorporativo.createMany({
        data: events.map((event) => ({
          ativoId: assetId,
          tipo: event.kind,
          dataCom: fromIsoDate(event.exDate),
          fator: event.factor,
          aprovadoEm: event.approvedOn ? fromIsoDate(event.approvedOn) : null,
          fonte: 'b3' as const,
          coletadoEm: at,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  async forAsset(assetId: string): Promise<PriceEventInput[]> {
    const rows = await this.prisma.eventoCorporativo.findMany({
      where: { ativoId: assetId },
      orderBy: { dataCom: 'asc' },
    });
    return rows.map((row) => ({
      kind: row.tipo,
      exDate: toIsoDate(row.dataCom),
      factor: row.fator.toFixed(10).replace(/\.?0+$/, ''),
    }));
  }
}
