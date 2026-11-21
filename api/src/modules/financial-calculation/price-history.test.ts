import type { PricePoint } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { isPriceJump, periodStart, summarizePeriod } from './price-history.js';

const points = (...pairs: Array<[string, string]>): PricePoint[] =>
  pairs.map(([date, close]) => ({ date, close }));

describe('início do período (SPEC-010 §4.2)', () => {
  it('o mesmo dia, N meses antes do último fechamento', () => {
    expect(periodStart('2026-10-30', '1m')).toBe('2026-09-30');
    expect(periodStart('2026-10-30', '6m')).toBe('2026-04-30');
    expect(periodStart('2026-10-30', '1y')).toBe('2025-10-30');
    expect(periodStart('2026-10-30', '5y')).toBe('2021-10-30');
  });

  it('atravessa a virada do ano', () => {
    expect(periodStart('2026-01-15', '1m')).toBe('2025-12-15');
    expect(periodStart('2026-03-10', '6m')).toBe('2025-09-10');
  });

  it('sem o mesmo dia no mês, o último dia do mês (inclusive em ano bissexto)', () => {
    expect(periodStart('2026-03-31', '1m')).toBe('2026-02-28');
    expect(periodStart('2024-03-31', '1m')).toBe('2024-02-29');
    expect(periodStart('2026-08-31', '6m')).toBe('2026-02-28');
  });

  it('Tudo não tem início: vale o primeiro fechamento guardado', () => {
    expect(periodStart('2026-10-30', 'max')).toBeNull();
  });
});

describe('saltos (SPEC-010, decisão 1)', () => {
  it('desdobramento do BBAS3 em 16/04/2024: 56,46 → 27,91', () => {
    expect(isPriceJump('56.46', '27.91')).toBe(true);
  });

  it('1,8 vez ou mais, para cima ou para baixo', () => {
    expect(isPriceJump('10', '18')).toBe(true);
    expect(isPriceJump('18', '10')).toBe(true);
    expect(isPriceJump('10', '17.99')).toBe(false);
    expect(isPriceJump('17.99', '10')).toBe(false);
    expect(isPriceJump('1.32', '13.15')).toBe(true);
  });
});

describe('resumo do período', () => {
  it('variação do primeiro ao último, mínima e máxima com as datas', () => {
    const { summary, jumps } = summarizePeriod(
      points(
        ['2026-10-26', '50.00'],
        ['2026-10-27', '49.10'],
        ['2026-10-28', '53.66'],
        ['2026-10-29', '52.20'],
        ['2026-10-30', '52.71'],
      ),
    );
    expect(jumps).toEqual([]);
    expect(summary).toEqual({
      change: '5.42',
      min: { date: '2026-10-27', price: '49.10' },
      max: { date: '2026-10-28', price: '53.66' },
    });
  });

  it('no empate, a data mais antiga', () => {
    const { summary } = summarizePeriod(
      points(['2026-10-28', '10.00'], ['2026-10-29', '12.00'], ['2026-10-30', '10.00']),
    );
    expect(summary?.min).toEqual({ date: '2026-10-28', price: '10.00' });
  });

  it('variação arredondada meio para cima, com 2 casas (RB13)', () => {
    // (10,00125 − 10) / 10 = 0,0125% → 0,01
    expect(
      summarizePeriod(points(['2026-10-29', '10'], ['2026-10-30', '10.00125'])).summary?.change,
    ).toBe('0.01');
    expect(
      summarizePeriod(points(['2026-10-29', '30'], ['2026-10-30', '20'])).summary?.change,
    ).toBe('-33.33');
  });

  it('com salto no período: a variação não é calculada e o salto é listado', () => {
    const { summary, jumps } = summarizePeriod(
      points(['2024-04-12', '57.10'], ['2024-04-15', '56.46'], ['2024-04-16', '27.91']),
    );
    expect(summary?.change).toBeNull();
    expect(summary?.max).toEqual({ date: '2024-04-12', price: '57.10' });
    expect(jumps).toEqual([{ date: '2024-04-16', change: '-50.57' }]);
  });

  it('menos de dois pregões: sem resumo', () => {
    expect(summarizePeriod([])).toEqual({ summary: null, jumps: [] });
    expect(summarizePeriod(points(['2026-10-30', '52.71']))).toEqual({ summary: null, jumps: [] });
  });
});
