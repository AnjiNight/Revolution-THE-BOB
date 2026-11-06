import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeListSource,
  InMemoryCalendarRepository,
  InMemoryIntradayQuoteRepository,
  InMemoryQuoteRepository,
  InMemoryTaskRuns,
  listed,
} from '../testing/fakes.js';
import { INTRADAY_RETRY_DELAY_MS, IntradayCollection } from './intraday-collection.js';
import type { QuoteUsage } from './ports.js';

const MXRF11 = { id: 'a-mxrf11', ticker: 'MXRF11', active: true };
const PETR4 = { id: 'a-petr4', ticker: 'PETR4', active: true };
const VALE3 = { id: 'a-vale3', ticker: 'VALE3', active: false };

/** Terça, 3/11/2026, dia de pregão, fechamento às 18h (17 coletas: 10h30 a 18h30). */
const at = (brasilia: string) => new Date(`2026-11-03T${brasilia}:00-03:00`);

const CYCLE: QuoteUsage = {
  remaining: 14_000,
  limit: 15_000,
  resetsAt: new Date('2026-12-01T03:00:00Z'),
};

describe('cotações do pregão pela lista da brapi (SPEC-009 e 040)', () => {
  let now: Date;
  let catalog: Array<{ id: string; ticker: string; active: boolean }>;
  let daily: InMemoryQuoteRepository;
  let intraday: InMemoryIntradayQuoteRepository;
  let source: FakeListSource;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let collection: IntradayCollection;

  const publish = (year: number) =>
    calendars.publish(
      {
        year,
        publishedAt: new Date(),
        publishedBy: 'colab',
        nonTradingDays: suggestNonTradingDays(year),
      },
      () => ({
        at: new Date(),
        collaboratorId: 'colab',
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: String(year),
        details: {},
      }),
    );

  /** Respostas normais da lista: ações (com VALE3, desativado no catálogo) e FIIs. */
  const answer = (petr4 = '52.71', mxrf11 = '8.88') => {
    source.answers.set('stock', [
      listed('PETR4', { price: petr4, change: '0.98' }),
      listed('VALE3', { price: '61.30', change: '-1.42' }),
      listed('ITUB4', { price: '38.66', change: '-0.08' }),
    ]);
    source.answers.set('fii', [listed('MXRF11', { price: mxrf11, change: '-0.67' })]);
  };

  /** Fechamento guardado de um pregão anterior (como a B3 grava). */
  const close = (assetId: string, date: string, value: string) =>
    daily.save(
      [
        {
          assetId,
          date,
          open: value,
          high: value,
          low: value,
          close: value,
          average: value,
          trades: 1,
          volume: '1.00',
        },
      ],
      'b3_cotahist',
    );

  beforeEach(async () => {
    now = at('11:35');
    catalog = [MXRF11, PETR4, VALE3];
    daily = new InMemoryQuoteRepository();
    intraday = new InMemoryIntradayQuoteRepository(() => catalog, daily);
    source = new FakeListSource();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    collection = new IntradayCollection({
      source,
      quotes: intraday,
      runs,
      calendars,
      monthlyQuota: 15_000,
      clock: () => now,
      sleep,
    });
    await publish(2026);
    answer();
  });

  describe('quando coleta (CA02 da SPEC-009)', () => {
    it('fim de semana, feriado e antes das 10h30: nenhuma consulta', async () => {
      now = new Date('2026-11-07T15:00:00Z'); // sábado
      expect(await collection.collect()).toBeNull();
      now = new Date('2026-11-02T15:00:00Z'); // Finados
      expect(await collection.collect()).toBeNull();
      now = at('10:29');
      expect(await collection.collect()).toBeNull();
      expect(source.requests).toEqual([]);
      expect(runs.runs).toEqual([]);
    });

    it('ano sem calendário: não consulta e registra o motivo uma vez por dia', async () => {
      calendars.years.clear();
      const result = await collection.collect();
      expect(result).toMatchObject({
        status: 'falha',
        requests: 0,
        errors: [
          { message: expect.stringContaining('calendário de pregão de 2026 não publicado') },
        ],
      });
      now = at('15:05');
      expect(await collection.collect()).toBeNull();
      expect(source.requests).toEqual([]);
      expect(runs.runs).toHaveLength(1);
    });

    it('cada coleta roda uma vez só; a seguinte roda de novo', async () => {
      expect(await collection.collect()).not.toBeNull();
      now = at('11:50');
      expect(await collection.collect()).toBeNull();
      now = at('12:05');
      expect(await collection.collect()).toMatchObject({ records: 2 });
      expect(runs.runs).toHaveLength(2);
    });
  });

  describe('o que grava (CA08 da SPEC-040)', () => {
    it('duas consultas (ações e FIIs) para todos os ativos ativos, com o horário da coleta', async () => {
      const result = await collection.collect();
      expect(source.requests).toEqual(['stock', 'fii']);
      expect(result).toEqual({
        status: 'sucesso',
        records: 2, // VALE3 está desativado; ITUB4 não está no catálogo
        affectedAssets: 2,
        periodStart: '2026-11-03',
        periodEnd: '2026-11-03',
        errors: [],
        requests: 0, // a lista não desconta da cota
        quota: null,
        totals: { missing: 0, missingTickers: [] },
      });
      expect([...intraday.quotes.values()]).toEqual(
        expect.arrayContaining([
          {
            assetId: PETR4.id,
            at: at('11:35'),
            level: 'gratuito',
            price: '52.71',
            open: null,
            high: null,
            low: null,
            previousClose: null,
            source: 'brapi',
          },
        ]),
      );
      expect(runs.runs[0]?.task).toBe('cotacao_pregao');
    });

    it('o horário da coleta vai em segundos inteiros', async () => {
      now = new Date(at('11:35').getTime() + 12_345);
      await collection.collect();
      expect([...intraday.quotes.values()][0]?.at).toEqual(
        new Date(at('11:35').getTime() + 12_000),
      );
    });

    it('ativo do catálogo que não veio na lista é contado, sem erro', async () => {
      catalog = [...catalog, { id: 'a-brdt3', ticker: 'BRDT3', active: true }];
      const result = await collection.collect();
      expect(result).toMatchObject({
        status: 'sucesso',
        records: 2,
        errors: [],
        totals: { missing: 1, missingTickers: ['BRDT3'] },
      });
    });

    it('papel da lista sem preço não grava nada', async () => {
      source.answers.set('fii', [listed('MXRF11', { price: null })]);
      expect(await collection.collect()).toMatchObject({ status: 'sucesso', records: 1 });
    });

    it('a lista ainda com o pregão de ontem é ignorada, sem erro', async () => {
      // Fechamento de sexta (30/10; 2/11 foi feriado) guardado: 52,71 para PETR4. A lista ainda
      // mostra 52,71 com a variação de sexta (0,98%): é o preço de ontem.
      await close(PETR4.id, '2026-10-30', '52.71');
      const result = await collection.collect();
      expect(result).toMatchObject({ status: 'sucesso', records: 1, errors: [] });
      expect([...intraday.quotes.values()].map((quote) => quote.assetId)).toEqual([MXRF11.id]);
    });

    it('preço que volta ao fechamento de ontem, com variação zero, é de hoje', async () => {
      await close(PETR4.id, '2026-10-30', '52.71');
      source.answers.set('stock', [listed('PETR4', { price: '52.71', change: '0' })]);
      expect(await collection.collect()).toMatchObject({ records: 2 });
    });
  });

  describe('falhas (CA05 da SPEC-009)', () => {
    it('erro de rede: uma nova tentativa depois de 10 segundos', async () => {
      source.queue('stock', { error: 'unavailable' });
      const result = await collection.collect();
      expect(sleep).toHaveBeenCalledWith(INTRADAY_RETRY_DELAY_MS);
      expect(source.requests).toEqual(['stock', 'stock', 'fii']);
      expect(result).toMatchObject({ status: 'sucesso', records: 2 });
    });

    it('uma lista que falha vira erro, e a outra é gravada', async () => {
      source.answers.set('fii', { error: 'bad_response' });
      const result = await collection.collect();
      expect(result).toMatchObject({ status: 'parcial', records: 1 });
      expect(result?.errors[0]?.message).toContain('lista de FIIs');
    });

    it('429: a coleta para ali; parcial se a outra lista já tinha respondido', async () => {
      source.answers.set('fii', { error: 'rate_limited' });
      expect(await collection.collect()).toMatchObject({ status: 'parcial', records: 1 });

      now = at('12:05');
      source.answers.set('stock', { error: 'rate_limited' });
      expect(await collection.collect()).toMatchObject({ status: 'falha', records: 0 });
      // Na segunda, a de FIIs nem foi consultada.
      expect(source.requests).toEqual(['stock', 'fii', 'stock']);
    });

    it('cota esgotada (se a brapi passar a descontar a lista): para até renovar', async () => {
      const exhausted = { remaining: 0, limit: 15_000, resetsAt: new Date('2026-11-04T03:00:00Z') };
      source.answers.set('stock', { error: 'quota_exhausted', usage: exhausted });
      expect(await collection.collect()).toMatchObject({
        status: 'cota_esgotada',
        quota: exhausted,
        requests: 1,
      });

      now = at('15:05');
      expect(await collection.collect()).toBeNull();
      expect(source.requests).toEqual(['stock']);

      // Quarta, 4/11, depois de renovar.
      now = new Date('2026-11-04T14:05:00Z');
      answer();
      expect(await collection.collect()).toMatchObject({ status: 'sucesso', records: 2 });
    });

    it('enquanto a brapi falha, a última cotação válida continua valendo (RNF13)', async () => {
      await collection.collect();
      now = at('12:05');
      source.answers.set('stock', { error: 'unauthorized' });
      source.answers.set('fii', { error: 'not_found' });
      expect(await collection.collect()).toMatchObject({ status: 'falha' });
      expect((await collection.latestQuotes()).get(PETR4.id)).toMatchObject({ price: '52.71' });
    });
  });

  describe('fechamento (SPEC-040: sem fechamento provisório)', () => {
    it('a última coleta do dia grava só a cotação: o dia chega com o arquivo da B3', async () => {
      now = at('18:35');
      expect(await collection.collect()).toMatchObject({ records: 2 });
      expect(daily.quotes.size).toBe(0);
    });
  });

  describe('regra da cota (proteção, §4.2)', () => {
    it('se a brapi descontar a lista, a cota conta 2 consultas por coleta', async () => {
      source.usage = { ...CYCLE };
      const result = await collection.collect();
      expect(result).toMatchObject({ requests: 2, quota: { ...CYCLE, remaining: 13_998 } });
    });

    it('com a cota quase no fim, pula as coletas do meio do dia e faz a do fechamento', async () => {
      // Cota informada numa coleta de ontem: só 1.540 (a reserva é 1.500), 40 para o ciclo.
      const runId = await runs.start('cotacao_pregao', new Date('2026-10-30T21:00:00Z'));
      await runs.finish(
        runId,
        {
          status: 'sucesso',
          records: 2,
          affectedAssets: 2,
          periodStart: '2026-10-30',
          periodEnd: '2026-10-30',
          errors: [],
          requests: 2,
          quota: { ...CYCLE, remaining: 1_540 },
        },
        new Date('2026-10-30T21:01:00Z'),
      );

      expect(await collection.collect()).toBeNull(); // 11h30: pulada
      expect(source.requests).toEqual([]);

      now = at('18:35');
      expect(await collection.collect()).toMatchObject({ records: 2 });
      expect(source.requests).toEqual(['stock', 'fii']);
    });
  });

  describe('leitura', () => {
    it('limpeza: apaga as cotações do pregão com mais de 30 dias', async () => {
      await intraday.save([
        {
          assetId: PETR4.id,
          at: new Date('2026-09-30T15:00:00Z'),
          level: 'gratuito',
          price: '40.00',
          open: null,
          high: null,
          low: null,
          previousClose: null,
          source: 'brapi',
        },
      ]);
      await collection.collect();
      expect(await collection.cleanup()).toBe(1);
      expect(intraday.quotes.size).toBe(2);
    });

    it('variação sobre o fechamento guardado da B3; sem ele, sem variação', async () => {
      await close(MXRF11.id, '2026-10-30', '9.00');
      await collection.collect();
      const latest = await collection.latestQuotes();
      expect(latest.get(MXRF11.id)).toEqual({
        price: '8.88',
        change: '-1.33',
        at: at('11:35').toISOString(),
        source: 'brapi',
      });
      expect(latest.get(PETR4.id)?.change).toBeNull();
    });

    it('situação da coleta: a lista não gasta a cota', async () => {
      await collection.collect();
      expect(await collection.status()).toEqual({
        lastRunAt: now.toISOString(),
        lastStatus: 'sucesso',
        intervalMinutes: 30,
        requestsUsed: 0,
        quota: 15_000,
        quotaResetsAt: null,
        quotaExhausted: false,
        tokenConfigured: true,
        quotaCounted: false,
      });
    });

    it('situação quando a brapi desconta: uso do ciclo informado', async () => {
      source.usage = { ...CYCLE };
      await collection.collect();
      expect(await collection.status()).toMatchObject({
        requestsUsed: 1_002,
        quotaResetsAt: CYCLE.resetsAt.toISOString(),
        quotaCounted: true,
      });
    });

    it('sem token, a coleta funciona igual (§4.3, T3)', async () => {
      source = new FakeListSource(false);
      answer();
      collection = new IntradayCollection({
        source,
        quotes: intraday,
        runs,
        calendars,
        monthlyQuota: 15_000,
        clock: () => now,
        sleep,
      });
      expect(await collection.collect()).toMatchObject({ status: 'sucesso', records: 2 });
      expect((await collection.status()).tokenConfigured).toBe(false);
    });
  });
});
