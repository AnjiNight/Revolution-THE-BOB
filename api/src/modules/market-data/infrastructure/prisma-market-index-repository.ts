import type { IsoDate } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { MarketIndexRepository, StoredMarketIndex } from '../application/ports.js';

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Valor com as 2 casas da coluna, para comparar o guardado com o que chegou ("120" = "120.00"). */
function twoDecimals(value: string): string {
  const [integer, fraction = ''] = value.split('.');
  return `${integer}.${fraction.padEnd(2, '0')}`;
}

/** Fechamentos dos índices da B3 (SPEC-020): IBOV e IFIX. */
export class PrismaMarketIndexRepository implements MarketIndexRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findIndex(code: string): Promise<StoredMarketIndex | null> {
    const row = await this.prisma.indiceBolsa.findUnique({ where: { sigla: code } });
    return row ? { id: row.id, code: row.sigla } : null;
  }

  async closeDates(indexId: string): Promise<IsoDate[]> {
    const rows = await this.prisma.fechamentoIndice.findMany({
      where: { indiceId: indexId },
      select: { data: true },
      orderBy: { data: 'asc' },
    });
    return rows.map((row) => toIsoDate(row.data));
  }

  async loadedYears(indexId: string): Promise<Set<number>> {
    const rows = await this.prisma.cargaIndice.findMany({
      where: { indiceId: indexId },
      select: { ano: true },
    });
    return new Set(rows.map((row) => row.ano));
  }

  /**
   * Numa transação: lê o que já existe no intervalo, insere os dias novos e atualiza só os que
   * mudaram (correção da B3). Rodar de novo com os mesmos dados não muda nada.
   */
  async save(
    indexId: string,
    closes: ReadonlyArray<{ date: IsoDate; value: string }>,
    at: Date,
  ): Promise<number> {
    if (closes.length === 0) return 0;
    const dates = closes.map((close) => close.date).sort();
    return this.prisma.$transaction(async (tx) => {
      const existing = new Map(
        (
          await tx.fechamentoIndice.findMany({
            where: {
              indiceId: indexId,
              data: { gte: fromIsoDate(dates[0]!), lte: fromIsoDate(dates.at(-1)!) },
            },
            select: { data: true, valor: true },
          })
        ).map((row) => [toIsoDate(row.data), row.valor.toFixed(2)]),
      );
      const fresh = closes.filter((close) => !existing.has(close.date));
      const changed = closes.filter(
        (close) =>
          existing.has(close.date) && existing.get(close.date) !== twoDecimals(close.value),
      );
      if (fresh.length > 0) {
        await tx.fechamentoIndice.createMany({
          data: fresh.map((close) => ({
            indiceId: indexId,
            data: fromIsoDate(close.date),
            valor: close.value,
            fonte: 'b3_estatisticas' as const,
            gravadoEm: at,
          })),
        });
      }
      for (const close of changed) {
        await tx.fechamentoIndice.update({
          where: { indiceId_data: { indiceId: indexId, data: fromIsoDate(close.date) } },
          data: { valor: close.value, gravadoEm: at },
        });
      }
      return fresh.length + changed.length;
    });
  }

  async markYearLoaded(indexId: string, year: number, records: number, at: Date): Promise<void> {
    await this.prisma.cargaIndice.upsert({
      where: { indiceId_ano: { indiceId: indexId, ano: year } },
      create: { indiceId: indexId, ano: year, carregadaEm: at, registros: records },
      update: { carregadaEm: at, registros: records },
    });
  }

  /** SPEC-020: os fechamentos do índice entre as datas (inclusive), em ordem, para a carteira. */
  async closesBetween(
    code: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<Array<{ date: IsoDate; close: string }>> {
    const rows = await this.prisma.fechamentoIndice.findMany({
      where: { indice: { sigla: code }, data: { gte: fromIsoDate(from), lte: fromIsoDate(to) } },
      select: { data: true, valor: true },
      orderBy: { data: 'asc' },
    });
    return rows.map((row) => ({ date: toIsoDate(row.data), close: row.valor.toFixed(2) }));
  }
}
