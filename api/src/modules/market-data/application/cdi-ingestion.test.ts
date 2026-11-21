import { addDays, isWeekend, type IsoDate } from '@simulador/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import {
  FakeIndexSource,
  InMemoryCalendarRepository,
  InMemoryIndexRates,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { CdiIngestion } from './cdi-ingestion.js';
import { IndexSourceError } from './ports.js';

/** CDI publicado em todos os dias de semana de `from` a `to`, menos os `skip`. */
function publishRows(source: FakeIndexSource, from: IsoDate, to: IsoDate, skip: IsoDate[] = []) {
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isWeekend(day) && !skip.includes(day)) source.rows.set(day, '0.050788');
  }
}

describe('série do CDI (SPEC-007)', () => {
  let source: FakeIndexSource;
  let rates: InMemoryIndexRates;
  let runs: InMemoryTaskRuns;
  let calendars: InMemoryCalendarRepository;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let now: Date;
  let cdi: CdiIngestion;

  beforeEach(() => {
    source = new FakeIndexSource();
    rates = new InMemoryIndexRates();
    runs = new InMemoryTaskRuns();
    calendars = new InMemoryCalendarRepository();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    now = new Date('2026-11-04T12:00:00Z'); // 09:00 em Brasília
    cdi = new CdiIngestion({ source, rates, runs, calendars, clock: () => now, sleep });
  });

  it('banco vazio: carrega de 04/01/2016 até o último publicado, uma consulta por ano (CA02)', async () => {
    publishRows(source, '2016-01-04', '2026-11-03');

    const result = await cdi.run();

    expect(result).toMatchObject({
      status: 'sucesso',
      records: source.rows.size,
      periodStart: '2016-01-04',
      periodEnd: '2026-11-03',
      errors: [],
      requests: 11,
    });
    expect(source.requests.map((r) => `${r.from}..${r.to}`)).toEqual([
      '2016-01-04..2016-12-31',
      ...[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map(
        (y) => `${y}-01-01..${y}-12-31`,
      ),
      '2026-01-01..2026-11-04',
    ]);
    expect(source.requests.every((r) => r.code === 12)).toBe(true);
    expect([...rates.loaded.keys()]).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(rates.rates.get('2026-11-03')).toBe('0.050788');
    expect(runs.runs.map((run) => run.task)).toEqual(['cdi_diario']);
  });

  it('série em dia: não consulta nem grava execução; no dia seguinte, só o que falta (CA03, CA08)', async () => {
    publishRows(source, '2016-01-04', '2026-11-03');
    await cdi.run();

    expect(await cdi.run()).toBeNull();
    expect(runs.runs).toHaveLength(1);

    now = new Date('2026-11-05T12:00:00Z');
    source.rows.set('2026-11-04', '0.050788');
    source.requests.length = 0;
    expect(await cdi.run()).toMatchObject({ status: 'sucesso', records: 1 });
    expect(source.requests).toEqual([{ code: 12, from: '2026-11-04', to: '2026-11-05' }]);
  });

  it('nada publicado ainda: aguardando_publicacao, sem erro (CA07)', async () => {
    publishRows(source, '2016-01-04', '2026-11-03');
    await cdi.run();
    now = new Date('2026-11-05T12:00:00Z'); // o CDI de 04/11 ainda não saiu

    expect(await cdi.run()).toMatchObject({
      status: 'aguardando_publicacao',
      records: 0,
      errors: [],
    });
  });

  it('rodar de novo não duplica; valor revisado pelo Banco Central substitui (CA04)', async () => {
    now = new Date('2016-03-01T12:00:00Z');
    publishRows(source, '2016-01-04', '2016-02-29');
    await cdi.run();
    rates.rates.delete('2016-02-29'); // força a consulta de novo, do dia 29

    source.rows.set('2016-02-29', '0.050788');
    expect(await cdi.run()).toMatchObject({ records: 1 });

    // A mesma consulta duas vezes não muda nada; um valor diferente muda só ele.
    expect(await rates.save('idx-cdi', [{ date: '2016-02-29', value: '0.050788' }])).toBe(0);
    expect(await rates.save('idx-cdi', [{ date: '2016-02-29', value: '0.05' }])).toBe(1);
    expect(rates.rates.get('2016-02-29')).toBe('0.050000');
  });

  it('grava 24/12 e 31/12 (sem pregão); recusa fim de semana e valor estranho, sem parar (CA05)', async () => {
    now = new Date('2026-01-05T12:00:00Z');
    publishRows(source, '2025-12-22', '2026-01-02');
    source.extraRows = [
      { data: '27/12/2025', valor: '0.055131' },
      { data: '29/12/2025', valor: '1.5' },
    ];
    rates.loaded.set(2016, 0);
    for (let year = 2017; year <= 2024; year += 1) rates.loaded.set(year, 0);

    const result = await cdi.run();

    expect(rates.rates.has('2025-12-24')).toBe(true);
    expect(rates.rates.has('2025-12-31')).toBe(true);
    expect(rates.rates.has('2025-12-27')).toBe(false);
    expect(result?.status).toBe('parcial');
    expect(result?.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'CDI em 2025-12-27, fim de semana',
        expect.stringContaining('fora de 0 a 1%'),
      ]),
    );
  });

  it('pregão publicado sem CDI depois de 3 dias úteis vira erro com a data (CA06)', async () => {
    now = new Date('2016-03-01T12:00:00Z');
    await calendars.publish(
      {
        year: 2016,
        publishedAt: now,
        publishedBy: 'colab',
        nonTradingDays: suggestNonTradingDays(2016),
      },
      () => ({
        at: now,
        collaboratorId: 'colab',
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: '2016',
        details: {},
      }),
    );
    const holidays = suggestNonTradingDays(2016).map((day) => day.date);
    publishRows(source, '2016-01-04', '2016-02-29', [...holidays, '2016-01-20']);

    const result = await cdi.run();

    expect(result?.status).toBe('parcial');
    expect(result?.errors).toEqual([
      { message: 'pregão de 2016-01-20 sem CDI', date: '2016-01-20' },
    ]);
    expect(rates.rates.size).toBeGreaterThan(30);
  });

  it('Banco Central fora do ar: 3 novas tentativas e falha, sem mexer no guardado (CA07)', async () => {
    now = new Date('2016-03-01T12:00:00Z');
    source.failures = Array.from(
      { length: 4 },
      () => new IndexSourceError('retryable', 'fora do ar'),
    );

    const result = await cdi.run();

    expect(result).toMatchObject({ status: 'falha', records: 0, requests: 4 });
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(rates.rates.size).toBe(0);
  });

  it('consulta recusada (406) não tem nova tentativa', async () => {
    now = new Date('2016-03-01T12:00:00Z');
    source.failures = [new IndexSourceError('rejected', 'Banco Central recusou a consulta (406)')];

    expect(await cdi.run()).toMatchObject({ status: 'falha', requests: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('duas execuções juntas (09:00 e 18:00 ao iniciar): só uma roda', async () => {
    now = new Date('2016-03-01T12:00:00Z');
    publishRows(source, '2016-01-04', '2016-02-29');

    const [first, second] = await Promise.all([cdi.run(), cdi.run()]);

    expect(first?.status).toBe('sucesso');
    expect(second).toBeNull();
    expect(runs.runs).toHaveLength(1);
  });
});
