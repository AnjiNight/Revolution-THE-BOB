import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import type { StoredMarketIndex } from '../application/ports.js';
import { PrismaMarketIndexRepository } from './prisma-market-index-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-020, CA01 e CA10). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam os fechamentos dos índices desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('índices da B3 no PostgreSQL', () => {
  let prisma: PrismaClient;
  let indexes: PrismaMarketIndexRepository;
  let ibov: StoredMarketIndex;
  let ifix: StoredMarketIndex;
  const at = new Date('2026-11-08T23:00:00Z');

  beforeAll(async () => {
    prisma = createPrismaClient(url as string);
    indexes = new PrismaMarketIndexRepository(prisma);
    ibov = (await indexes.findIndex('IBOV')) as StoredMarketIndex;
    ifix = (await indexes.findIndex('IFIX')) as StoredMarketIndex;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE fechamento_indice, carga_indice');
  });

  it('a migração cadastra o IBOV e o IFIX (CA10)', async () => {
    expect(ibov).toMatchObject({ code: 'IBOV' });
    expect(ifix).toMatchObject({ code: 'IFIX' });
    expect(await prisma.indiceBolsa.findUnique({ where: { sigla: 'IFIX' } })).toMatchObject({
      nome: 'Índice de Fundos de Investimentos Imobiliários',
    });
    expect(await indexes.findIndex('SMLL')).toBeNull();
  });

  it('grava sem desvio de fuso, não duplica e substitui só o valor corrigido (CA01)', async () => {
    const days = [
      { date: '2016-01-04', value: '42141.03' },
      { date: '2025-12-30', value: '161125.37' },
      { date: '2026-11-06', value: '168498.45' },
    ];
    expect(await indexes.save(ibov.id, days, at)).toBe(3);
    expect(await indexes.save(ibov.id, days, at)).toBe(0);
    expect(await indexes.save(ibov.id, [{ date: '2026-11-06', value: '168498.5' }], at)).toBe(1);
    expect(await indexes.save(ifix.id, [{ date: '2026-11-06', value: '3628.2' }], at)).toBe(1);

    expect(await indexes.closeDates(ibov.id)).toEqual(['2016-01-04', '2025-12-30', '2026-11-06']);
    expect(await indexes.closesBetween('IBOV', '2025-12-30', '2026-11-06')).toEqual([
      { date: '2025-12-30', close: '161125.37' },
      { date: '2026-11-06', close: '168498.50' },
    ]);
    expect(await indexes.closesBetween('IFIX', '2026-11-01', '2026-11-30')).toEqual([
      { date: '2026-11-06', close: '3628.20' },
    ]);
    const row = await prisma.fechamentoIndice.findFirstOrThrow({ where: { indiceId: ibov.id } });
    expect(row.fonte).toBe('b3_estatisticas');
  });

  it('marca os anos carregados e marca de novo sem erro', async () => {
    await indexes.markYearLoaded(ibov.id, 2016, 249, at);
    await indexes.markYearLoaded(ibov.id, 2016, 249, at);
    await indexes.markYearLoaded(ibov.id, 2017, 246, at);
    expect(await indexes.loadedYears(ibov.id)).toEqual(new Set([2016, 2017]));
    expect(await indexes.loadedYears(ifix.id)).toEqual(new Set());
  });

  it('o banco recusa fim de semana, valor zero ou negativo e registros negativos (CA10)', async () => {
    const row = (data: string, valor: string) =>
      prisma.fechamentoIndice.create({
        data: {
          indiceId: ibov.id,
          data: new Date(`${data}T00:00:00Z`),
          valor,
          fonte: 'b3_estatisticas',
          gravadoEm: at,
        },
      });
    await expect(row('2026-11-07', '168000')).rejects.toThrow();
    await expect(row('2026-11-06', '0')).rejects.toThrow();
    await expect(row('2026-11-06', '-1')).rejects.toThrow();
    await expect(
      prisma.cargaIndice.create({
        data: { indiceId: ibov.id, ano: 2016, carregadaEm: at, registros: -1 },
      }),
    ).rejects.toThrow();
  });
});
