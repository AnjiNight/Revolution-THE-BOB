import { describe, expect, it } from 'vitest';
import { indexDateProblem, parseIndexYear } from './b3-index.js';

/** Uma linha de `results` como a B3 manda: o dia e um valor por mês (`null` sem pregão). */
function row(day: number, values: Record<number, unknown>) {
  const result: Record<string, unknown> = { day };
  for (let month = 1; month <= 12; month += 1) result[`rateValue${month}`] = values[month] ?? null;
  return result;
}

describe('estatísticas históricas da B3 (SPEC-020 §4.4)', () => {
  it('lê o dia × mês em texto, sem ponto flutuante, em ordem de data', () => {
    const body = {
      min: { day: 0 },
      max: { day: 0 },
      results: [
        row(2, { 1: '120.125,39', 12: null }),
        row(4, { 1: '42.141,03' }),
        row(30, { 12: '161.125,37' }),
        row(5, { 3: '999,99' }),
      ],
    };
    expect(parseIndexYear('IBOV', 2025, body)).toEqual({
      closes: [
        { date: '2025-01-02', value: '120125.39' },
        { date: '2025-01-04', value: '42141.03' },
        { date: '2025-03-05', value: '999.99' },
        { date: '2025-12-30', value: '161125.37' },
      ],
      problems: [],
    });
  });

  it('valor fora do formato, zero e dia que não existe viram problema, sem derrubar o resto', () => {
    const body = {
      results: [
        row(3, { 1: '1.398,21', 2: '1398.21', 3: '0,00' }),
        row(31, { 2: '1.400,00' }),
        row(7, { 4: 1398.21 }),
      ],
    };
    expect(parseIndexYear('IFIX', 2016, body)).toEqual({
      closes: [{ date: '2016-01-03', value: '1398.21' }],
      problems: [
        'IFIX de 2016-02-03 fora do formato: "1398.21"',
        'IFIX de 2016-03-03 igual a zero',
        'IFIX: dia 31/2/2016 não existe',
        'IFIX de 2016-04-07 fora do formato: "1398.21"',
      ],
    });
  });

  it('resposta sem "results" é um problema', () => {
    expect(parseIndexYear('IBOV', 2026, { message: 'erro' })).toEqual({
      closes: [],
      problems: ['IBOV de 2026: resposta da B3 sem "results"'],
    });
  });

  it('recusa fim de semana, data futura e antes de 04/01/2016', () => {
    expect(indexDateProblem('IBOV', '2026-11-07', '2026-11-08')).toBe(
      'IBOV em 2026-11-07, fim de semana',
    );
    expect(indexDateProblem('IBOV', '2026-11-09', '2026-11-08')).toBe(
      'IBOV em 2026-11-09, data futura',
    );
    expect(indexDateProblem('IBOV', '2015-12-30', '2026-11-08')).toBe(
      'IBOV em 2015-12-30, antes de 2016-01-04',
    );
    expect(indexDateProblem('IBOV', '2026-11-06', '2026-11-08')).toBeNull();
  });
});
