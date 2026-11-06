import { describe, expect, it } from 'vitest';
import {
  businessDaysBefore,
  businessDaysBetween,
  parseSgsRows,
  previousWeekday,
  rateDateProblem,
  toSgsDate,
  tradingDaysWithoutRate,
} from './cdi.js';

const noHolidays = () => false;

describe('regras da série do CDI (SPEC-007)', () => {
  it('lê a resposta do SGS em data e valor decimal, pelo texto (CA01)', () => {
    expect(
      parseSgsRows([
        { data: '03/11/2026', valor: '0.050788' },
        { data: '24/12/2025', valor: '0.055131' },
        { data: '05/01/2016', valor: '0' },
      ]),
    ).toEqual({
      rates: [
        { date: '2026-11-03', value: '0.050788' },
        { date: '2025-12-24', value: '0.055131' },
        { date: '2016-01-05', value: '0' },
      ],
      problems: [],
    });
  });

  it('linha fora do formato vira problema, sem derrubar as outras (CA05)', () => {
    const { rates, problems } = parseSgsRows([
      { data: '2026-11-03', valor: '0.05' },
      { data: '31/02/2026', valor: '0.05' },
      { data: '02/03/2026', valor: '1.2' },
      { data: '03/03/2026', valor: '-0.01' },
      { data: '04/03/2026', valor: '0.0507881' },
      { data: '05/03/2026', valor: 0.05 },
      'lixo',
      { data: '06/03/2026', valor: '0.050788' },
    ]);
    expect(rates).toEqual([{ date: '2026-03-06', value: '0.050788' }]);
    expect(problems).toHaveLength(7);
    expect(problems[0]).toContain('data inválida');
    expect(problems[2]).toContain('fora de 0 a 1%');
  });

  it('data do SGS no formato da consulta', () => {
    expect(toSgsDate('2016-01-04')).toBe('04/01/2016');
  });

  it('recusa fim de semana, futuro e antes da janela; aceita 24/12 e 31/12 (CA05)', () => {
    expect(rateDateProblem('2025-12-24', '2026-11-04')).toBeNull();
    expect(rateDateProblem('2025-12-31', '2026-11-04')).toBeNull();
    expect(rateDateProblem('2026-10-31', '2026-11-04')).toContain('fim de semana');
    expect(rateDateProblem('2026-11-05', '2026-11-04')).toContain('futura');
    expect(rateDateProblem('2015-12-30', '2026-11-04')).toContain('antes de 2016-01-04');
  });

  it('dia de semana anterior e contas de dias úteis, com os feriados publicados', () => {
    expect(previousWeekday('2026-11-09')).toBe('2026-11-06'); // segunda → sexta
    expect(previousWeekday('2026-11-04')).toBe('2026-11-03');
    const finados = (date: string) => date === '2026-11-02';
    expect(businessDaysBetween('2026-10-28', '2026-11-04', noHolidays)).toBe(4);
    expect(businessDaysBetween('2026-10-28', '2026-11-04', finados)).toBe(3);
    expect(businessDaysBefore('2026-11-04', 3, finados)).toBe('2026-10-29');
  });

  it('pregões publicados sem CDI, só até a data pedida (CA06)', () => {
    const published = [{ year: 2026, nonTradingDays: ['2026-11-02'] }];
    const rates = new Set(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30', '2026-11-03']);
    const missing = tradingDaysWithoutRate(published, rates, '2026-11-03');
    expect(missing).toContain('2026-10-28');
    expect(missing).not.toContain('2026-11-02'); // feriado
    expect(missing).not.toContain('2026-10-31'); // sábado
    expect(missing).not.toContain('2026-11-04'); // depois da data pedida
  });
});
