import { isSectorOf } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { subsectorKey, suggestSector } from './catalog-classification.js';

describe('classificação sugerida (SPEC-040 CA02)', () => {
  it('liga o segmento da B3 ao setor econômico da ação', () => {
    expect(suggestSector('stock', 'Bancos')).toBe('financeiro');
    expect(suggestSector('stock', 'Energia Elétrica')).toBe('utilidade_publica');
    expect(suggestSector('stock', 'Incorporações')).toBe('consumo_ciclico');
    expect(suggestSector('stock', 'Medicamentos e Outros Produtos')).toBe('saude');
    expect(suggestSector('stock', 'Programas e Serviços')).toBe('tecnologia_informacao');
    expect(suggestSector('stock', 'Telecomunicações')).toBe('comunicacoes');
    expect(suggestSector('stock', 'Siderurgia')).toBe('materiais_basicos');
    expect(suggestSector('stock', 'Agricultura')).toBe('consumo_nao_ciclico');
    expect(suggestSector('stock', 'Material Rodoviário')).toBe('bens_industriais');
    expect(suggestSector('stock', 'Petróleo e Gás Integrado')).toBe('petroleo_gas_biocombustiveis');
  });

  it('aceita as grafias diferentes que a brapi usa', () => {
    for (const variant of [
      'Exploração, Refino e Distribuição',
      'Exploração. Refino e Distribuição',
    ]) {
      expect(suggestSector('stock', variant)).toBe('petroleo_gas_biocombustiveis');
    }
    expect(suggestSector('stock', 'Açucar e Alcool')).toBe('consumo_nao_ciclico');
    expect(suggestSector('stock', 'Aluguel de carros')).toBe('consumo_ciclico');
    expect(suggestSector('stock', 'Serv.Méd.Hospit..Análises e Diagnósticos')).toBe('saude');
    expect(suggestSector('stock', 'Motores . Compressores e Outros')).toBe('bens_industriais');
    expect(subsectorKey('  Tecidos. Vestuário e Calçados ')).toBe('tecidos vestuario e calcados');
  });

  it('segmento de FII; o que não diz o segmento fica como Outros', () => {
    expect(suggestSector('fii', 'Logística')).toBe('logistica');
    expect(suggestSector('fii', 'Escritórios')).toBe('lajes_corporativas');
    expect(suggestSector('fii', 'Shoppings')).toBe('shoppings');
    expect(suggestSector('fii', 'Títulos e Val. Mob.')).toBe('recebiveis');
    expect(suggestSector('fii', 'Hospital')).toBe('renda_urbana');
    expect(suggestSector('fii', 'Hotel')).toBe('hoteis');
    expect(suggestSector('fii', 'Multicategoria')).toBe('outros');
    expect(suggestSector('fii', 'Fundos Imobiliários')).toBe('outros');
  });

  it('desconhecido, ausente ou da outra classe vira Outros, sempre da classe certa', () => {
    expect(suggestSector('stock', 'Algo Novo')).toBe('outros');
    expect(suggestSector('stock', null)).toBe('outros');
    expect(suggestSector('fii', 'Bancos')).toBe('outros');
    expect(suggestSector('stock', 'Logística')).toBe('outros');
    for (const subsector of ['Bancos', 'Logística', 'Hotel', null]) {
      expect(isSectorOf('stock', suggestSector('stock', subsector))).toBe(true);
      expect(isSectorOf('fii', suggestSector('fii', subsector))).toBe(true);
    }
  });
});
