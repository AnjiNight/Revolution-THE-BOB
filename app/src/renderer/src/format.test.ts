import { describe, expect, it } from 'vitest';
import { formatCalendarDay, formatDate, formatWeekday, initials } from './format';

describe('initials', () => {
  it.each([
    ['Lucas Ferreira', 'LF'],
    ['Ana', 'A'],
    ['  maria da silva  ', 'MS'],
    ['', ''],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('formatDate', () => {
  const iso = '2026-10-08T14:32:00.000Z';

  it('segue o idioma da interface, não o do sistema', () => {
    expect(formatDate(iso, 'pt-BR')).toMatch(/de outubro de 2026/);
    expect(formatDate(iso, 'en')).toMatch(/October \d+, 2026/);
  });

  it('inclui o horário quando pedido', () => {
    expect(formatDate(iso, 'pt-BR', true)).toMatch(/\d{2}:\d{2}/);
  });
});

describe('dias do calendário (SPEC-005)', () => {
  it('mostram o próprio dia, sem desvio de fuso, no idioma da interface', () => {
    expect(formatCalendarDay('2026-02-16', 'pt-BR')).toMatch(/^16 de fev\.? de 2026$/);
    expect(formatCalendarDay('2026-01-01', 'en')).toBe('Jan 1, 2026');
    expect(formatWeekday('2026-02-16', 'pt-BR')).toBe('segunda-feira');
    expect(formatWeekday('2026-01-01', 'en')).toBe('Thursday');
  });
});
