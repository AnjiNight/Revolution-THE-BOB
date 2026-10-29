import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { HistoryIngestion } from '../application/history-ingestion.js';
import { HistoryStatusService } from '../application/history-status-service.js';
import type { DailyQuote } from '../application/ports.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import { FakeCotahistSource } from '../testing/fakes.js';
import { PrismaCalendarRepository } from './prisma-calendar-repository.js';
import { PrismaQuoteRepository, PrismaTaskRunRepository } from './prisma-quote-repository.js';

/**
 * Testes contra PostgreSQL real (CA04, CA05, CA08, CA11). Rodam só com TEST_DATABASE_URL apontando
 * para um banco com as migrações aplicadas. ATENÇÃO: apagam o catálogo, as cotações, o calendário e
 * as execuções desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '22222222-2222-4222-8222-222222222222';

describe.skipIf(!url)('histórico de cotações no PostgreSQL', () => {
  let prisma: PrismaClient;
  let quotes: PrismaQuoteRepository;
  let runs: PrismaTaskRunRepository;
  let calendars: PrismaCalendarRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    quotes = new PrismaQuoteRepository(prisma);
    runs = new PrismaTaskRunRepository(prisma);
    calendars = new PrismaCalendarRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE ativo, ano_calendario, execucao_tarefa CASCADE');
    const now = new Date();
    await prisma.ativo.createMany({
      data: [
        {
          id: PETR4,
          ticker: 'PETR4',
          nome: 'Petrobras PN',
          classe: 'acao',
          setor: 'petroleo_gas_biocombustiveis',
          atualizadoEm: now,
        },
        // Desativado continua sendo coletado (SPEC-008 §4).
        {
          id: MXRF11,
          ticker: 'MXRF11',
          nome: 'Maxi Renda',
          classe: 'fii',
          setor: 'recebiveis',
          atualizadoEm: now,
          desativadoEm: now,
        },
      ],
    });
  });

  const quote = (overrides: Partial<DailyQuote> = {}): DailyQuote => ({
    assetId: PETR4,
    date: '2026-10-28',
    open: '38.120000',
    high: '38.700000',
    low: '37.900000',
    close: '38.510000',
    average: '38.350000',
    trades: 45210,
    volume: '1587345123.99',
    ...overrides,
  });

  const stored = async () =>
    (await prisma.cotacaoDiaria.findMany({ orderBy: [{ ativoId: 'asc' }, { data: 'asc' }] })).map(
      (row) => ({
        assetId: row.ativoId,
        date: row.data.toISOString().slice(0, 10),
        close: row.fechamento.toFixed(6),
        volume: row.volume.toFixed(2),
        source: row.fonte,
      }),
    );

  it('lista todos os ativos, inclusive os desativados', async () => {
    expect((await quotes.listAssets()).map((asset) => asset.ticker)).toEqual(['MXRF11', 'PETR4']);
  });

  it('grava o lote com as datas e os decimais exatos, sem desvio de fuso', async () => {
    expect(
      await quotes.save(
        [quote(), quote({ date: '2026-10-27', close: '38.000001' })],
        'b3_cotahist',
      ),
    ).toBe(2);
    expect(await stored()).toEqual([
      {
        assetId: PETR4,
        date: '2026-10-27',
        close: '38.000001',
        volume: '1587345123.99',
        source: 'b3_cotahist',
      },
      {
        assetId: PETR4,
        date: '2026-10-28',
        close: '38.510000',
        volume: '1587345123.99',
        source: 'b3_cotahist',
      },
    ]);
    expect(await quotes.quoteRanges()).toEqual(
      new Map([[PETR4, { from: '2026-10-27', to: '2026-10-28' }]]),
    );
  });

  it('gravar de novo não duplica (CA04)', async () => {
    await quotes.save([quote()], 'b3_cotahist');
    await quotes.save([quote()], 'b3_cotahist');
    expect(await prisma.cotacaoDiaria.count()).toBe(1);
  });

  it('a B3 substitui outra fonte; outra fonte nunca substitui a B3 (CA05)', async () => {
    await quotes.save([quote({ close: '38.400000' })], 'brapi');
    expect((await stored())[0]).toMatchObject({ close: '38.400000', source: 'brapi' });
    await quotes.save([quote()], 'b3_cotahist');
    expect((await stored())[0]).toMatchObject({ close: '38.510000', source: 'b3_cotahist' });
    expect(await quotes.save([quote({ close: '38.600000' })], 'brapi')).toBe(0);
    expect((await stored())[0]).toMatchObject({ close: '38.510000', source: 'b3_cotahist' });
  });

  it('anos lidos por ativo, com o número de cotações', async () => {
    await quotes.markYearsLoaded(
      [
        { assetId: PETR4, year: 2025, records: 248 },
        { assetId: MXRF11, year: 2025, records: 0 },
      ],
      new Date(),
    );
    await quotes.markYearsLoaded([{ assetId: PETR4, year: 2025, records: 249 }], new Date());
    expect(await quotes.loadedYears()).toEqual(
      new Map([
        [PETR4, new Set([2025])],
        [MXRF11, new Set([2025])],
      ]),
    );
    expect((await prisma.cargaHistorico.findFirst({ where: { ativoId: PETR4 } }))?.registros).toBe(
      249,
    );
  });

  it('registra a execução com situação, totais, período e erros (CA08)', async () => {
    const id = await runs.start('historico_retroativo', new Date('2026-10-29T12:00:00Z'));
    const running = await prisma.execucaoTarefa.findUniqueOrThrow({ where: { id } });
    expect(running).toMatchObject({ terminadaEm: null, situacao: null });

    await runs.finish(
      id,
      {
        status: 'parcial',
        records: 10,
        affectedAssets: 2,
        periodStart: '2016-01-04',
        periodEnd: '2026-10-28',
        errors: [
          {
            message: 'cotação em 2025-12-31, dia sem pregão no calendário',
            assetId: PETR4,
            date: '2025-12-31',
          },
          { message: 'arquivo anual de 2017: B3 respondeu 503' },
        ],
      },
      new Date('2026-10-29T12:05:00Z'),
    );
    const run = await prisma.execucaoTarefa.findUniqueOrThrow({
      where: { id },
      include: { erros: { orderBy: { mensagem: 'asc' } } },
    });
    expect(run).toMatchObject({
      tarefa: 'historico_retroativo',
      situacao: 'parcial',
      registros: 10,
      ativosAfetados: 2,
      terminadaEm: new Date('2026-10-29T12:05:00Z'),
      periodoInicio: new Date('2016-01-04T00:00:00Z'),
      periodoFim: new Date('2026-10-28T00:00:00Z'),
    });
    expect(
      run.erros.map((e) => [e.mensagem, e.ativoId, e.data?.toISOString().slice(0, 10)]),
    ).toEqual([
      ['arquivo anual de 2017: B3 respondeu 503', null, undefined],
      ['cotação em 2025-12-31, dia sem pregão no calendário', PETR4, '2025-12-31'],
    ]);
  });

  it('carga completa com as tarefas, do arquivo da B3 até a situação na tela', async () => {
    for (const year of [2025, 2026]) {
      await calendars.publish(
        {
          year,
          publishedAt: new Date(),
          publishedBy: PETR4,
          nonTradingDays: suggestNonTradingDays(year),
        },
        () => ({
          at: new Date(),
          collaboratorId: PETR4,
          action: 'calendar_published',
          entity: 'calendar_year',
          entityId: String(year),
          details: {},
        }),
      );
    }
    const source = new FakeCotahistSource();
    const line = (ticker: string, date: string) => ({
      ticker,
      date,
      open: 1000,
      high: 1010,
      low: 990,
      average: 1000,
      close: 1005,
    });
    source.annualFiles.set(2025, [line('PETR4', '20251230')]);
    source.annualFiles.set(2026, [line('PETR4', '20261027'), line('ITUB4', '20261027')]);
    const clock = () => new Date('2026-10-29T12:00:00Z');
    const ingestion = new HistoryIngestion({
      source,
      quotes,
      runs,
      calendars,
      clock,
      sleep: () => Promise.resolve(),
    });

    expect(await ingestion.loadRetroactive()).toMatchObject({ status: 'sucesso', records: 2 });
    expect(await ingestion.loadRetroactive()).toBeNull();

    const overview = await new HistoryStatusService({ quotes, calendars, clock }).overview();
    expect(overview.byAsset.get(PETR4)).toEqual({
      status: 'loaded',
      from: '2025-12-30',
      to: '2026-10-27',
    });
    // MXRF11 (desativado) foi procurado nos dois anos e não apareceu.
    expect(overview.byAsset.get(MXRF11)).toEqual({ status: 'not_found', from: null, to: null });
    expect(overview.yearsWithoutCalendar).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ]);
    expect(await prisma.execucaoTarefa.count()).toBe(1);
  });

  describe('restrições do banco (CA11)', () => {
    const insert = (values: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO cotacao_diaria (ativo_id, data, abertura, maxima, minima, fechamento, preco_medio, negocios, volume, fonte)
         VALUES ('${PETR4}', ${values}, 'b3_cotahist')`,
      );

    it('não aceita fim de semana', async () => {
      await expect(insert(`'2026-10-24', 10, 11, 9, 10, 10, 1, 1`)).rejects.toThrow(
        /cotacao_diaria_dia_util_chk/,
      );
    });

    it('abertura e fechamento dentro da faixa do dia, preços positivos', async () => {
      await expect(insert(`'2026-10-28', 12, 11, 9, 10, 10, 1, 1`)).rejects.toThrow(
        /cotacao_diaria_precos_chk/,
      );
      await expect(insert(`'2026-10-28', 10, 11, 9, 8, 10, 1, 1`)).rejects.toThrow(
        /cotacao_diaria_precos_chk/,
      );
      await expect(insert(`'2026-10-28', 0, 0, 0, 0, 0, 1, 1`)).rejects.toThrow(
        /cotacao_diaria_precos_chk/,
      );
      await expect(insert(`'2026-10-28', 10, 11, 9, 10, 10, -1, 1`)).rejects.toThrow(
        /cotacao_diaria_negocios_chk/,
      );
    });

    it('cotação precisa de um ativo, e o ativo com cotações não pode ser apagado', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO cotacao_diaria (ativo_id, data, abertura, maxima, minima, fechamento, preco_medio, negocios, volume, fonte)
           VALUES ('33333333-3333-4333-8333-333333333333', '2026-10-28', 10, 11, 9, 10, 10, 1, 1, 'b3_cotahist')`,
        ),
      ).rejects.toThrow(/cotacao_diaria_ativo_id_fkey/);
      await insert(`'2026-10-28', 10, 11, 9, 10, 10, 1, 1`);
      await expect(prisma.ativo.delete({ where: { id: PETR4 } })).rejects.toThrow();
    });

    it('execução terminada sempre tem situação, e em andamento nunca tem', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO execucao_tarefa (tarefa, iniciada_em, terminada_em) VALUES ('fechamento_diario', now(), now())`,
        ),
      ).rejects.toThrow(/execucao_tarefa_situacao_chk/);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO execucao_tarefa (tarefa, iniciada_em, situacao) VALUES ('fechamento_diario', now(), 'sucesso')`,
        ),
      ).rejects.toThrow(/execucao_tarefa_situacao_chk/);
    });
  });
});
