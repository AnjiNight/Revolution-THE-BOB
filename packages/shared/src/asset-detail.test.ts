import { describe, expect, it } from 'vitest';
import {
  isPriceHistoryPeriod,
  showsIntradayQuote,
  validatePriceHistoryQuery,
} from './asset-detail.js';
import type { AssetQuote } from './assets.js';

const quote = (at: string): AssetQuote => ({ price: '53.10', change: '0.74', at, source: 'brapi' });

describe('período do gráfico (SPEC-010)', () => {
  it('sem período, abre em 1 ano (decisão 2), ajustado pelos eventos (SPEC-042)', () => {
    expect(validatePriceHistoryQuery({})).toEqual({
      success: true,
      data: { period: '1y', adjusted: true },
    });
  });

  it('aceita os cinco períodos', () => {
    for (const period of ['1m', '6m', '1y', '5y', 'max']) {
      expect(validatePriceHistoryQuery({ period })).toEqual({
        success: true,
        data: { period, adjusted: true },
      });
      expect(isPriceHistoryPeriod(period)).toBe(true);
    }
  });

  it('SPEC-042: adjusted=false mostra como a B3 publicou; outro valor dá invalid_option', () => {
    expect(validatePriceHistoryQuery({ adjusted: 'false' })).toEqual({
      success: true,
      data: { period: '1y', adjusted: false },
    });
    expect(validatePriceHistoryQuery({ adjusted: 'sim' }).success).toBe(false);
  });

  it('outro período dá invalid_option', () => {
    expect(validatePriceHistoryQuery({ period: '2y' })).toEqual({
      success: false,
      fields: { period: 'invalid_option' },
    });
    expect(isPriceHistoryPeriod('2y')).toBe(false);
  });
});

describe('preço do topo da ficha (SPEC-010 §4.2)', () => {
  it('cotação do pregão de um dia depois do último fechamento: vale a cotação', () => {
    expect(showsIntradayQuote(quote('2026-11-03T17:30:00Z'), { date: '2026-10-30' })).toBe(true);
  });

  it('cotação do mesmo dia do último fechamento (fim de semana): vale o fechamento da B3', () => {
    expect(showsIntradayQuote(quote('2026-10-30T20:30:00Z'), { date: '2026-10-30' })).toBe(false);
  });

  it('o dia da cotação é o de Brasília: 23h30 de 30/10 em Brasília ainda é 30/10', () => {
    expect(showsIntradayQuote(quote('2026-10-31T02:30:00Z'), { date: '2026-10-30' })).toBe(false);
  });

  it('sem fechamento guardado, vale a cotação; sem cotação, o fechamento', () => {
    expect(showsIntradayQuote(quote('2026-11-03T17:30:00Z'), null)).toBe(true);
    expect(showsIntradayQuote(null, { date: '2026-10-30' })).toBe(false);
  });
});
