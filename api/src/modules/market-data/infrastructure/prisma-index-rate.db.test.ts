import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import type { StoredIndexer } from '../application/ports.js';
import { PrismaIndexRateRepository } from './prisma-index-rate-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-007, CA04 e CA10). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam a série do CDI desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('série do CDI no PostgreSQL', () => {
  let prisma: PrismaClient;
  let rates: PrismaIndexRateRepository;
  let cdi: StoredIndexer;
  const at = new Date('2026-11-04T12:00:00Z');

  beforeAll(async () => {
    prisma = createPrismaClient(url as string);
    rates = new PrismaIndexRateRepository(prisma);
    cdi = (await rates.findIndexer('CDI')) as StoredIndexer;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE taxa_diaria, carga_indexador');
  });

  it('a migração cadastra o CDI: série 12 do SGS, % ao dia (CA10)', async () => {
    expect(cdi).toMatchObject({ code: 'CDI', sgsSeries: 12 });
    expect(await prisma.indexador.findUnique({ where: { sigla: 'CDI' } })).toMatchObject({
      unidade: 'percentual_ao_dia',
    });
    expect(await rates.findIndexer('IPCA')).toBeNull();
  });

  it('grava sem desvio de fuso, não duplica e substitui só o valor revisado (CA04)', async () => {
    const days = [
      { date: '2025-12-24', value: '0.055131' },
      { date: '2025-12-31', value: '0.055131' },
      { date: '2026-01-02', value: '0.055131' },
    ];
    expect(await rates.save(cdi.id, days, at)).toBe(3);
    expect(await rates.save(cdi.id, days, at)).toBe(0);
    expect(await rates.save(cdi.id, [{ date: '2025-12-31', value: '0.05' }], at)).toBe(1);

    expect(await rates.rateDates(cdi.id)).toEqual(['2025-12-24', '2025-12-31', '2026-01-02']);
    const revised = await prisma.taxaDiaria.findFirstOrThrow({
      where: { indexadorId: cdi.id, data: new Date('2025-12-31T00:00:00Z') },
    });
    expect(revised.valor.toFixed(6)).toBe('0.050000');
    expect(revised.fonte).toBe('bcb_sgs');
  });

  it('marca os anos carregados e marca de novo sem erro', async () => {
    await rates.markYearLoaded(cdi.id, 2016, 251, at);
    await rates.markYearLoaded(cdi.id, 2016, 251, at);
    await rates.markYearLoaded(cdi.id, 2017, 249, at);
    expect(await rates.loadedYears(cdi.id)).toEqual(new Set([2016, 2017]));
  });

  it('o banco recusa fim de semana, valor fora de 0 a 1 e registros negativos (CA10)', async () => {
    const row = (data: string, valor: string) =>
      prisma.taxaDiaria.create({
        data: {
          indexadorId: cdi.id,
          data: new Date(`${data}T00:00:00Z`),
          valor,
          fonte: 'bcb_sgs',
          gravadoEm: at,
        },
      });
    await expect(row('2026-10-31', '0.05')).rejects.toThrow();
    await expect(row('2026-11-03', '1')).rejects.toThrow();
    await expect(row('2026-11-03', '-0.01')).rejects.toThrow();
    await expect(
      prisma.cargaIndexador.create({
        data: { indexadorId: cdi.id, ano: 2016, carregadaEm: at, registros: -1 },
      }),
    ).rejects.toThrow();
  });
});
