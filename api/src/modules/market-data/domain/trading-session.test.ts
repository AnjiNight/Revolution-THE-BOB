import { describe, expect, it } from 'vitest';
import {
  brasiliaInstant,
  closingMinute,
  collectionMinutes,
  dueCollection,
  usDstEnd,
  usDstStart,
} from './trading-session.js';

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

describe('horário do pregão (SPEC-009 §4.2, CA02)', () => {
  it('horário de verão dos EUA: 2º domingo de março e 1º de novembro', () => {
    expect(usDstStart(2026)).toBe('2026-03-08');
    expect(usDstEnd(2026)).toBe('2026-11-01');
    expect(usDstStart(2027)).toBe('2027-03-14');
    expect(usDstEnd(2027)).toBe('2027-11-07');
  });

  it('a B3 fecha às 17h de 9/3 a 2/11 de 2026 e às 18h no resto do ano', () => {
    expect(hhmm(closingMinute('2026-03-06'))).toBe('18:00');
    expect(hhmm(closingMinute('2026-03-09'))).toBe('17:00');
    expect(hhmm(closingMinute('2026-10-30'))).toBe('17:00');
    expect(hhmm(closingMinute('2026-11-03'))).toBe('18:00');
    expect(hhmm(closingMinute('2026-12-30'))).toBe('18:00');
  });

  it('coletas de 30 em 30 minutos, das 10h30 até meia hora depois do fechamento', () => {
    const short = collectionMinutes('2026-10-30').map(hhmm);
    expect(short).toHaveLength(15);
    expect(short[0]).toBe('10:30');
    expect(short.at(-1)).toBe('17:30');
    const long = collectionMinutes('2026-11-03').map(hhmm);
    expect(long).toHaveLength(17);
    expect(long.at(-1)).toBe('18:30');
  });

  it('o horário é o de Brasília (UTC−3), não o da máquina', () => {
    expect(brasiliaInstant('2026-11-03', 10 * 60 + 30).toISOString()).toBe(
      '2026-11-03T13:30:00.000Z',
    );
  });

  it('coleta da vez: nenhuma antes das 10h30; depois, a mais recente que chegou na hora', () => {
    expect(dueCollection('2026-11-03', new Date('2026-11-03T13:29:59Z'))).toBeNull();
    expect(dueCollection('2026-11-03', new Date('2026-11-03T13:30:00Z'))).toBe(0);
    expect(dueCollection('2026-11-03', new Date('2026-11-03T13:59:00Z'))).toBe(0);
    expect(dueCollection('2026-11-03', new Date('2026-11-03T14:00:00Z'))).toBe(1);
    // 22h em Brasília: a última do dia (18h30) já passou.
    expect(dueCollection('2026-11-03', new Date('2026-11-04T01:00:00Z'))).toBe(16);
  });
});
