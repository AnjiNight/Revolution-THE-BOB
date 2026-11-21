import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { IntradayCollection } from '../application/intraday-collection.js';
import type { DailyQuote, IntradayQuote } from '../application/ports.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import { FakeListSource, listed } from '../testing/fakes.js';
import { PrismaCalendarRepository } from './prisma-calendar-repository.js';
import { PrismaIntradayQuoteRepository } from './prisma-intraday-quote-repository.js';
import { PrismaQuoteRepository, PrismaTaskRunRepository } from './prisma-quote-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-009: CA04, CA06, CA07, CA08, CA12). Rodam só com
 * TEST_DATABASE_URL apontando para um banco com as migrações aplicadas. ATENÇÃO: apagam o
 * catálogo, as cotações, o calendário e as execuções desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '22222222-2222-4222-8222-222222222222';
const VALE3 = '33333333-3333-4333-8333-333333333333';

/** Horário de Brasília de 3/11/2026, dia de pregão. */
const at = (brasilia: string, day = '2026-11-03') => new Date(`${day}T${brasilia}:00-03:00`);

describe.skipIf(!url)('cotações do pregão no PostgreSQL', () => {
  let prisma: PrismaClient;
  let intraday: PrismaIntradayQuoteRepository;
  let daily: PrismaQuoteRepository;
  let runs: PrismaTaskRunRepository;
  let calendars: PrismaCalendarRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    intraday = new PrismaIntradayQuoteRepository(prisma);
    daily = new PrismaQuoteRepository(prisma);
    runs = new PrismaTaskRunRepository(prisma);
    calendars = new PrismaCalendarRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE ativo, ano_calendario, execucao_tarefa CASCADE');
    const now = new Date();
    const asset = (id: string, ticker: string, classe: 'acao' | 'fii', setor: string) => ({
      id,
      ticker,
      nome: ticker,
      classe,
      setor,
      atualizadoEm: now,
    });
    await prisma.ativo.createMany({
      data: [
        asset(PETR4, 'PETR4', 'acao', 'petroleo_gas_biocombustiveis'),
        asset(MXRF11, 'MXRF11', 'fii', 'recebiveis'),
        { ...asset(VALE3, 'VALE3', 'acao', 'materiais_basicos'), desativadoEm: now },
      ],
    });
  });

  const quote = (overrides: Partial<IntradayQuote> = {}): IntradayQuote => ({
    assetId: PETR4,
    at: at('11:31'),
    level: 'gratuito',
    price: '52.71',
    open: '52.45',
    high: '53.66',
    low: '52.36',
    previousClose: '52.2',
    source: 'brapi',
    ...overrides,
  });

  const dailyQuote = (overrides: Partial<DailyQuote>): DailyQuote => ({
    assetId: PETR4,
    date: '2026-10-30',
    open: '50.000000',
    high: '51.000000',
    low: '49.000000',
    close: '50.500000',
    average: '50.200000',
    trades: 10,
    volume: '1000.00',
    ...overrides,
  });

  it('só os ativos ativos entram na coleta', async () => {
    expect((await intraday.activeAssets()).map((asset) => asset.ticker)).toEqual([
      'MXRF11',
      'PETR4',
    ]);
  });

  it('a mesma cotação não duplica; outro nível é outra cotação (CA04)', async () => {
    expect(
      await intraday.save([
        quote(),
        quote({ assetId: MXRF11, price: '8.88', high: '8.96', low: '8.84', open: '8.94' }),
      ]),
    ).toBe(2);
    expect(await intraday.save([quote()])).toBe(0);
    expect(await intraday.save([quote({ level: 'assinante' })])).toBe(1);
    expect(await prisma.cotacaoPregao.count()).toBe(3);
  });

  it('última de cada ativo, com o fechamento guardado antes do dia dela em Brasília', async () => {
    await daily.save([dailyQuote({ date: '2026-10-30', close: '50.500000' })], 'b3_cotahist');
    // 23h30 de 3/11 em Brasília já é 4/11 em UTC: o fechamento "anterior" é o de 30/10.
    await daily.save(
      [
        dailyQuote({
          date: '2026-11-03',
          close: '52.710000',
          average: null,
          trades: null,
          volume: null,
          high: '53.660000',
          low: '52.360000',
          open: '52.450000',
        }),
      ],
      'brapi',
    );
    await intraday.save([quote({ at: at('11:31') }), quote({ at: at('23:30'), price: '52.71' })]);
    const latest = await intraday.latest('gratuito');
    expect(latest.get(PETR4)).toEqual({
      assetId: PETR4,
      at: at('23:30'),
      level: 'gratuito',
      price: '52.71',
      open: '52.45',
      high: '53.66',
      low: '52.36',
      previousClose: '52.2',
      source: 'brapi',
      storedPreviousClose: '50.5',
    });
    expect(latest.has(MXRF11)).toBe(false);
    expect(await intraday.closesBefore('2026-11-04')).toEqual(new Map([[PETR4, '52.71']]));
    // SPEC-010: a de um ativo só é a mesma; outro nível não conta.
    await intraday.save([quote({ at: at('23:45'), level: 'assinante', price: '53.00' })]);
    expect(await intraday.latestOf('gratuito', PETR4)).toEqual(latest.get(PETR4));
    expect(await intraday.latestOf('gratuito', MXRF11)).toBeNull();
  });

  it('limpeza apaga só o que é mais antigo que o instante (CA08)', async () => {
    await intraday.save([quote({ at: at('11:31', '2026-09-30') }), quote()]);
    expect(await intraday.deleteBefore(at('00:00', '2026-10-04'))).toBe(1);
    expect(await prisma.cotacaoPregao.count()).toBe(1);
  });

  describe('restrições do banco (CA12)', () => {
    it('nunca em fim de semana no horário de Brasília', async () => {
      // Sexta 23h30 em Brasília (sábado em UTC) passa; sábado em Brasília, não.
      await intraday.save([quote({ at: at('23:30', '2026-11-06') })]);
      await expect(intraday.save([quote({ at: at('12:00', '2026-11-07') })])).rejects.toThrow(
        /cotacao_pregao_dia_util_chk/,
      );
    });

    it('preço positivo e dentro da faixa do dia', async () => {
      await expect(intraday.save([quote({ price: '60.00' })])).rejects.toThrow(
        /cotacao_pregao_precos_chk/,
      );
      await expect(intraday.save([quote({ price: '0', low: null })])).rejects.toThrow(
        /cotacao_pregao_precos_chk/,
      );
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO cotacao_pregao (ativo_id, momento, nivel, preco, fonte) VALUES ('${PETR4}', now(), 'premium', 10, 'brapi')`,
        ),
      ).rejects.toThrow(/nivel_cotacao/);
    });

    it('fechamento diário: vazios só no provisório da brapi; da B3, completos', async () => {
      const partial = { average: null, trades: null, volume: null };
      expect(await daily.save([dailyQuote(partial)], 'brapi')).toBe(1);
      await expect(
        daily.save([dailyQuote({ ...partial, date: '2026-10-29' })], 'b3_cotahist'),
      ).rejects.toThrow(/cotacao_diaria_b3_completa_chk/);
      // A B3 completa o dia do provisório e a situação do histórico só conta a B3.
      expect((await daily.quoteRanges()).size).toBe(0);
      expect(await daily.save([dailyQuote({})], 'b3_cotahist')).toBe(1);
      expect(await daily.quoteRanges()).toEqual(
        new Map([[PETR4, { from: '2026-10-30', to: '2026-10-30' }]]),
      );
    });

    it('execução guarda consultas e cota; consultas negativas são recusadas (CA07)', async () => {
      const id = await runs.start('cotacao_pregao', at('11:35'));
      await runs.finish(
        id,
        {
          status: 'cota_esgotada',
          records: 0,
          affectedAssets: 0,
          periodStart: null,
          periodEnd: null,
          errors: [{ message: 'cota do plano da brapi esgotada' }],
          requests: 3,
          quota: { remaining: 0, limit: 15_000, resetsAt: at('00:00', '2026-12-01') },
        },
        at('11:36'),
      );
      expect(await runs.lastRun('cotacao_pregao')).toEqual({
        startedAt: at('11:35'),
        finishedAt: at('11:36'),
        status: 'cota_esgotada',
        requests: 3,
        quota: { remaining: 0, limit: 15_000, resetsAt: at('00:00', '2026-12-01') },
        totals: null,
      });
      expect(await runs.requestsSince('cotacao_pregao', at('00:00'))).toBe(3);
      expect(await runs.runsSince('cotacao_pregao', at('00:00'))).toBe(1);
      expect(await runs.runsSince('cotacao_pregao', at('12:00'))).toBe(0);
      await expect(
        prisma.$executeRawUnsafe(`UPDATE execucao_tarefa SET consultas = -1 WHERE id = '${id}'`),
      ).rejects.toThrow(/execucao_tarefa_consultas_chk/);
    });
  });

  it('coleta de ponta a ponta sobre o banco pela lista (SPEC-040): cotações e situação', async () => {
    await calendars.publish(
      {
        year: 2026,
        publishedAt: new Date(),
        publishedBy: '0d9e1f7a-1111-4222-8333-444455556666',
        nonTradingDays: suggestNonTradingDays(2026),
      },
      () => ({
        at: new Date(),
        collaboratorId: '0d9e1f7a-1111-4222-8333-444455556666',
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: '2026',
        details: {},
      }),
    );
    // Fechamento de sexta guardado pela B3: a variação de hoje é sobre ele.
    await daily.save([dailyQuote({ close: '52.200000', high: '52.200000' })], 'b3_cotahist');
    let now = at('18:35'); // última coleta do dia (18h30)
    const source = new FakeListSource(false);
    source.answers.set('stock', [listed('PETR4', { price: '52.71', change: '0.98' })]);
    source.answers.set('fii', [listed('MXRF11', { price: '8.88', change: '-0.67' })]);
    const collection = new IntradayCollection({
      source,
      quotes: intraday,
      runs,
      calendars,
      monthlyQuota: 15_000,
      clock: () => now,
    });

    expect(await collection.collect()).toMatchObject({
      status: 'sucesso',
      records: 2,
      requests: 0,
      totals: { missing: 0, missingTickers: [] },
    });
    // Sem fechamento provisório: o dia de hoje chega com o arquivo da B3.
    expect(await prisma.cotacaoDiaria.count({ where: { fonte: 'brapi' } })).toBe(0);
    const saved = await prisma.cotacaoPregao.findFirstOrThrow({ where: { ativoId: PETR4 } });
    expect(saved).toMatchObject({
      momento: at('18:35'),
      aberturaDia: null,
      fechamentoAnterior: null,
    });

    now = at('19:00');
    expect(await collection.collect()).toBeNull();
    expect(await collection.status()).toMatchObject({
      lastStatus: 'sucesso',
      requestsUsed: 0,
      quota: 15_000,
      tokenConfigured: false,
      quotaExhausted: false,
      quotaCounted: false,
    });
    expect((await collection.latestQuotes()).get(PETR4)).toMatchObject({
      price: '52.71',
      change: '0.98',
      at: at('18:35').toISOString(),
    });
    const run = await prisma.execucaoTarefa.findFirstOrThrow({
      where: { tarefa: 'cotacao_pregao' },
    });
    expect(run.totais).toEqual({ missing: 0, missingTickers: [] });
  });
});
