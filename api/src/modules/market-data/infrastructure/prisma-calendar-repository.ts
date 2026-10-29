import type { IsoDate, NonTradingDay } from '@simulador/shared';
import type {
  AnoCalendario,
  DiaSemPregao,
  PrismaClient,
} from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../../audit/application/audit.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
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
   * Numa transação só: trava o ano (se já existe), lê a lista anterior para a auditoria, grava
   * quando e quem publicou, troca a lista e grava o registro de auditoria. Duas publicações juntas
   * do mesmo ano esperam uma pela outra; uma falha não deixa nada pela metade.
   */
  async publish(
    publication: NewCalendarPublication,
    audit: (before: NonTradingDay[] | null) => AuditEntry,
  ): Promise<StoredCalendarYear> {
    const ano = publication.year;
    const header = { publicadoEm: publication.publishedAt, publicadoPor: publication.publishedBy };
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ ano: number }>>`
        SELECT ano FROM ano_calendario WHERE ano = ${ano} FOR UPDATE`;
      const before =
        locked.length === 0
          ? null
          : (await tx.diaSemPregao.findMany({ where: { ano }, orderBy: { data: 'asc' } })).map(
              (day) => ({ date: toIsoDate(day.data), reason: day.motivo }),
            );
      await tx.anoCalendario.upsert({ where: { ano }, create: { ano, ...header }, update: header });
      await tx.diaSemPregao.deleteMany({ where: { ano } });
      await tx.diaSemPregao.createMany({
        data: publication.nonTradingDays.map((day) => ({
          data: fromIsoDate(day.date),
          ano,
          motivo: day.reason,
        })),
      });
      await tx.registroAuditoria.create({ data: auditRow(audit(before)) });
      // Lido dentro da transação: devolve o que esta publicação gravou.
      return toStored(
        await tx.anoCalendario.findUniqueOrThrow({ where: { ano }, include: WITH_DAYS }),
      );
    });
  }
}
