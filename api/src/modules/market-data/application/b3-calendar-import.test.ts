import { addDays, isoDate, isWeekend, yearOf, type IsoDate } from '@simulador/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';
import { cotahistLine } from '../testing/cotahist-fixtures.js';
import {
  FakeCotahistSource,
  InMemoryCalendarRepository,
  InMemoryTaskRuns,
} from '../testing/fakes.js';
import { B3CalendarImport } from './b3-calendar-import.js';

/** Arquivo anual com uma linha por pregão: todos os dias úteis, menos os da sugestão e os `extra`. */
function annualFile(year: number, extra: IsoDate[] = []): string[] {
  const closed = new Set([...suggestNonTradingDays(year).map((day) => day.date), ...extra]);
  const lines: string[] = [];
  for (let day = isoDate(year, 1, 1); yearOf(day) === year; day = addDays(day, 1)) {
    if (isWeekend(day) || closed.has(day)) continue;
    lines.push(
      cotahistLine({
        ticker: 'PETR4',
        date: day.replaceAll('-', ''),
        open: 1000,
        high: 1010,
        low: 990,
        average: 1000,
        close: 1000,
      }),
    );
  }
  return lines;
}

describe('calendário dos anos fechados pelo arquivo da B3 (SPEC-005 §10)', () => {
  let source: FakeCotahistSource;
  let calendars: InMemoryCalendarRepository;
  let runs: InMemoryTaskRuns;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let now: Date;
  let importer: B3CalendarImport;

  const publishByCollaborator = (year: number, extra: IsoDate[] = []) =>
    calendars.publish(
      {
        year,
        publishedAt: now,
        publishedBy: 'colab',
        nonTradingDays: [
          ...suggestNonTradingDays(year),
          ...extra.map((date) => ({ date, reason: 'x' })),
        ],
      },
      () => ({
        at: now,
        collaboratorId: 'colab',
        action: 'calendar_published',
        entity: 'calendar_year',
        entityId: String(year),
        details: {},
      }),
    );

  beforeEach(() => {
    source = new FakeCotahistSource();
    calendars = new InMemoryCalendarRepository();
    runs = new InMemoryTaskRuns();
    sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    now = new Date('2017-03-01T12:00:00Z'); // só 2016 está fechado
    importer = new B3CalendarImport({ source, calendars, runs, clock: () => now, sleep });
  });

  it('publica os anos fechados não publicados, sem colaborador, e nunca o ano atual (CA12, CA13, CA16)', async () => {
    now = new Date('2026-11-04T12:00:00Z');
    for (let year = 2016; year <= 2026; year += 1) source.annualFiles.set(year, annualFile(year));
    source.annualFiles.set(2019, annualFile(2019, ['2019-01-25', '2019-07-09', '2019-11-20']));

    const result = await importer.run();

    expect(result).toMatchObject({
      status: 'sucesso',
      records: 10,
      periodStart: '2016-01-01',
      periodEnd: '2025-12-31',
      errors: [],
    });
    expect(source.requests).toEqual([
      'A2016',
      'A2017',
      'A2018',
      'A2019',
      'A2020',
      'A2021',
      'A2022',
      'A2023',
      'A2024',
      'A2025',
    ]);
    expect(calendars.years.has(2026)).toBe(false);
    const y2019 = calendars.years.get(2019);
    expect(y2019).toMatchObject({ source: 'b3_file', publishedBy: null });
    expect(y2019?.nonTradingDays).toContainEqual({
      date: '2019-01-25',
      reason: 'Aniversário de São Paulo',
    });
    expect(calendars.audit.entries).toHaveLength(10);
    expect(calendars.audit.entries[0]).toMatchObject({
      action: 'calendar_imported',
      collaboratorId: null,
      entity: 'calendar_year',
      entityId: '2016',
      details: { before: null },
    });
    expect(runs.runs).toHaveLength(1);
    expect(runs.runs[0]?.task).toBe('calendario_b3');
  });

  it('sem ano para publicar nem conferir, não grava execução', async () => {
    source.annualFiles.set(2016, annualFile(2016));
    await importer.run();
    now = new Date('2017-03-02T12:00:00Z');

    expect(await importer.run()).toBeNull();
    expect(runs.runs).toHaveLength(1);
  });

  it('ano do colaborador não muda; a diferença vira erro, conferida uma vez por publicação (CA14)', async () => {
    source.annualFiles.set(2016, annualFile(2016, ['2016-01-25']));
    await publishByCollaborator(2016, ['2016-03-01']);
    now = new Date('2017-03-01T13:00:00Z');

    const result = await importer.run();
    expect(result).toMatchObject({ status: 'parcial', records: 0 });
    expect(result?.errors).toEqual([
      {
        message:
          '2016: sem pregão no calendário publicado e com pregão no arquivo: 2016-03-01; ' +
          'com pregão no calendário publicado e sem pregão no arquivo: 2016-01-25',
      },
    ]);
    expect(calendars.years.get(2016)).toMatchObject({
      source: 'collaborator',
      publishedBy: 'colab',
    });
    expect(calendars.audit.entries.map((entry) => entry.action)).toEqual(['calendar_published']);

    now = new Date('2017-03-01T14:00:00Z');
    expect(await importer.run()).toBeNull();

    // Republicou: confere de novo, agora sem diferença.
    now = new Date('2017-03-01T15:00:00Z');
    await calendars.publish(
      {
        year: 2016,
        publishedAt: now,
        publishedBy: 'colab',
        nonTradingDays: [
          ...suggestNonTradingDays(2016),
          { date: '2016-01-25', reason: 'Aniversário de São Paulo' },
        ],
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
    now = new Date('2017-03-01T16:00:00Z');
    expect(await importer.run()).toMatchObject({ status: 'sucesso', errors: [] });
  });

  it('arquivo ainda não publicado: aguardando_publicacao, sem erro (CA15)', async () => {
    expect(await importer.run()).toMatchObject({
      status: 'aguardando_publicacao',
      records: 0,
      errors: [],
    });
    expect(calendars.years.size).toBe(0);
  });

  it('arquivo cortado não publica (CA15)', async () => {
    source.annualFiles.set(2016, annualFile(2016).slice(0, 120));

    const result = await importer.run();
    expect(result).toMatchObject({ status: 'parcial', records: 0 });
    expect(result?.errors[0]?.message).toContain('só 120 pregões');
    expect(calendars.years.size).toBe(0);
  });

  it('B3 fora do ar: 3 novas tentativas e falha, sem publicar (CA15)', async () => {
    source.annualFiles.set(2016, 'fail');

    const result = await importer.run();
    expect(result).toMatchObject({ status: 'falha', records: 0 });
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(source.requests).toEqual(['A2016', 'A2016', 'A2016', 'A2016']);
    expect(calendars.years.size).toBe(0);
  });
});
