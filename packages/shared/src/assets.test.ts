import { describe, expect, it } from 'vitest';
import {
  ASSET_PATHS,
  assetPath,
  FII_SEGMENTS,
  isKnownSector,
  isSectorOf,
  normalizeSearchText,
  normalizeTicker,
  SECTOR_OPTIONS,
  STOCK_SECTORS,
  TICKER_PATTERN,
  validateAssetUpdate,
  validateCatalogQuery,
  validateNewAsset,
} from './assets.js';

describe('ticker', () => {
  it('aceita o formato da B3, inclusive número no meio e units', () => {
    for (const ticker of ['PETR4', 'VALE3', 'B3SA3', 'TAEE11', 'MXRF11', 'BPAC11']) {
      expect(TICKER_PATTERN.test(ticker), ticker).toBe(true);
    }
  });

  it('recusa minúsculas, fracionário, letras demais ou números demais', () => {
    for (const ticker of ['petr4', 'PETR4F', 'PETRO4', 'PET4', 'PETR123', '3SA3', 'PETR', '']) {
      expect(TICKER_PATTERN.test(ticker), ticker).toBe(false);
    }
  });

  it('normaliza apenas espaços nas pontas e maiúsculas', () => {
    expect(normalizeTicker('  petr4 ')).toBe('PETR4');
  });
});

describe('setores e segmentos (lista fixa, §4)', () => {
  it('11 setores para ações e 11 segmentos para FIIs, sem repetir dentro da classe', () => {
    expect(STOCK_SECTORS).toHaveLength(11);
    expect(FII_SEGMENTS).toHaveLength(11);
    expect(new Set(STOCK_SECTORS).size).toBe(11);
    expect(new Set(FII_SEGMENTS).size).toBe(11);
    expect(SECTOR_OPTIONS).toHaveLength(22);
  });

  it('cada código pertence à sua classe; "outros" existe nas duas', () => {
    expect(isSectorOf('stock', 'financeiro')).toBe(true);
    expect(isSectorOf('fii', 'financeiro')).toBe(false);
    expect(isSectorOf('fii', 'logistica')).toBe(true);
    expect(isSectorOf('stock', 'outros')).toBe(true);
    expect(isSectorOf('fii', 'outros')).toBe(true);
    expect(isKnownSector('bancos')).toBe(false);
  });
});

describe('texto da busca', () => {
  it('ignora maiúsculas, acentos e espaços repetidos', () => {
    expect(normalizeSearchText('  São  Martinho AÇÚCAR ')).toBe('sao martinho acucar');
    expect(normalizeSearchText('Itaú Unibanco')).toBe(normalizeSearchText('itau unibanco'));
  });
});

describe('cadastro de ativo (CA01, CA02)', () => {
  const valid = {
    ticker: ' petr4 ',
    name: ' Petrobras PN ',
    class: 'stock',
    sector: 'petroleo_gas_biocombustiveis',
  };

  it('aceita e normaliza', () => {
    expect(validateNewAsset(valid)).toEqual({
      success: true,
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        class: 'stock',
        sector: 'petroleo_gas_biocombustiveis',
      },
    });
  });

  it('aponta o problema de cada campo', () => {
    expect(
      validateNewAsset({ ticker: 'PETR4F', name: 'P', class: 'etf', sector: 'bancos' }),
    ).toEqual({
      success: false,
      fields: {
        ticker: 'invalid_ticker',
        name: 'too_short',
        class: 'invalid_option',
        sector: 'invalid_option',
      },
    });
    expect(validateNewAsset({})).toEqual({
      success: false,
      fields: { ticker: 'required', name: 'required', class: 'invalid_option', sector: 'required' },
    });
  });

  it('setor de outra classe dá wrong_class, junto com os outros problemas', () => {
    expect(validateNewAsset({ ...valid, class: 'fii' })).toEqual({
      success: false,
      fields: { sector: 'wrong_class' },
    });
    expect(validateNewAsset({ ...valid, name: '', class: 'fii' })).toEqual({
      success: false,
      fields: { name: 'required', sector: 'wrong_class' },
    });
  });

  it('nome longo demais', () => {
    expect(validateNewAsset({ ...valid, name: 'x'.repeat(101) })).toMatchObject({
      fields: { name: 'too_long' },
    });
  });
});

describe('edição de ativo (CA03)', () => {
  it('aceita só o que muda e normaliza o ticker', () => {
    expect(validateAssetUpdate({ ticker: 'vbbr3' }, 'stock')).toEqual({
      success: true,
      data: { ticker: 'VBBR3' },
    });
  });

  it('recusa a classe (RB22) e edição vazia', () => {
    expect(validateAssetUpdate({ class: 'fii', name: 'X Y' }, 'stock')).toEqual({
      success: false,
      fields: { class: 'immutable' },
    });
    expect(validateAssetUpdate({}, 'stock')).toEqual({ success: false, fields: { _: 'required' } });
  });

  it('o setor precisa ser da classe atual do ativo', () => {
    expect(validateAssetUpdate({ sector: 'logistica' }, 'stock')).toEqual({
      success: false,
      fields: { sector: 'wrong_class' },
    });
    expect(validateAssetUpdate({ sector: 'logistica' }, 'fii').success).toBe(true);
  });
});

describe('filtros da busca', () => {
  it('padrões: texto vazio e todas as situações', () => {
    expect(validateCatalogQuery({})).toEqual({ success: true, data: { q: '', status: 'all' } });
    expect(
      validateCatalogQuery({
        q: '  petr ',
        class: 'stock',
        sector: 'financeiro',
        status: 'active',
      }),
    ).toEqual({
      success: true,
      data: { q: 'petr', class: 'stock', sector: 'financeiro', status: 'active' },
    });
  });

  it('recusa valores fora da lista, texto longo e setor de outra classe', () => {
    expect(validateCatalogQuery({ class: 'etf' })).toMatchObject({
      fields: { class: 'invalid_option' },
    });
    expect(validateCatalogQuery({ status: 'deleted' })).toMatchObject({
      fields: { status: 'invalid_option' },
    });
    expect(validateCatalogQuery({ q: 'x'.repeat(61) })).toMatchObject({
      fields: { q: 'too_long' },
    });
    expect(validateCatalogQuery({ q: ['a', 'b'] })).toMatchObject({
      fields: { q: 'invalid_option' },
    });
    expect(validateCatalogQuery({ class: 'fii', sector: 'financeiro' })).toMatchObject({
      fields: { sector: 'wrong_class' },
    });
  });
});

describe('rotas', () => {
  it('monta o caminho com o id', () => {
    expect(assetPath(ASSET_PATHS.deactivate, 'abc')).toBe(
      '/api/collaborator/assets/abc/deactivate',
    );
  });
});
