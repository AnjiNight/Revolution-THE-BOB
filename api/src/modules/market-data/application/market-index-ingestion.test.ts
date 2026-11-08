import { addDays, isWeekend, type IsoDate } from '@simulador/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeMarketIndexSource,
  InMemoryCalendarRepository,
  InMemoryMarketIndexes,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { MarketIndexIngestion } from './market-index-ingestion.js';
import { IndexSourceError } from './ports.js';

/** Fechamento em todos os dias de semana de `from` a `to`, menos os `skip`. */
function publishCloses(
  source: FakeMarketIndexSource,
  code: string,
  from: IsoDate,
  to: IsoDate,
  skip: IsoDate[] = [],
) {
  const closes = source.closes.get(code) ?? new Map<IsoDate, string>();
  source.closes.set(code, closes);
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isWeekend(day) && !skip.includes(day)) closes.set(day, '120125.39');
  }
}

async function publishCalendar(calendars: InMemoryCalendarRepository, year: number, at: Date) {
  await calendars.publish(
    { year, publishedAt: at, publishedBy: 'colab', nonTradingDays: suggestNonTradingDays(year) },
    () => ({
      at,
      collaboratorId: 'colab',
      action: 'calendar_published',
      entity: 'calendar_year',
      entityId: String(year),
      details: {},
    }),
  );
}

describe('Ibovespa e IFIX pela B3 (SPEC-020)', () => {
  let source: FakeMarketIndexSource;
  let indexes: InMemoryMarketIndexes;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let now: Date;
  let ingestion: MarketIndexIngestion;

  beforeEach(() => {
    source = new FakeMarketIndexSource();
    indexes = new InMemoryMarketIndexes();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    now = new Date('2026-11-08T23:00:00Z'); // domingo, 20:00 em Brasília
    ingestion = new MarketIndexIngestion({
      source,
      indexes,
      runs,
      calendars,
      clock: () => now,
      sleep,
    });
  });

  it('banco vazio: os dois índices desde 2016, um pedido por ano a cada 2 s (CA01)', async () => {
    publishCloses(source, 'IBOV', '2016-01-04', '2026-11-06');
    publishCloses(source, 'IFIX', '2016-01-04', '2026-11-06');

    const result = await ingestion.run();

    expect(result).toMatchObject({
      status: 'sucesso',
      periodStart: '2016-01-04',
      periodEnd: '2026-11-06',
      errors: [],
      requests: 22,
    });
    expect(source.requests).toHaveLength(22);
    expect(source.requests[0]).toEqual({ code: 'IBOV', year: 2016 });
    expect(source.requests.at(-1)).toEqual({ code: 'IFIX', year: 2026 });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(Array<number>(21).fill(2_000));
    // Os anos fechados ficam marcados; o atual, não.
    expect([...(indexes.loaded.get('idx-ibov')?.keys() ?? [])]).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(indexes.closes.get('idx-ibov')?.get('2026-11-06')).toBe('120125.39');
    expect(runs.runs.map((run) => run.task)).toEqual(['indices_b3']);
  });

  it('depois: só o ano atual de cada índice; o mesmo dado não muda nada (CA01)', async () => {
    publishCloses(source, 'IBOV', '2016-01-04', '2026-11-06');
    publishCloses(source, 'IFIX', '2016-01-04', '2026-11-06');
    await ingestion.run();
    source.requests.length = 0;

    expect(await ingestion.run()).toMatchObject({ status: 'sucesso', records: 0 });
    expect(source.requests).toEqual([
      { code: 'IBOV', year: 2026 },
      { code: 'IFIX', year: 2026 },
    ]);
  });

  it('na primeira semana de janeiro, o ano anterior ainda não fica fechado', async () => {
    now = new Date('2027-01-05T23:00:00Z');
    publishCloses(source, 'IBOV', '2026-12-28', '2026-12-30');
    await ingestion.run();
    expect(indexes.loaded.get('idx-ibov')?.has(2026) ?? false).toBe(false);

    now = new Date('2027-01-08T23:00:00Z');
    await ingestion.run();
    expect(indexes.loaded.get('idx-ibov')?.get(2026)).toBe(3);
  });

  it('nova tentativa na falha da rede; falha de um ano não apaga o guardado (CA02)', async () => {
    publishCloses(source, 'IBOV', '2026-01-02', '2026-11-06');
    publishCloses(source, 'IFIX', '2026-01-02', '2026-11-06');
    for (const index of indexes.indexes) {
      for (let year = 2016; year <= 2025; year += 1) {
        await indexes.markYearLoaded(index.id, year, 1);
      }
    }
    await ingestion.run();

    source.failures = [new IndexSourceError('retryable', 'B3 respondeu 503')];
    expect(await ingestion.run()).toMatchObject({ status: 'sucesso', requests: 3 });

    source.failures = Array.from(
      { length: 4 },
      () => new IndexSourceError('retryable', 'B3 respondeu 503'),
    );
    const failed = await ingestion.run();
    expect(failed?.status).toBe('parcial');
    expect(failed?.errors[0]?.message).toBe('IBOV de 2026: B3 respondeu 503');
    expect(indexes.closes.get('idx-ibov')?.get('2026-11-06')).toBe('120125.39');

    source.failures = [new IndexSourceError('rejected', 'B3 recusou a consulta (404)')];
    expect(await ingestion.run()).toMatchObject({ status: 'parcial', requests: 2 });
  });

  it('recusa fim de semana, valor fora do formato e dia que não existe (CA02)', async () => {
    for (const index of indexes.indexes) {
      for (let year = 2016; year <= 2025; year += 1) {
        await indexes.markYearLoaded(index.id, year, 1);
      }
    }
    source.bodies.set('IBOV:2026', {
      results: [
        { day: 6, rateValue11: '168.498,45' },
        { day: 7, rateValue11: '168.000,00' },
        { day: 5, rateValue11: 'n/d' },
        { day: 31, rateValue11: '1,00' },
      ],
    });
    const result = await ingestion.run();
    expect(result?.errors.map((error) => error.message)).toEqual([
      'IBOV de 2026-11-05 fora do formato: "n/d"',
      'IBOV: dia 31/11/2026 não existe',
      'IBOV em 2026-11-07, fim de semana',
    ]);
    expect([...(indexes.closes.get('idx-ibov')?.entries() ?? [])]).toEqual([
      ['2026-11-06', '168498.45'],
    ]);
  });

  it('pregão publicado sem fechamento depois de 2 pregões vira erro; dia sem pregão, aviso (CA02)', async () => {
    now = new Date('2016-03-01T23:00:00Z');
    await publishCalendar(calendars, 2016, now);
    const holidays = suggestNonTradingDays(2016).map((day) => day.date);
    publishCloses(source, 'IBOV', '2016-01-04', '2016-02-29', [...holidays, '2016-02-17']);
    // A B3 com um valor no Carnaval (09/02/2016, sem pregão no calendário).
    source.closes.get('IBOV')?.set('2016-02-09', '40000.00');
    publishCloses(source, 'IFIX', '2016-01-04', '2016-02-29', holidays);

    const result = await ingestion.run();

    expect(result?.status).toBe('parcial');
    expect(result?.errors).toEqual([
      { message: 'pregão de 2016-02-17 sem fechamento do IBOV', date: '2016-02-17' },
      { message: 'IBOV em 2016-02-09, dia sem pregão no calendário', date: '2016-02-09' },
    ]);
    expect(indexes.closes.get('idx-ibov')?.get('2016-02-09')).toBe('40000.00');
  });

  it('uma execução por vez', async () => {
    publishCloses(source, 'IBOV', '2026-11-02', '2026-11-06');
    const [first, second] = await Promise.all([ingestion.run(), ingestion.run()]);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});
