import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IndexRateRepository, StoredIndexer } from '../application/ports.js';

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Valor com as 6 casas da coluna, para comparar o guardado com o que chegou ("0.05" = "0.050000"). */
function sixDecimals(value: string): string {
  const [integer, fraction = ''] = value.split('.');
  return `${integer}.${fraction.padEnd(6, '0')}`;
}

/** Série dos indexadores (SPEC-007): só o CDI no escopo atual. */
export class PrismaIndexRateRepository implements IndexRateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findIndexer(code: string): Promise<StoredIndexer | null> {
    const row = await this.prisma.indexador.findUnique({ where: { sigla: code } });
    return row ? { id: row.id, code: row.sigla, sgsSeries: row.serieSgs } : null;
  }

  async rateDates(indexerId: string): Promise<IsoDate[]> {
    const rows = await this.prisma.taxaDiaria.findMany({
      where: { indexadorId: indexerId },
      select: { data: true },
      orderBy: { data: 'asc' },
    });
    return rows.map((row) => toIsoDate(row.data));
  }

  async loadedYears(indexerId: string): Promise<Set<number>> {
    const rows = await this.prisma.cargaIndexador.findMany({
      where: { indexadorId: indexerId },
      select: { ano: true },
    });
    return new Set(rows.map((row) => row.ano));
  }

  /**
   * Numa transação: lê o que já existe no intervalo, insere os dias novos e atualiza só os que
   * mudaram (revisão do Banco Central). Rodar de novo com os mesmos dados não muda nada.
   */
  async save(
    indexerId: string,
    rates: ReadonlyArray<{ date: IsoDate; value: string }>,
    at: Date,
  ): Promise<number> {
    if (rates.length === 0) return 0;
    const dates = rates.map((rate) => rate.date).sort();
    return this.prisma.$transaction(async (tx) => {
      const existing = new Map(
        (
          await tx.taxaDiaria.findMany({
            where: {
              indexadorId: indexerId,
              data: { gte: fromIsoDate(dates[0]!), lte: fromIsoDate(dates.at(-1)!) },
            },
            select: { data: true, valor: true },
          })
        ).map((row) => [toIsoDate(row.data), row.valor.toFixed(6)]),
      );
      const fresh = rates.filter((rate) => !existing.has(rate.date));
      const changed = rates.filter(
        (rate) => existing.has(rate.date) && existing.get(rate.date) !== sixDecimals(rate.value),
      );
      if (fresh.length > 0) {
        await tx.taxaDiaria.createMany({
          data: fresh.map((rate) => ({
            indexadorId: indexerId,
            data: fromIsoDate(rate.date),
            valor: rate.value,
            fonte: 'bcb_sgs' as const,
            gravadoEm: at,
          })),
        });
      }
      for (const rate of changed) {
        await tx.taxaDiaria.update({
          where: { indexadorId_data: { indexadorId: indexerId, data: fromIsoDate(rate.date) } },
          data: { valor: rate.value, gravadoEm: at },
        });
      }
      return fresh.length + changed.length;
    });
  }

  async markYearLoaded(indexerId: string, year: number, records: number, at: Date): Promise<void> {
    await this.prisma.cargaIndexador.upsert({
      where: { indexadorId_ano: { indexadorId: indexerId, ano: year } },
      create: { indexadorId: indexerId, ano: year, carregadaEm: at, registros: records },
      update: { carregadaEm: at, registros: records },
    });
  }
}
