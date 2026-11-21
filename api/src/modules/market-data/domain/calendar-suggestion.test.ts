import { validateCalendarPublication } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { easterSunday, suggestNonTradingDays } from './calendar-suggestion.js';

const dates = (year: number) => suggestNonTradingDays(year).map((day) => day.date);

describe('Páscoa e feriados móveis (CA02)', () => {
  it('Páscoa em anos de referência, inclusive a mais cedo e a mais tarde do século', () => {
    expect(easterSunday(2000)).toBe('2000-04-23');
    expect(easterSunday(2008)).toBe('2008-03-23');
    expect(easterSunday(2019)).toBe('2019-04-21');
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2038)).toBe('2038-04-25');
  });

  it('2026: Carnaval 16 e 17/2, Sexta-feira Santa 3/4, Corpus Christi 4/6', () => {
    const movable = suggestNonTradingDays(2026).filter((day) =>
      ['Carnaval', 'Sexta-feira Santa', 'Corpus Christi'].includes(day.reason),
    );
    expect(movable.map((day) => day.date)).toEqual([
      '2026-02-16',
      '2026-02-17',
      '2026-04-03',
      '2026-06-04',
    ]);
  });

  it('2027: Carnaval 8 e 9/2, Sexta-feira Santa 26/3, Corpus Christi 27/5', () => {
    expect(dates(2027)).toEqual(
      expect.arrayContaining(['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27']),
    );
  });
});

describe('sugestão do ano', () => {
  it('2026 é igual ao calendário oficial publicado pela B3 (CA03)', () => {
    expect(suggestNonTradingDays(2026)).toEqual([
      { date: '2026-01-01', reason: 'Confraternização Universal' },
      { date: '2026-02-16', reason: 'Carnaval' },
      { date: '2026-02-17', reason: 'Carnaval' },
      { date: '2026-04-03', reason: 'Sexta-feira Santa' },
      { date: '2026-04-21', reason: 'Tiradentes' },
      { date: '2026-05-01', reason: 'Dia do Trabalho' },
      { date: '2026-06-04', reason: 'Corpus Christi' },
      { date: '2026-09-07', reason: 'Independência do Brasil' },
      { date: '2026-10-12', reason: 'Nossa Senhora Aparecida' },
      { date: '2026-11-02', reason: 'Finados' },
      { date: '2026-11-20', reason: 'Dia Nacional de Zumbi e da Consciência Negra' },
      { date: '2026-12-24', reason: 'Véspera de Natal' },
      { date: '2026-12-25', reason: 'Natal' },
      { date: '2026-12-31', reason: 'Último dia útil do ano' },
    ]);
  });

  it('2022 a 2025 são iguais aos dias sem pregão dos arquivos anuais da B3', () => {
    const b3 = (year: number, days: string) => days.split(' ').map((day) => `${year}-${day}`);
    expect(dates(2022)).toEqual(
      b3(2022, '02-28 03-01 04-15 04-21 06-16 09-07 10-12 11-02 11-15 12-30'),
    );
    expect(dates(2023)).toEqual(
      b3(2023, '02-20 02-21 04-07 04-21 05-01 06-08 09-07 10-12 11-02 11-15 12-25 12-29'),
    );
    expect(dates(2024)).toEqual(
      b3(2024, '01-01 02-12 02-13 03-29 05-01 05-30 11-15 11-20 12-24 12-25 12-31'),
    );
    expect(dates(2025)).toEqual(
      b3(2025, '01-01 03-03 03-04 04-18 04-21 05-01 06-19 11-20 12-24 12-25 12-31'),
    );
  });

  it('31/12 no fim de semana: a B3 fecha no último dia útil, a sexta antes', () => {
    const lastDay = (year: number) =>
      suggestNonTradingDays(year).filter((day) => day.reason === 'Último dia útil do ano');
    // Sábado
    expect(lastDay(2016)).toEqual([{ date: '2016-12-30', reason: 'Último dia útil do ano' }]);
    expect(lastDay(2022)).toEqual([{ date: '2022-12-30', reason: 'Último dia útil do ano' }]);
    // Domingo
    expect(lastDay(2017)).toEqual([{ date: '2017-12-29', reason: 'Último dia útil do ano' }]);
    expect(lastDay(2023)).toEqual([{ date: '2023-12-29', reason: 'Último dia útil do ano' }]);
    expect(lastDay(2028)).toEqual([{ date: '2028-12-29', reason: 'Último dia útil do ano' }]);
    // Dia de semana
    expect(lastDay(2027)).toEqual([{ date: '2027-12-31', reason: 'Último dia útil do ano' }]);
  });

  it('não sugere fim de semana (15/11/2026 é domingo)', () => {
    expect(dates(2026)).not.toContain('2026-11-15');
  });

  it('Consciência Negra só a partir de 2024', () => {
    expect(dates(2023)).not.toContain('2023-11-20');
    expect(dates(2024)).toContain('2024-11-20');
  });

  it('feriados no mesmo dia viram um só (2000: Sexta-feira Santa em 21/4)', () => {
    const april21 = suggestNonTradingDays(2000).filter((day) => day.date === '2000-04-21');
    expect(april21).toEqual([{ date: '2000-04-21', reason: 'Tiradentes e Sexta-feira Santa' }]);
  });

  it('passa na validação da publicação em todos os anos aceitos', () => {
    for (let year = 2000; year <= 2100; year += 1) {
      const result = validateCalendarPublication(year, {
        nonTradingDays: suggestNonTradingDays(year),
      });
      expect(result.success, String(year)).toBe(true);
    }
  });
});
