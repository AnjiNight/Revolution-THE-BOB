import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { CalendarService } from '../application/calendar-service.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import { PrismaCalendarRepository } from './prisma-calendar-repository.js';

/**
 * Testes contra PostgreSQL real (CA04, CA11). Rodam só com TEST_DATABASE_URL apontando para um
 * banco com as migrações aplicadas. ATENÇÃO: apagam o calendário desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

const COLLABORATOR = '0d9e1f7a-1111-4222-8333-444455556666';
const OTHER_COLLABORATOR = '7c1d2e3f-5555-4666-8777-888899990000';

describe.skipIf(!url)('calendário de pregão no PostgreSQL', () => {
  let prisma: PrismaClient;
  let calendars: PrismaCalendarRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    calendars = new PrismaCalendarRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE ano_calendario CASCADE');
  });

  const publish = (year: number, publishedBy = COLLABORATOR, at = new Date()) =>
    calendars.publish({
      year,
      publishedAt: at,
      publishedBy,
      nonTradingDays: suggestNonTradingDays(year),
    });

  it('publica o ano com a lista em ordem de data e as datas certas (sem desvio de fuso)', async () => {
    const at = new Date('2026-10-22T15:00:00.000Z');
    const stored = await publish(2026, COLLABORATOR, at);
    expect(stored).toMatchObject({ year: 2026, publishedAt: at, publishedBy: COLLABORATOR });
    expect(stored.nonTradingDays).toEqual(suggestNonTradingDays(2026));
    expect(await calendars.findYear(2026)).toEqual(stored);
    expect(await calendars.findYear(2027)).toBeNull();
  });

  it('republicar substitui a lista inteira e registra o novo autor (CA04)', async () => {
    await publish(2026);
    const later = new Date('2026-12-05T12:00:00.000Z');
    await calendars.publish({
      year: 2026,
      publishedAt: later,
      publishedBy: OTHER_COLLABORATOR,
      nonTradingDays: [{ date: '2026-02-16', reason: 'Carnaval' }],
    });
    expect(await calendars.findYear(2026)).toEqual({
      year: 2026,
      publishedAt: later,
      publishedBy: OTHER_COLLABORATOR,
      nonTradingDays: [{ date: '2026-02-16', reason: 'Carnaval' }],
    });
    expect(await prisma.diaSemPregao.count()).toBe(1);
  });

  it('publicação com dia recusado pelo banco não deixa nada pela metade', async () => {
    await publish(2026);
    await expect(
      calendars.publish({
        year: 2026,
        publishedAt: new Date(),
        publishedBy: OTHER_COLLABORATOR,
        nonTradingDays: [
          { date: '2026-02-16', reason: 'Carnaval' },
          { date: '2026-10-24', reason: 'Sábado' },
        ],
      }),
    ).rejects.toThrow();
    const kept = await calendars.findYear(2026);
    expect(kept?.publishedBy).toBe(COLLABORATOR);
    expect(kept?.nonTradingDays).toHaveLength(14);
  });

  it('busca só os anos publicados do intervalo', async () => {
    await publish(2025);
    await publish(2027);
    expect((await calendars.findYears(2024, 2026)).map((y) => y.year)).toEqual([2025]);
    expect((await calendars.findYears(2025, 2027)).map((y) => y.year)).toEqual([2025, 2027]);
  });

  it('as regras do servidor leem o publicado e recusam ano não publicado', async () => {
    await publish(2026);
    const rules = await new CalendarService({ calendars }).tradingCalendar(2026, 2026);
    expect(rules.countTradingDays('2026-01-01', '2026-12-31')).toBe(247);
    expect(() => rules.nextTradingDay('2026-12-30')).toThrow(/2027/);
  });

  describe('restrições do banco (CA11)', () => {
    const insertYear = (ano: number) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO ano_calendario (ano, publicado_em, publicado_por) VALUES (${ano}, now(), '${COLLABORATOR}')`,
      );
    const insertDay = (data: string, ano: number, motivo = 'Feriado') =>
      prisma.$executeRawUnsafe(
        `INSERT INTO dia_sem_pregao (data, ano, motivo) VALUES ('${data}', ${ano}, '${motivo}')`,
      );

    it('ano só de 2000 a 2100', async () => {
      await expect(insertYear(1999)).rejects.toThrow(/ano_calendario_ano_chk/);
      await expect(insertYear(2101)).rejects.toThrow(/ano_calendario_ano_chk/);
    });

    it('dia precisa de um ano publicado, do mesmo ano', async () => {
      await expect(insertDay('2026-01-01', 2026)).rejects.toThrow(/dia_sem_pregao_ano_fkey/);
      await insertYear(2026);
      await insertYear(2027);
      await expect(insertDay('2027-01-01', 2026)).rejects.toThrow(/dia_sem_pregao_ano_chk/);
    });

    it('não aceita sábado nem domingo', async () => {
      await insertYear(2026);
      await expect(insertDay('2026-10-24', 2026)).rejects.toThrow(/dia_sem_pregao_dia_util_chk/);
      await expect(insertDay('2026-10-25', 2026)).rejects.toThrow(/dia_sem_pregao_dia_util_chk/);
    });

    it('motivo de 1 a 100 caracteres, sem contar espaços nas pontas', async () => {
      await insertYear(2026);
      await expect(insertDay('2026-01-01', 2026, '   ')).rejects.toThrow(
        /dia_sem_pregao_motivo_chk/,
      );
    });

    it('a mesma data não entra duas vezes', async () => {
      await insertYear(2026);
      await insertDay('2026-01-01', 2026);
      await expect(insertDay('2026-01-01', 2026)).rejects.toThrow(/dia_sem_pregao_pkey/);
    });

    it('apagar o ano apaga os dias dele', async () => {
      await publish(2026);
      await prisma.anoCalendario.delete({ where: { ano: 2026 } });
      expect(await prisma.diaSemPregao.count()).toBe(0);
    });
  });
});
