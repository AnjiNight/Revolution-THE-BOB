import { describe, expect, it } from 'vitest';
import {
  compareDecimals,
  decimalFromJson,
  percentChange,
  sameAtCents,
  toMicros,
} from './decimal.js';

describe('decimais sem ponto flutuante (RNF12)', () => {
  it('lê o texto em milionésimos', () => {
    expect(toMicros('52.71')).toBe(52_710_000n);
    expect(toMicros('8.880000')).toBe(8_880_000n);
    expect(toMicros('-0.5')).toBe(-500_000n);
    expect(() => toMicros('1.2345678')).toThrow(RangeError);
    expect(() => toMicros('abc')).toThrow(RangeError);
  });

  it('variação com 2 casas, meio para cima (RB13), com o sinal', () => {
    // Números da brapi de verdade (02/11/2026): PETR4 52,20 → 52,71; MXRF11 8,94 → 8,88.
    expect(percentChange('52.71', '52.2')).toBe('0.98');
    expect(percentChange('8.88', '8.94')).toBe('-0.67');
    expect(percentChange('10.00', '10.00')).toBe('0.00');
    // 0,125% vira 0,13% e −0,125% vira −0,13%.
    expect(percentChange('10.0125', '10')).toBe('0.13');
    expect(percentChange('9.9875', '10')).toBe('-0.13');
    expect(() => percentChange('1', '0')).toThrow(RangeError);
  });

  it('compara em centavos', () => {
    expect(sameAtCents('52.710000', '52.71')).toBe(true);
    expect(sameAtCents('52.705', '52.71')).toBe(true);
    expect(sameAtCents('52.70', '52.71')).toBe(false);
    expect(compareDecimals('8.88', '8.9')).toBe(-1);
    expect(compareDecimals('9', '9.000')).toBe(0);
  });

  it('número do JSON vira texto pelo próprio número, e o estranho é recusado', () => {
    expect(decimalFromJson(52.71)).toBe('52.71');
    expect(decimalFromJson(0.1)).toBe('0.1');
    expect(decimalFromJson(1e-7)).toBeNull();
    expect(decimalFromJson(Number.NaN)).toBeNull();
    expect(decimalFromJson('52.71')).toBeNull();
    expect(decimalFromJson(null)).toBeNull();
  });
});
