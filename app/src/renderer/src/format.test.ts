import { describe, expect, it } from 'vitest';
import {
  formatAxisPrice,
  formatCalendarDay,
  formatChange,
  formatCompactMoney,
  formatCount,
  formatDate,
  formatMoney,
  formatTickDate,
  formatWeekday,
  formatYears,
  initials,
  quoteMoment,
} from './format';

describe('ficha do ativo (SPEC-010)', () => {
  it('volume abreviado e quantidade de negócios no formato do idioma', () => {
    expect(formatCompactMoney('3265521701.00', 'pt-BR')).toMatch(/^R\$\s3,3\sbi$/);
    expect(formatCompactMoney('31213326.76', 'en')).toBe('R$31.2M');
    expect(formatCount(77862, 'pt-BR')).toBe('77.862');
    expect(formatCount(77862, 'en')).toBe('77,862');
  });

  it('preço do eixo: sem centavos com passo de R$ 1 ou mais', () => {
    expect(formatAxisPrice(52, 2, 'pt-BR')).toMatch(/^R\$\s52$/);
    expect(formatAxisPrice(8.85, 0.05, 'pt-BR')).toMatch(/^R\$\s8,85$/);
  });

  it('marcas de data: dia, mês (o ano no lugar de janeiro) e ano, sem desvio de fuso', () => {
    expect(formatTickDate('2026-10-30', 'day', 'pt-BR')).toBe('30/10');
    expect(formatTickDate('2026-10-30', 'day', 'en')).toBe('10/30');
    expect(formatTickDate('2026-11-03', 'month', 'pt-BR')).toBe('nov.');
    expect(formatTickDate('2026-01-02', 'month', 'pt-BR')).toBe('2026');
    expect(formatTickDate('2024-01-01', 'year', 'en')).toBe('2024');
  });
});

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

describe('formatYears (SPEC-008)', () => {
  it('junta os anos seguidos e separa os outros', () => {
    expect(formatYears([2016, 2017, 2018, 2019])).toBe('2016–2019');
    expect(formatYears([2021, 2016, 2017, 2024])).toBe('2016–2017, 2021, 2024');
    expect(formatYears([2026])).toBe('2026');
    expect(formatYears([])).toBe('');
  });
});

describe('cotações (SPEC-009)', () => {
  it('preço em reais no formato do idioma', () => {
    expect(formatMoney('52.71', 'pt-BR')).toMatch(/^R\$\s52,71$/);
    expect(formatMoney('1234.5', 'pt-BR')).toMatch(/^R\$\s1\.234,50$/);
    expect(formatMoney('52.71', 'en')).toBe('R$52.71');
  });

  it('variação com sinal, inclusive o de menos', () => {
    expect(formatChange('1.23', 'pt-BR')).toBe('+1,23%');
    expect(formatChange('-0.85', 'pt-BR')).toMatch(/^[-−]0,85%$/);
    expect(formatChange('0.00', 'pt-BR')).toBe('0,00%');
    expect(formatChange('0.98', 'en')).toBe('+0.98%');
  });

  it('horário de Brasília; de outro dia, com a data', () => {
    const now = new Date('2026-11-03T15:00:00Z'); // 12h em Brasília
    expect(quoteMoment('2026-11-03T14:31:30Z', 'pt-BR', now)).toEqual({
      today: true,
      time: '11:31',
      date: '03/11',
    });
    // 23h de 30/10 em Brasília (já 31/10 em UTC) é de outro dia.
    expect(quoteMoment('2026-10-31T02:00:00Z', 'pt-BR', now)).toMatchObject({
      today: false,
      time: '23:00',
      date: '30/10',
    });
  });
});
