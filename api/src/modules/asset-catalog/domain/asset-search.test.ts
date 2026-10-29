import { describe, expect, it } from 'vitest';
import { searchAssets } from './asset-search.js';

const catalog = [
  { ticker: 'PETR4', name: 'Petrobras PN' },
  { ticker: 'PETR3', name: 'Petrobras ON' },
  { ticker: 'PRIO3', name: 'PRIO (antiga PetroRio)' },
  { ticker: 'SMTO3', name: 'São Martinho (açúcar e etanol)' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN' },
  { ticker: 'MXRF11', name: 'Maxi Renda FII' },
  { ticker: 'VALE3', name: 'Vale ON' },
];

const tickers = (text: string, limit?: number) =>
  searchAssets(catalog, text, limit).assets.map((a) => a.ticker);

describe('busca de ativos (CA05)', () => {
  it('sem texto, tudo em ordem de ticker', () => {
    expect(tickers('')).toEqual(['ITUB4', 'MXRF11', 'PETR3', 'PETR4', 'PRIO3', 'SMTO3', 'VALE3']);
    expect(tickers('   ')).toHaveLength(7);
  });

  it('ticker igual vem primeiro, depois quem começa com o texto, depois o nome', () => {
    expect(tickers('petr4')).toEqual(['PETR4']);
    expect(tickers('PETR')).toEqual(['PETR3', 'PETR4', 'PRIO3']);
    // ITUB4 entra pelo nome ("Itaú Unibanco PN"), depois dos tickers.
    expect(tickers('p')).toEqual(['PETR3', 'PETR4', 'PRIO3', 'ITUB4']);
  });

  it('nome sem diferenciar maiúsculas e acentos', () => {
    expect(tickers('acucar')).toEqual(['SMTO3']);
    expect(tickers('ITAU')).toEqual(['ITUB4']);
    expect(tickers('sao martinho')).toEqual(['SMTO3']);
    expect(tickers('renda')).toEqual(['MXRF11']);
  });

  it('ticker com espaço no meio ainda acha', () => {
    expect(tickers('petr 4')).toEqual(['PETR4']);
  });

  it('nada encontrado', () => {
    expect(tickers('bitcoin')).toEqual([]);
  });

  it('limita e avisa que há mais', () => {
    expect(searchAssets(catalog, '', 3)).toEqual({
      assets: [catalog[4], catalog[5], catalog[1]],
      hasMore: true,
    });
    expect(searchAssets(catalog, '', 7).hasMore).toBe(false);
  });
});
