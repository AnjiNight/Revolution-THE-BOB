import { describe, expect, it } from 'vitest';
import {
  addDays,
  CALENDAR_PATHS,
  calendarPath,
  calendarYearsToCheck,
  isIsoDate,
  isoDateInBrasilia,
  isWeekend,
  NON_TRADING_DAYS_MAX,
  parseCalendarYear,
  validateCalendarPublication,
  weekdayOf,
} from './calendar.js';

describe('datas do calendário', () => {
  it('reconhece só datas AAAA-MM-DD que existem', () => {
    expect(isIsoDate('2026-02-17')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-2-17')).toBe(false);
    expect(isIsoDate('17/02/2026')).toBe(false);
    expect(isIsoDate('2026-02-17T00:00:00Z')).toBe(false);
  });

  it('dia da semana e fim de semana sem depender do fuso da máquina', () => {
    expect(weekdayOf('2026-10-22')).toBe(4); // quinta-feira
    expect(isWeekend('2026-10-24')).toBe(true);
    expect(isWeekend('2026-10-25')).toBe(true);
    expect(isWeekend('2026-10-26')).toBe(false);
  });

  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('"hoje" é o dia em Brasília, mesmo perto da meia-noite em UTC (CA08)', () => {
    // 31/12/2026 23h30 em Brasília (UTC−3) já é 1º/1/2027 02h30 em UTC.
    expect(isoDateInBrasilia(new Date('2027-01-01T02:30:00Z'))).toBe('2026-12-31');
    expect(isoDateInBrasilia(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });

  it('ano da rota: só de 2000 a 2100', () => {
    expect(parseCalendarYear('2026')).toBe(2026);
    expect(parseCalendarYear('2000')).toBe(2000);
    expect(parseCalendarYear('2100')).toBe(2100);
    expect(parseCalendarYear('1999')).toBeNull();
    expect(parseCalendarYear('2101')).toBeNull();
    expect(parseCalendarYear('26')).toBeNull();
    expect(parseCalendarYear('2026.5')).toBeNull();
    expect(parseCalendarYear(undefined)).toBeNull();
  });

  it('monta o caminho da rota com o ano', () => {
    expect(calendarPath(CALENDAR_PATHS.suggestion, 2027)).toBe(
      '/api/collaborator/calendar/2027/suggestion',
    );
  });
});

describe('anos que o Início do colaborador confere (CA09)', () => {
  it('antes de dezembro, só o ano atual', () => {
    expect(calendarYearsToCheck('2026-11-30')).toEqual([2026]);
  });

  it('de 1º a 31 de dezembro, também o ano seguinte', () => {
    expect(calendarYearsToCheck('2026-12-01')).toEqual([2026, 2027]);
    expect(calendarYearsToCheck('2026-12-31')).toEqual([2026, 2027]);
  });

  it('em janeiro, o ano que começou volta a ser o atual', () => {
    expect(calendarYearsToCheck('2027-01-01')).toEqual([2027]);
  });
});

describe('validação da lista de um ano (CA05)', () => {
  it('aceita, apara os textos e ordena por data', () => {
    const result = validateCalendarPublication(2026, {
      nonTradingDays: [
        { date: '2026-12-25', reason: ' Natal ' },
        { date: '2026-01-01', reason: 'Confraternização Universal' },
      ],
    });
    expect(result).toEqual({
      success: true,
      data: {
        nonTradingDays: [
          { date: '2026-01-01', reason: 'Confraternização Universal' },
          { date: '2026-12-25', reason: 'Natal' },
        ],
      },
    });
  });

  it('lista vazia é válida (ano sem feriado em dia útil)', () => {
    expect(validateCalendarPublication(2026, { nonTradingDays: [] }).success).toBe(true);
  });

  it('aponta o problema de cada dia', () => {
    const result = validateCalendarPublication(2026, {
      nonTradingDays: [
        { date: '2026-04-03', reason: 'Sexta-feira Santa' },
        { date: '2027-01-01', reason: 'Outro ano' },
        { date: '2026-10-24', reason: 'Sábado' },
        { date: '2026-04-03', reason: 'Repetido' },
        { date: '2026-02-30', reason: 'Não existe' },
        { date: '', reason: '' },
        { date: '2026-06-04', reason: 'x'.repeat(101) },
        'não é objeto',
      ],
    });
    expect(result).toEqual({
      success: false,
      fields: {
        'nonTradingDays.1.date': 'wrong_year',
        'nonTradingDays.2.date': 'weekend',
        'nonTradingDays.3.date': 'duplicate',
        'nonTradingDays.4.date': 'invalid_date',
        'nonTradingDays.5.date': 'required',
        'nonTradingDays.5.reason': 'required',
        'nonTradingDays.6.reason': 'too_long',
        'nonTradingDays.7.date': 'required',
        'nonTradingDays.7.reason': 'required',
      },
    });
  });

  it('exige a lista e limita o tamanho', () => {
    expect(validateCalendarPublication(2026, {})).toEqual({
      success: false,
      fields: { nonTradingDays: 'required' },
    });
    expect(validateCalendarPublication(2026, null)).toEqual({
      success: false,
      fields: { nonTradingDays: 'required' },
    });
    const many = Array.from({ length: NON_TRADING_DAYS_MAX + 1 }, () => ({
      date: '2026-01-02',
      reason: 'x',
    }));
    expect(validateCalendarPublication(2026, { nonTradingDays: many })).toEqual({
      success: false,
      fields: { nonTradingDays: 'too_long' },
    });
  });
});
