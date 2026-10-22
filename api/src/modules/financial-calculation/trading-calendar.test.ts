import { describe, expect, it } from 'vitest';
import { CalendarNotPublishedError, TradingCalendar } from './trading-calendar.js';

/** Calendário oficial da B3 para 2026 (dias úteis sem pregão) e o começo de 2027. */
const B3_2026 = [
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-04-03',
  '2026-04-21',
  '2026-05-01',
  '2026-06-04',
  '2026-09-07',
  '2026-10-12',
  '2026-11-02',
  '2026-11-20',
  '2026-12-24',
  '2026-12-25',
  '2026-12-31',
];

const calendar = new TradingCalendar([
  { year: 2026, nonTradingDays: B3_2026 },
  { year: 2027, nonTradingDays: ['2027-01-01'] },
]);

describe('regras de pregão (CA01)', () => {
  it('sábado e domingo nunca têm pregão', () => {
    expect(calendar.isTradingDay('2026-10-24')).toBe(false);
    expect(calendar.isTradingDay('2026-10-25')).toBe(false);
  });

  it('dia da lista não tem pregão; outro dia útil tem', () => {
    expect(calendar.isTradingDay('2026-02-16')).toBe(false);
    expect(calendar.isTradingDay('2026-02-18')).toBe(true); // Quarta de Cinzas: abre às 13h
    expect(calendar.isTradingDay('2026-10-22')).toBe(true);
  });

  it('a contagem inclui as duas pontas', () => {
    expect(calendar.countTradingDays('2026-10-19', '2026-10-23')).toBe(5);
    expect(calendar.countTradingDays('2026-10-22', '2026-10-22')).toBe(1);
    expect(calendar.countTradingDays('2026-10-24', '2026-10-25')).toBe(0);
    expect(calendar.countTradingDays('2026-10-23', '2026-10-19')).toBe(0);
  });

  it('conta os pregões do ano inteiro de 2026', () => {
    // 261 dias úteis menos os 14 da lista.
    expect(calendar.countTradingDays('2026-01-01', '2026-12-31')).toBe(247);
  });

  it('pregão anterior e próximo pulam fim de semana e feriado', () => {
    expect(calendar.nextTradingDay('2026-02-13')).toBe('2026-02-18'); // sexta → quarta de Cinzas
    expect(calendar.previousTradingDay('2026-02-18')).toBe('2026-02-13');
    expect(calendar.nextTradingDay('2026-10-22')).toBe('2026-10-23'); // a própria data não conta
    expect(calendar.previousTradingDay('2026-10-26')).toBe('2026-10-23');
  });

  it('pregão anterior e próximo atravessam a virada do ano', () => {
    expect(calendar.nextTradingDay('2026-12-23')).toBe('2026-12-28'); // pula 24, 25 e o fim de semana
    expect(calendar.nextTradingDay('2026-12-30')).toBe('2027-01-04');
    expect(calendar.previousTradingDay('2027-01-04')).toBe('2026-12-30');
  });
});

describe('ano não publicado (CA07)', () => {
  it('qualquer regra que precise do ano falha com "calendário não publicado"', () => {
    expect(() => calendar.isTradingDay('2028-03-01')).toThrow(CalendarNotPublishedError);
    expect(() => calendar.countTradingDays('2027-12-20', '2028-01-10')).toThrow(
      CalendarNotPublishedError,
    );
    try {
      calendar.nextTradingDay('2027-12-31');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'calendar_not_published', year: 2028 });
    }
  });

  it('fim de semana não precisa do ano publicado', () => {
    expect(calendar.isTradingDay('2028-03-04')).toBe(false);
  });

  it('recusa data em outro formato', () => {
    expect(() => calendar.isTradingDay('22/10/2026')).toThrow(RangeError);
  });
});
