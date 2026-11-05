import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaB3TradeRepository } from './prisma-b3-trade-repository.js';
import { PrismaEventRepository } from './prisma-event-repository.js';
import { PrismaFundamentalsRepository } from './prisma-fundamentals-repository.js';

/**
 * Testes contra PostgreSQL real (SPECs 041 e 042, CA08). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam os indicadores, os proventos e os
 * eventos desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('indicadores, proventos e eventos no PostgreSQL', () => {
  let prisma: PrismaClient;
  let repo: PrismaFundamentalsRepository;
  let events: PrismaEventRepository;
  let assetId: string;
  const at = new Date('2026-11-08T06:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaFundamentalsRepository(prisma);
    events = new PrismaEventRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE indicador_ativo, informacao_fii, coleta_investidor10, provento, evento_corporativo',
    );
    const ticker = `T${randomUUID().replace(/\D/g, '').slice(0, 3)}3`.slice(0, 5);
    const asset = await prisma.ativo.create({
      data: { ticker, nome: 'Teste', classe: 'acao', setor: 'bens_industriais', atualizadoEm: at },
    });
    assetId = asset.id;
  });

  const collection = () => ({
    assetId,
    current: new Map([
      ['p_l', '4.55'],
      ['margem_liquida', null],
    ] as const),
    history: new Map([['p_l', new Map([['2025', '3.606959']])]] as const),
    fund: null,
    dividends: [
      {
        kind: 'jcp' as const,
        exDate: '2026-08-21',
        paymentDate: '2026-12-21',
        value: '0.20250435',
      },
      { kind: 'dividendo' as const, exDate: '2025-04-10', paymentDate: null, value: '1.5' },
    ],
  });

  it('grava tudo de uma vez e lê de volta; coletar de novo substitui (CA05)', async () => {
    await repo.save(collection(), at);
    await repo.save(collection(), at);

    const stored = await repo.fundamentals(assetId);
    expect(stored).toMatchObject({
      assetClass: 'stock',
      status: 'ok',
      collectedAt: at,
      fund: null,
    });
    expect(Object.fromEntries(stored?.values.get('p_l') ?? [])).toEqual({
      atual: '4.55',
      '2025': '3.606959',
    });
    expect(stored?.values.get('margem_liquida')?.get('atual')).toBeNull();
    expect(await repo.dividends(assetId, null)).toEqual([
      { kind: 'jcp', exDate: '2026-08-21', paymentDate: '2026-12-21', value: '0.20250435' },
      { kind: 'dividendo', exDate: '2025-04-10', paymentDate: null, value: '1.5' },
    ]);
    expect(await repo.dividends(assetId, '2026-01-01')).toHaveLength(1);
    expect(await prisma.provento.count()).toBe(2);
    expect(await repo.visitCounts()).toEqual({ ok: 1, sem_pagina: 0, erro: 0 });
  });

  it('visita sem dados não apaga o que estava guardado; apagar tudo (fim da autorização)', async () => {
    await repo.save(collection(), at);
    await repo.markVisit(assetId, 'erro', at);
    expect((await repo.fundamentals(assetId))?.status).toBe('erro');
    expect(await prisma.indicadorAtivo.count()).toBe(3);

    expect(await repo.clear()).toBeGreaterThan(0);
    expect(await prisma.indicadorAtivo.count()).toBe(0);
    expect(await prisma.provento.count()).toBe(0);
    expect(await repo.visitedAssets()).toEqual(new Set());
  });

  it('o banco recusa provento zerado, pagamento antes da data com e período estranho (CA08)', async () => {
    const provento = (valor: string, dataPagamento: Date | null) =>
      prisma.provento.create({
        data: {
          ativoId: assetId,
          tipo: 'dividendo',
          dataCom: new Date('2026-08-21T00:00:00Z'),
          dataPagamento,
          valor,
          fonte: 'investidor10',
          coletadoEm: at,
        },
      });
    await expect(provento('0', null)).rejects.toThrow();
    await expect(provento('1', new Date('2026-08-01T00:00:00Z'))).rejects.toThrow();
    await expect(
      prisma.indicadorAtivo.create({
        data: { ativoId: assetId, indicador: 'p_l', periodo: 'ontem', valor: '1', coletadoEm: at },
      }),
    ).rejects.toThrow();
  });

  it('eventos: substitui os do ativo e devolve em ordem de data com, com o fator', async () => {
    const event = (exDate: string, factor: string, kind: 'desdobramento' | 'grupamento') => ({
      kind,
      exDate,
      factor,
      approvedOn: null,
      isin: 'BRMGLUACNOR2',
    });
    await events.replace(
      assetId,
      [event('2024-05-24', '0.1', 'grupamento'), event('2020-10-13', '300', 'desdobramento')],
      at,
    );
    await events.replace(
      assetId,
      [event('2024-05-24', '0.1', 'grupamento'), event('2020-10-13', '300', 'desdobramento')],
      at,
    );
    expect(await events.forAsset(assetId)).toEqual([
      { kind: 'desdobramento', exDate: '2020-10-13', factor: '300' },
      { kind: 'grupamento', exDate: '2024-05-24', factor: '0.1' },
    ]);
  });

  it('negócio da B3 guarda o ISIN do mais recente; sem ISIN, fica o que já estava', async () => {
    await prisma.negociacaoB3.deleteMany({ where: { ticker: 'ZZZZ3' } });
    const trades = new PrismaB3TradeRepository(prisma);
    await trades.record(
      [
        {
          ticker: 'ZZZZ3',
          assetClass: 'stock',
          lastTradingDay: '2026-10-28',
          isin: 'BRZZZZACNOR1',
        },
      ],
      at,
    );
    await trades.record(
      [{ ticker: 'ZZZZ3', assetClass: 'stock', lastTradingDay: '2026-10-29', isin: null }],
      at,
    );
    expect((await trades.all()).get('ZZZZ3')?.isin).toBe('BRZZZZACNOR1');
    await expect(
      trades.record(
        [{ ticker: 'ZZZZ3', assetClass: 'stock', lastTradingDay: '2026-10-30', isin: 'inválido' }],
        at,
      ),
    ).rejects.toThrow();
    await prisma.negociacaoB3.deleteMany({ where: { ticker: 'ZZZZ3' } });
  });
});
