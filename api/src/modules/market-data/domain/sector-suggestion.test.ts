import { describe, expect, it } from 'vitest';
import {
  b3ClassificationLevels,
  fiiSegmentFromInvestidor10,
  stockSectorFromB3,
  suggestionChange,
} from './sector-suggestion.js';

describe('setor econômico da B3 para o catálogo (SPEC-021 §4.2)', () => {
  it('os 11 setores da B3, com a grafia da página (pontos no lugar de vírgulas)', () => {
    expect(
      [
        'Bens Industriais / Máquinas e Equipamentos / Motores . Compressores e Outros',
        'Comunicações / Telecomunicações / Telecomunicações',
        'Consumo Cíclico / Comércio / Eletrodomésticos',
        'Consumo não Cíclico / Bebidas / Cervejas e Refrigerantes',
        'Financeiro / Intermediários Financeiros / Bancos',
        'Materiais Básicos / Mineração / Minerais Metálicos',
        'Petróleo. Gás e Biocombustíveis / Petróleo. Gás e Biocombustíveis / Exploração. Refino e Distribuição',
        'Saúde / Serv.Méd.Hospit..Análises e Diagnósticos / Serv.Méd.Hospit..Análises e Diagnósticos',
        'Tecnologia da Informação / Programas e Serviços / Programas e Serviços',
        'Utilidade Pública / Energia Elétrica / Energia Elétrica',
        'Outros / Outros / Outros',
      ].map(stockSectorFromB3),
    ).toEqual([
      'bens_industriais',
      'comunicacoes',
      'consumo_ciclico',
      'consumo_nao_ciclico',
      'financeiro',
      'materiais_basicos',
      'petroleo_gas_biocombustiveis',
      'saude',
      'tecnologia_informacao',
      'utilidade_publica',
      'outros',
    ]);
  });

  it('nomes antigos da B3, só o 1º nível, e o que não serve', () => {
    expect(stockSectorFromB3('Financeiro e Outros / Intermediários Financeiros / Bancos')).toBe(
      'financeiro',
    );
    expect(stockSectorFromB3('Telecomunicações')).toBe('comunicacoes');
    expect(stockSectorFromB3('Consumo Cíclico')).toBe('consumo_ciclico');
    expect(stockSectorFromB3('Construção e Transporte / Construção')).toBeNull();
    expect(stockSectorFromB3(null)).toBeNull();
    expect(stockSectorFromB3('')).toBeNull();
  });

  it('separa os três níveis como a B3 publica', () => {
    expect(b3ClassificationLevels('Consumo Cíclico / Comércio / Eletrodomésticos')).toEqual({
      sector: 'Consumo Cíclico',
      subsector: 'Comércio',
      segment: 'Eletrodomésticos',
    });
    expect(b3ClassificationLevels(null)).toEqual({
      sector: null,
      subsector: null,
      segment: null,
    });
  });
});

describe('segmento do Investidor10 para o catálogo (SPEC-021 §4.2)', () => {
  it('os segmentos encontrados nos FIIs coletados (§4.4)', () => {
    const cases: Array<[string, string, string | null]> = [
      ['Fundo de Papel', 'Títulos e Valores Mobiliários', 'recebiveis'],
      ['Fundo de Tijolo', 'Lajes Corporativas', 'lajes_corporativas'],
      ['Fundo de Tijolo', 'Logístico / Indústria / Galpões', 'logistica'],
      ['Fundo de Tijolo', 'Shoppings / Varejo', 'shoppings'],
      ['Fundo Misto', 'Híbrido', 'hibrido'],
      ['Fundo de Tijolo', 'Residencial', 'residencial'],
      ['Fundo de Tijolo', 'Hotéis', 'hoteis'],
      ['Fundo de Tijolo', 'Hospitalar', 'renda_urbana'],
      ['Fundo de Tijolo', 'Agências Bancárias', 'renda_urbana'],
      ['Fundo de Tijolo', 'Educacional', 'renda_urbana'],
      ['Fundo de Tijolo', 'Outros', 'outros'],
      ['Outro', 'Algo novo', null],
    ];
    for (const [type, segment, expected] of cases) {
      expect(fiiSegmentFromInvestidor10(type, segment)).toBe(expected);
    }
  });

  it('pelo tipo: fundo de fundos e de desenvolvimento; papel com segmento "Outros" é recebíveis', () => {
    expect(fiiSegmentFromInvestidor10('Fundo de Fundos', 'Títulos e Valores Mobiliários')).toBe(
      'fundo_de_fundos',
    );
    expect(fiiSegmentFromInvestidor10('Fundo de Desenvolvimento', 'Híbrido')).toBe(
      'desenvolvimento',
    );
    expect(fiiSegmentFromInvestidor10('Fundo de Papel', 'Outros')).toBe('recebiveis');
    expect(fiiSegmentFromInvestidor10(null, null)).toBeNull();
  });

  it('só troca por um setor específico e diferente', () => {
    expect(suggestionChange('outros', 'logistica')).toBe(true);
    expect(suggestionChange('logistica', 'hibrido')).toBe(true);
    expect(suggestionChange('residencial', 'outros')).toBe(false);
    expect(suggestionChange('hibrido', 'hibrido')).toBe(false);
    expect(suggestionChange('outros', null)).toBe(false);
  });
});
