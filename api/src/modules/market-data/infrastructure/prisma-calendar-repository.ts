import type { IsoDate } from '@simulador/shared';
import type {
  AnoCalendario,
  DiaSemPregao,
  PrismaClient,
} from '../../../generated/prisma/client.js';
import type {
  CalendarRepository,
  NewCalendarPublication,
  StoredCalendarYear,
} from '../application/ports.js';

/** A coluna DATE chega como meia-noite em UTC; o dia é só a parte da data. */
function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toStored(row: AnoCalendario & { diasSemPregao: DiaSemPregao[] }): StoredCalendarYear {
  return {
    year: row.ano,
    publishedAt: row.publicadoEm,
    publishedBy: row.publicadoPor,
    nonTradingDays: row.diasSemPregao.map((day) => ({
      date: toIsoDate(day.data),
      reason: day.motivo,
    })),
  };
}

const WITH_DAYS = { diasSemPregao: { orderBy: { data: 'asc' } } } as const;

/** Calendário de pregão (SPEC-005): anos publicados e os dias úteis sem pregão de cada um. */
export class PrismaCalendarRepository implements CalendarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findYear(year: number): Promise<StoredCalendarYear | null> {
    const row = await this.prisma.anoCalendario.findUnique({
      where: { ano: year },
      include: WITH_DAYS,
    });
    return row ? toStored(row) : null;
  }

  async findYears(from: number, to: number): Promise<StoredCalendarYear[]> {
    const rows = await this.prisma.anoCalendario.findMany({
      where: { ano: { gte: from, lte: to } },
      include: WITH_DAYS,
      orderBy: { ano: 'asc' },
    });
    return rows.map(toStored);
  }

  /**
   * Numa transação só: grava quando e quem publicou, apaga a lista antiga e grava a nova. O
   * `upsert` vem primeiro e trava a linha do ano, então duas publicações juntas não se misturam.
   */
  async publish(publication: NewCalendarPublication): Promise<StoredCalendarYear> {
    const ano = publication.year;
    const header = { publicadoEm: publication.publishedAt, publicadoPor: publication.publishedBy };
    const [, , , row] = await this.prisma.$transaction([
      this.prisma.anoCalendario.upsert({
        where: { ano },
        create: { ano, ...header },
        update: header,
      }),
      this.prisma.diaSemPregao.deleteMany({ where: { ano } }),
      this.prisma.diaSemPregao.createMany({
        data: publication.nonTradingDays.map((day) => ({
          data: fromIsoDate(day.date),
          ano,
          motivo: day.reason,
        })),
      }),
      // Lido dentro da transação: devolve o que esta publicação gravou.
      this.prisma.anoCalendario.findUniqueOrThrow({ where: { ano }, include: WITH_DAYS }),
    ]);
    return toStored(row);
  }
}
