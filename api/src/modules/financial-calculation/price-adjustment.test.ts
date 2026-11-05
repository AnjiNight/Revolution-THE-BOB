import { describe, expect, it } from 'vitest';
import { sumDecimals } from './decimal.js';
import { adjustPrices, eventBetween, multiplierText, shareMultiplier } from './price-adjustment.js';
import { summarizePeriod } from './price-history.js';

describe('ajuste pelos eventos corporativos (SPEC-042)', () => {
  it('fator da B3: desdobramento e bonificação em %, grupamento como razão (Magalu)', () => {
    expect(multiplierText({ kind: 'desdobramento', factor: '300' })).toBe('4');
    expect(multiplierText({ kind: 'desdobramento', factor: '100' })).toBe('2');
    expect(multiplierText({ kind: 'grupamento', factor: '0.1' })).toBe('0.1');
    expect(multiplierText({ kind: 'bonificacao', factor: '5' })).toBe('1.05');
    expect(() => shareMultiplier({ kind: 'grupamento', factor: '0' })).toThrow();
  });

  it('preços até a data com divididos pelo multiplicador acumulado; depois, iguais (CA03)', () => {
    const points = [
      { date: '2020-10-09', close: '100.00' },
      { date: '2020-10-13', close: '100.00' }, // data com do desdobramento de 1 para 4
      { date: '2020-10-14', close: '25.20' },
      { date: '2024-05-24', close: '1.50' }, // data com do grupamento de 10 para 1
      { date: '2024-05-27', close: '15.10' },
    ];
    const events = [
      { kind: 'desdobramento' as const, exDate: '2020-10-13', factor: '300' },
      { kind: 'grupamento' as const, exDate: '2024-05-24', factor: '0.1' },
    ];
    expect(adjustPrices(points, events)).toEqual([
      // ÷ 4 (desdobramento) ÷ 0,1 (grupamento) = × 2,5
      { date: '2020-10-09', close: '250.000000' },
      { date: '2020-10-13', close: '250.000000' },
      { date: '2020-10-14', close: '252.000000' },
      { date: '2024-05-24', close: '15.000000' },
      { date: '2024-05-27', close: '15.10' },
    ]);
  });

  it('sem eventos, os preços ficam como estão', () => {
    const points = [{ date: '2026-10-28', close: '52.20' }];
    expect(adjustPrices(points, [])).toEqual(points);
  });

  it('salto explicado por evento não é marcado; sem ajuste, a variação não é calculada (CA04)', () => {
    const points = [
      { date: '2026-10-28', close: '104.40' },
      { date: '2026-10-29', close: '52.20' },
    ];
    const events = [{ exDate: '2026-10-28' }];
    expect(eventBetween(events, '2026-10-28', '2026-10-29')).toBe(true);
    expect(summarizePeriod(points).jumps).toHaveLength(1);
    const explained = summarizePeriod(points, { events, adjusted: false });
    expect(explained.jumps).toEqual([]);
    expect(explained.summary?.change).toBeNull();
  });
});

describe('soma dos proventos (SPEC-042)', () => {
  it('soma com até 10 casas, sem arredondar', () => {
    expect(sumDecimals(['0.20250435', '0.67407131'])).toBe('0.87657566');
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimals(['1'])).toBe('1');
    expect(() => sumDecimals(['abc'])).toThrow();
  });
});
