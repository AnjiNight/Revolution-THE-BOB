import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeQuoteSource,
  InMemoryCalendarRepository,
  InMemoryIntradayQuoteRepository,
  InMemoryQuoteRepository,
  InMemoryTaskRuns,
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

describe('cotações do pregão (SPEC-009)', () => {
  let now: Date;
  let catalog: Array<{ id: string; ticker: string; active: boolean }>;
  let daily: InMemoryQuoteRepository;
  let intraday: InMemoryIntradayQuoteRepository;
  let source: FakeQuoteSource;
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

  /** Respostas normais da brapi para os dois ativos ativos, com o horário dado. */
  const answer = (quoteAt: Date) => {
    source.answers.set('PETR4', {
      price: '52.71',
      at: quoteAt,
      open: '52.45',
      high: '53.66',
      low: '52.36',
      previousClose: '52.2',
    });
    source.answers.set('MXRF11', {
      price: '8.88',
      at: quoteAt,
      open: '8.94',
      high: '8.96',
      low: '8.84',
      previousClose: '8.94',
    });
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
    source = new FakeQuoteSource(() => now);
    source.usage = { ...CYCLE };
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    collection = new IntradayCollection({
      source,
      quotes: intraday,
      daily,
      runs,
      calendars,
      monthlyQuota: 15_000,
      clock: () => now,
      sleep,
    });
    await publish(2026);
    answer(at('11:31'));
  });

  describe('quando coleta (CA02)', () => {
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
      answer(at('12:01'));
      expect(await collection.collect()).toMatchObject({ records: 2 });
      expect(runs.runs).toHaveLength(2);
    });
  });

  describe('o que grava (CA04, CA07)', () => {
    it('só os ativos ativos, com horário, fonte, nível, consultas e a cota informada', async () => {
      const result = await collection.collect();
      expect(source.requests).toEqual(['MXRF11', 'PETR4']); // VALE3 está desativado
      expect(result).toEqual({
        status: 'sucesso',
        records: 2,
        affectedAssets: 2,
        periodStart: '2026-11-03',
        periodEnd: '2026-11-03',
        errors: [],
        requests: 2,
        quota: { ...CYCLE, remaining: 13_998 },
      });
      expect([...intraday.quotes.values()]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: PETR4.id,
            at: at('11:31'),
            level: 'gratuito',
            source: 'brapi',
            price: '52.71',
            previousClose: '52.2',
          }),
        ]),
      );
      expect(runs.runs[0]?.task).toBe('cotacao_pregao');
    });

    it('a mesma cotação de novo não duplica', async () => {
      await collection.collect();
      now = at('12:05'); // a brapi ainda não atualizou: mesmo horário de antes
      const again = await collection.collect();
      expect(again).toMatchObject({ status: 'sucesso', records: 0 });
      expect(intraday.quotes.size).toBe(2);
    });

    it('cotação que ainda é do pregão anterior é ignorada, sem erro', async () => {
      // Fechamento de sexta (30/10; 2/11 foi feriado) já guardado: 52,71 para PETR4.
      await close(PETR4.id, '2026-10-30', '52.71');
      // A brapi ainda mostra o pregão de sexta (fechamento anterior 52,20, de quinta).
      const result = await collection.collect();
      expect(result).toMatchObject({ status: 'sucesso', records: 1, errors: [] });
      expect([...intraday.quotes.values()].map((quote) => quote.assetId)).toEqual([MXRF11.id]);
    });

    it('cotação com horário de outro dia é ignorada', async () => {
      answer(new Date('2026-10-30T20:00:00Z'));
      expect(await collection.collect()).toMatchObject({ records: 0, errors: [] });
    });

    it('dado estranho vira erro com o ativo, e os outros continuam', async () => {
      source.answers.set('PETR4', { price: '60.00', at: at('11:31'), high: '53.66', low: '52.36' });
      source.answers.set('MXRF11', { price: '8.88', at: new Date('2026-11-03T18:00:00Z') });
      const result = await collection.collect();
      expect(result?.status).toBe('parcial');
      expect(result?.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: PETR4.id,
            message: 'PETR4: preço acima da máxima do dia',
          }),
          expect.objectContaining({
            assetId: MXRF11.id,
            message: 'MXRF11: horário da cotação no futuro',
          }),
        ]),
      );
      expect(intraday.quotes.size).toBe(0);
    });
  });

  describe('falhas (CA05)', () => {
    it('erro de rede: uma nova tentativa depois de 10 segundos', async () => {
      source.answers.set('PETR4', [{ error: 'unavailable' }, { price: '52.71', at: at('11:31') }]);
      const result = await collection.collect();
      expect(sleep).toHaveBeenCalledWith(INTRADAY_RETRY_DELAY_MS);
      expect(source.requests).toEqual(['MXRF11', 'PETR4', 'PETR4']);
      expect(result).toMatchObject({ status: 'sucesso', records: 2, requests: 3 });
    });

    it('ticker não encontrado vira erro, e a coleta segue com os outros', async () => {
      source.answers.delete('MXRF11');
      const result = await collection.collect();
      expect(result).toMatchObject({ status: 'parcial', records: 1 });
      expect(result?.errors[0]).toMatchObject({ assetId: MXRF11.id });
    });

    it('429: a coleta para ali e termina como parcial', async () => {
      source.answers.set('PETR4', { error: 'rate_limited' });
      catalog = [MXRF11, PETR4, { id: 'a-wege3', ticker: 'WEGE3', active: true }];
      const result = await collection.collect();
      expect(source.requests).toEqual(['MXRF11', 'PETR4']); // WEGE3 não foi consultado
      expect(result).toMatchObject({ status: 'parcial', records: 1 });
    });

    it('cota esgotada: para até a cota renovar, e volta depois', async () => {
      const exhausted = { remaining: 0, limit: 15_000, resetsAt: new Date('2026-11-04T03:00:00Z') };
      source.answers.set('MXRF11', { error: 'quota_exhausted', usage: exhausted });
      expect(await collection.collect()).toMatchObject({
        status: 'cota_esgotada',
        quota: exhausted,
      });

      now = at('15:05');
      expect(await collection.collect()).toBeNull();
      expect(source.requests).toEqual(['MXRF11']);

      // Quarta, 4/11, depois de renovar.
      now = new Date('2026-11-04T14:05:00Z');
      answer(new Date('2026-11-04T14:01:00Z'));
      source.usage = { ...CYCLE };
      expect(await collection.collect()).toMatchObject({ status: 'sucesso', records: 2 });
    });

    it('enquanto a brapi falha, a última cotação válida continua valendo (RNF13)', async () => {
      await collection.collect();
      now = at('12:05');
      source.answers.set('PETR4', { error: 'unauthorized' });
      source.answers.set('MXRF11', { error: 'not_found' });
      expect(await collection.collect()).toMatchObject({ status: 'falha' });
      expect((await collection.latestQuotes()).get(PETR4.id)).toMatchObject({ price: '52.71' });
    });
  });

  describe('fechamento provisório (CA06)', () => {
    it('a última coleta do dia grava o preço final no fechamento diário, como brapi', async () => {
      now = at('18:35');
      answer(at('18:31'));
      const result = await collection.collect();
      expect(result?.records).toBe(4); // 2 cotações + 2 fechamentos provisórios
      expect(daily.quotes.get(`${PETR4.id}|2026-11-03`)).toEqual({
        assetId: PETR4.id,
        date: '2026-11-03',
        open: '52.45',
        high: '53.66',
        low: '52.36',
        close: '52.71',
        average: null,
        trades: null,
        volume: null,
        source: 'brapi',
      });
    });

    it('as coletas do meio do dia não gravam fechamento', async () => {
      await collection.collect();
      expect(daily.quotes.size).toBe(0);
    });
  });

  describe('regra da cota (CA03)', () => {
    it('com pouca cota no ciclo, pula as coletas do meio do dia e faz a do fechamento', async () => {
      // Cota informada numa coleta de ontem: 2.500 (a reserva é 1.500), para 50 ativos.
      catalog = Array.from({ length: 50 }, (_, i) => ({
        id: `a-${i}`,
        ticker: `TST${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`,
        active: true,
      }));
      for (const asset of catalog) source.answers.set(asset.ticker, { at: at('11:31') });
      const runId = await runs.start('cotacao_pregao', new Date('2026-10-30T21:00:00Z'));
      await runs.finish(
        runId,
        {
          status: 'sucesso',
          records: 50,
          affectedAssets: 50,
          periodStart: '2026-10-30',
          periodEnd: '2026-10-30',
          errors: [],
          requests: 50,
          quota: { ...CYCLE, remaining: 2_500 },
        },
        new Date('2026-10-30T21:01:00Z'),
      );

      expect(await collection.collect()).toBeNull(); // 11h30: pulada
      expect(source.requests).toEqual([]);

      now = at('18:35');
      for (const asset of catalog) source.answers.set(asset.ticker, { at: at('18:31') });
      expect(await collection.collect()).toMatchObject({ records: 100 });
      expect(source.requests).toHaveLength(50);
    });
  });

  describe('leitura (CA08, CA09, CA10)', () => {
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

    it('variação sobre o fechamento guardado; sem ele, sobre o que a brapi informa', async () => {
      await close(MXRF11.id, '2026-10-30', '9.00');
      await collection.collect();
      const latest = await collection.latestQuotes();
      // MXRF11: 8,88 sobre o fechamento guardado de 9,00; PETR4: 52,71 sobre os 52,20 da brapi.
      expect(latest.get(MXRF11.id)).toEqual({
        price: '8.88',
        change: '-1.33',
        at: at('11:31').toISOString(),
        source: 'brapi',
      });
      expect(latest.get(PETR4.id)?.change).toBe('0.98');
    });

    it('situação da coleta para o colaborador', async () => {
      await collection.collect();
      expect(await collection.status()).toEqual({
        lastRunAt: now.toISOString(),
        lastStatus: 'sucesso',
        intervalMinutes: 30,
        requestsUsed: 1_002,
        quota: 15_000,
        quotaResetsAt: CYCLE.resetsAt.toISOString(),
        quotaExhausted: false,
        tokenConfigured: true,
      });
    });

    it('sem nenhuma coleta, a conta é a do mês com a cota configurada', async () => {
      const status = await collection.status();
      expect(status).toMatchObject({
        lastRunAt: null,
        lastStatus: null,
        requestsUsed: 0,
        quota: 15_000,
        quotaResetsAt: null,
      });
    });
  });
});
