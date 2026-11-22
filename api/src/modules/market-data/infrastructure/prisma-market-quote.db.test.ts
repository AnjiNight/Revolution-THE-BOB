import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaMarketQuoteRepository } from './prisma-market-quote-repository.js';
import { PrismaTaskRunRepository } from './prisma-quote-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-048: CA05 e CA07). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam as leituras do "Mercado hoje" e as
 * execuções dessa tarefa nesse banco.
 */
const url = process.env.TEST_DATABASE_URL;

const at = (brasilia: string, day = '2026-11-23') => new Date(`${day}T${brasilia}:00-03:00`);

describe.skipIf(!url)('"Mercado hoje" no PostgreSQL', () => {
  let prisma: PrismaClient;
  let quotes: PrismaMarketQuoteRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    quotes = new PrismaMarketQuoteRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.cotacaoMercado.deleteMany();
    await prisma.execucaoTarefa.deleteMany({ where: { tarefa: 'mercado_yahoo' } });
  });

  it('a mesma leitura de novo só renova a coleta; a última é a de horário mais recente', async () => {
    await quotes.save({
      symbol: 'dollar',
      at: at('10:00'),
      value: '5.9074',
      previousClose: '5.9052',
      collectedAt: at('10:00'),
    });
    await quotes.save({
      symbol: 'dollar',
      at: at('10:00'),
      value: '5.9074',
      previousClose: '5.9052',
      collectedAt: at('10:30'),
    });
    await quotes.save({
      symbol: 'ibovespa',
      at: at('10:15'),
      value: '166376.440000',
      previousClose: null,
      collectedAt: at('10:30'),
    });
    expect(await prisma.cotacaoMercado.count()).toBe(2);
    expect(await quotes.latest('dollar')).toEqual({
      symbol: 'dollar',
      at: at('10:00'),
      value: '5.9074',
      previousClose: '5.9052',
      collectedAt: at('10:30'),
    });
    expect(await quotes.latest('ibovespa')).toMatchObject({
      value: '166376.44',
      previousClose: null,
    });
  });

  it('limpeza pelo horário da leitura (CA05)', async () => {
    for (const day of ['2026-10-20', '2026-11-20']) {
      await quotes.save({
        symbol: 'ibovespa',
        at: at('12:00', day),
        value: '160000',
        previousClose: null,
        collectedAt: at('12:00', day),
      });
    }
    expect(await quotes.deleteBefore(at('00:00', '2026-10-24'))).toBe(1);
    expect(await prisma.cotacaoMercado.count()).toBe(1);
  });

  it('o banco recusa valor zerado ou negativo', async () => {
    await expect(
      prisma.cotacaoMercado.create({
        data: { simbolo: 'dolar', momento: at('10:00'), valor: '0' },
      }),
    ).rejects.toThrow();
  });

  it('a execução da tarefa grava com o código novo do enum', async () => {
    const runs = new PrismaTaskRunRepository(prisma);
    const id = await runs.start('mercado_yahoo', at('10:00'));
    await runs.finish(
      id,
      {
        status: 'sucesso',
        records: 2,
        affectedAssets: 0,
        periodStart: '2026-11-23',
        periodEnd: '2026-11-23',
        errors: [],
      },
      at('10:00'),
    );
    expect((await runs.lastRun('mercado_yahoo'))?.status).toBe('sucesso');
  });
});
