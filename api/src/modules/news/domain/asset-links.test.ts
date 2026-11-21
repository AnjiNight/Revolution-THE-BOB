import { describe, expect, it } from 'vitest';
import {
  LIST_THRESHOLD,
  linkNewsToAssets,
  matchesCompany,
  type CatalogTicker,
} from './asset-links.js';

const assets: CatalogTicker[] = [
  { assetId: 'petr4', ticker: 'PETR4', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', active: true },
  { assetId: 'petr3', ticker: 'PETR3', name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', active: true },
  { assetId: 'prio3', ticker: 'PRIO3', name: 'PRIO S.A.', active: true },
  { assetId: 'bbas3', ticker: 'BBAS3', name: 'BCO BRASIL S.A.', active: true },
  { assetId: 'itub4', ticker: 'ITUB4', name: 'ITAU UNIBANCO HOLDING S.A.', active: true },
  { assetId: 'itsa4', ticker: 'ITSA4', name: 'ITAUSA S.A.', active: true },
  { assetId: 'ugpa3', ticker: 'UGPA3', name: 'ULTRAPAR PARTICIPACOES S.A.', active: true },
  { assetId: 'cash3', ticker: 'CASH3', name: 'MELIUZ S.A.', active: true },
  { assetId: 'mxrf11', ticker: 'MXRF11', name: 'MAXI RENDA FII', active: true },
  { assetId: 'velha3', ticker: 'VELH3', name: 'EMPRESA ANTIGA S.A.', active: false },
];
const catalog = new Map(assets.map((asset) => [asset.ticker, asset]));

const news = (fields: Partial<Parameters<typeof linkNewsToAssets>[0]>) => ({
  title: 'Título',
  body: null,
  summary: null,
  companies: [],
  ...fields,
});

describe('vínculo notícia–ativo (SPEC-028 §4.1)', () => {
  it('ticker no título é principal; marcado pelo Investidor10 também (exemplo 1 do §4.3)', () => {
    const links = linkNewsToAssets(
      news({
        title: 'Petrobras (PETR4) pode pagar 20% em dividendos em 2027, diz banco',
        body: 'O destaque vai para Petrobras (PETR4) e PRIO (PRIO3). Já a CASH3 caiu.',
        companies: ['Petrobras', 'PRIO'],
      }),
      catalog,
    );
    expect(links).toEqual([
      { assetId: 'petr4', ticker: 'PETR4', relevance: 'principal', origin: 'ticker_titulo' },
      { assetId: 'prio3', ticker: 'PRIO3', relevance: 'principal', origin: 'ticker_texto' },
      { assetId: 'cash3', ticker: 'CASH3', relevance: 'citado', origin: 'ticker_texto' },
    ]);
  });

  it('padrão de ticker fora do catálogo é ignorado; units, FIIs e outros finais entram', () => {
    const links = linkNewsToAssets(
      news({
        title: 'ABCD3 e XPTO11 não existem; MXRF11 paga R$ 0,10',
        body: 'IPCA4 nem é ticker; a Raízen (RAIZ55) também',
      }),
      new Map([
        ...catalog,
        ['RAIZ55', { assetId: 'raiz55', ticker: 'RAIZ55', name: 'RAIZEN S.A.', active: true }],
      ]),
    );
    expect(links.map((link) => link.ticker)).toEqual(['MXRF11', 'RAIZ55']);
  });

  it(`mais de ${LIST_THRESHOLD} ativos: todos de lista, mesmo o do título`, () => {
    const many = assets.map((asset) => asset.ticker).join(', ');
    const links = linkNewsToAssets(
      news({ title: 'Dólar explica repique da PETR4', body: `Agenda: ${many}` }),
      catalog,
    );
    expect(links.length).toBeGreaterThan(LIST_THRESHOLD);
    expect(new Set(links.map((link) => link.relevance))).toEqual(new Set(['lista']));
  });

  it('empresa marcada sem ticker citado: todos os tickers ativos dela, como principal', () => {
    const links = linkNewsToAssets(
      news({ title: 'Petrobras anuncia plano', companies: ['Petrobras'] }),
      catalog,
    );
    expect(links).toEqual([
      { assetId: 'petr4', ticker: 'PETR4', relevance: 'principal', origin: 'empresa_marcada' },
      { assetId: 'petr3', ticker: 'PETR3', relevance: 'principal', origin: 'empresa_marcada' },
    ]);
  });

  it('notícia sem ticker e sem empresa marcada (Agência Brasil): sem vínculo', () => {
    expect(linkNewsToAssets(news({ title: 'BB aponta recusa de produtores' }), catalog)).toEqual(
      [],
    );
  });

  it('o mesmo ticker repetido vira um vínculo só', () => {
    const links = linkNewsToAssets(
      news({ title: 'PRIO3 sobe', body: 'PRIO3 PRIO3 PRIO3' }),
      catalog,
    );
    expect(links).toHaveLength(1);
  });

  it('ticker desativado no catálogo também vira vínculo (notícia antiga do ativo)', () => {
    const links = linkNewsToAssets(
      news({ title: 'Empresa Antiga (VELH3) fecha capital' }),
      catalog,
    );
    expect(links).toEqual([
      { assetId: 'velha3', ticker: 'VELH3', relevance: 'principal', origin: 'ticker_titulo' },
    ]);
  });
});

describe('empresa marcada × nome no catálogo (SPEC-028 §4.1, decisão 4)', () => {
  it('compara as palavras que identificam a empresa, sem acento nem "banco"', () => {
    expect(matchesCompany('BCO BRASIL S.A.', 'Banco do Brasil')).toBe(true);
    expect(matchesCompany('ITAU UNIBANCO HOLDING S.A.', 'Banco Itaú')).toBe(true);
    expect(matchesCompany('ITAUSA S.A.', 'Banco Itaú')).toBe(false);
    expect(matchesCompany('ITAUSA S.A.', 'Itaúsa')).toBe(true);
    expect(matchesCompany('ULTRAPAR PARTICIPACOES S.A.', 'Grupa Ultra (Ultrapar)')).toBe(true);
    expect(matchesCompany('PETROLEO BRASILEIRO S.A. PETROBRAS', 'Petrobras')).toBe(true);
    expect(matchesCompany('PRIO S.A.', 'Petrobras')).toBe(false);
  });
});
