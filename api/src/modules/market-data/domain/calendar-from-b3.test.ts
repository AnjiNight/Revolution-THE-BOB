import { addDays, isoDate, isWeekend, yearOf, type IsoDate } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import {
  B3_FILE_REASON,
  B3CalendarFileError,
  calendarDifference,
  nonTradingDaysFromSessions,
} from './calendar-from-b3.js';
import { suggestNonTradingDays } from './calendar-suggestion.js';

/** Todos os dias úteis do ano, menos os `closed`: os pregões que o arquivo da B3 teria. */
function sessionsOf(year: number, closed: IsoDate[]): Set<IsoDate> {
  const sessions = new Set<IsoDate>();
  for (let day = isoDate(year, 1, 1); yearOf(day) === year; day = addDays(day, 1)) {
    if (!isWeekend(day) && !closed.includes(day)) sessions.add(day);
  }
  return sessions;
}

describe('calendário pelo arquivo da B3 (SPEC-005 §10)', () => {
  it('2019: os dias úteis sem pregão, inclusive os feriados de São Paulo, com o motivo (CA12)', () => {
    const suggested = suggestNonTradingDays(2019);
    const saoPaulo = ['2019-01-25', '2019-07-09', '2019-11-20'];
    const days = nonTradingDaysFromSessions(
      2019,
      sessionsOf(2019, [...suggested.map((day) => day.date), ...saoPaulo]),
    );

    expect(days.map((day) => day.date)).toEqual(
      [...suggested.map((day) => day.date), ...saoPaulo].sort(),
    );
    expect(days).toContainEqual({ date: '2019-01-25', reason: 'Aniversário de São Paulo' });
    expect(days).toContainEqual({ date: '2019-07-09', reason: 'Revolução Constitucionalista' });
    expect(days).toContainEqual({ date: '2019-11-20', reason: 'Consciência Negra em São Paulo' });
    expect(days).toContainEqual({ date: '2019-03-05', reason: 'Carnaval' });
  });

  it('dia sem pregão que ninguém previu ganha o motivo do arquivo', () => {
    const days = nonTradingDaysFromSessions(2020, sessionsOf(2020, ['2020-03-18']));
    expect(days).toEqual([{ date: '2020-03-18', reason: B3_FILE_REASON }]);
  });

  it('feriado da sugestão em que a B3 abriu não entra: vale o arquivo', () => {
    expect(nonTradingDaysFromSessions(2021, sessionsOf(2021, []))).toEqual([]);
  });

  it('arquivo que não serve de calendário não vira calendário (CA15)', () => {
    const few = new Set([...sessionsOf(2018, [])].slice(0, 150));
    expect(() => nonTradingDaysFromSessions(2018, few)).toThrow(B3CalendarFileError);
    expect(() => nonTradingDaysFromSessions(2018, few)).toThrow('só 150 pregões');

    const weekend = sessionsOf(2018, []).add('2018-06-16');
    expect(() => nonTradingDaysFromSessions(2018, weekend)).toThrow('fim de semana (2018-06-16)');

    const otherYear = sessionsOf(2018, []).add('2019-01-02');
    expect(() => nonTradingDaysFromSessions(2018, otherYear)).toThrow('pregão em 2019-01-02');
  });

  it('diferença entre o publicado e o arquivo, nos dois sentidos', () => {
    expect(
      calendarDifference(
        [
          { date: '2019-01-01', reason: 'x' },
          { date: '2019-04-19', reason: 'x' },
        ],
        [
          { date: '2019-01-01', reason: 'y' },
          { date: '2019-01-25', reason: 'y' },
        ],
      ),
    ).toEqual({ onlyPublished: ['2019-04-19'], onlyInFile: ['2019-01-25'] });
  });
});
