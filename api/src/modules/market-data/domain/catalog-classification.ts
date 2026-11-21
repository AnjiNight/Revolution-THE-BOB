import {
  normalizeSearchText,
  type AssetClass,
  type FiiSegment,
  type SectorCode,
  type StockSector,
} from '@simulador/shared';

/**
 * Classificação sugerida para o ativo importado (SPEC-040 §4.2). O subsetor que a brapi informa
 * usa os nomes de segmento da classificação da B3; cada um pertence a um setor econômico (ações)
 * ou corresponde a um segmento de FII. O que não está na tabela, ou é ambíguo, vira "Outros". É
 * só sugestão: todo ativo importado nasce "a revisar" e a equipe confere.
 */

/** Chave de comparação: sem acentos, minúsculas, sem pontos e vírgulas (a brapi varia a grafia). */
export function subsectorKey(subsector: string): string {
  return normalizeSearchText(subsector.replace(/[.,]/g, ' '));
}

const STOCK_SECTOR_OF: Record<string, StockSector> = Object.fromEntries(
  (
    [
      [
        'petroleo_gas_biocombustiveis',
        [
          'Exploração, Refino e Distribuição',
          'Exploração e Produção de Petróleo',
          'Petróleo e Gás Integrado',
          'Equipamentos e Serviços',
        ],
      ],
      [
        'materiais_basicos',
        [
          'Mineração de Minerais Metálicos',
          'Minerais Metálicos',
          'Siderurgia',
          'Artefatos de Ferro e Aço',
          'Artefatos de Cobre',
          'Petroquímicos',
          'Fertilizantes e Defensivos',
          'Químicos Diversos',
          'Madeira',
          'Papel e Celulose',
          'Embalagens',
          'Materiais Diversos',
        ],
      ],
      [
        'bens_industriais',
        [
          'Material Aeronáutico e de Defesa',
          'Material de Transporte',
          'Material Rodoviário',
          'Material Ferroviário',
          'Motores, Compressores e Outros',
          'Máq. e Equip. Industriais',
          'Máq. e Equip. Construção e Agrícolas',
          'Máquinas e Equipamentos',
          'Máquinas e Equipamentos Industriais',
          'Armas e Munições',
          'Produtos para Construção',
          'Construção Pesada',
          'Engenharia Consultiva',
          'Serviços Diversos',
          'Transporte Aéreo',
          'Transporte Ferroviário',
          'Transporte Hidroviário',
          'Transporte Rodoviário',
          'Exploração de Rodovias',
          'Serviços de Apoio e Armazenagem',
        ],
      ],
      [
        'consumo_ciclico',
        [
          'Incorporações',
          'Fios e Tecidos',
          'Vestuário',
          'Calçados',
          'Acessórios',
          'Tecidos, Vestuário e Calçados',
          'Eletrodomésticos',
          'Móveis',
          'Utensílios Domésticos',
          'Automóveis e Motocicletas',
          'Hotelaria',
          'Restaurante e Similares',
          'Bicicletas',
          'Brinquedos e Jogos',
          'Produção de Eventos e Shows',
          'Viagens e Turismo',
          'Atividades Esportivas',
          'Serviços Educacionais',
          'Aluguel de Carros',
          'Programas de Fidelização',
          'Produtos Diversos',
          'Varejo Especializado',
        ],
      ],
      [
        'consumo_nao_ciclico',
        [
          'Agricultura',
          'Açúcar e Álcool',
          'Carnes e Derivados',
          'Alimentos Diversos',
          'Alimentos',
          'Cervejas e Refrigerantes',
          'Produtos de Uso Pessoal',
          'Produtos de Limpeza',
        ],
      ],
      [
        'saude',
        [
          'Medicamentos e Outros Produtos',
          'Serv. Méd. Hospit., Análises e Diagnósticos',
          'Serviços Médicos Hospitalares',
          'Equipamentos',
        ],
      ],
      ['tecnologia_informacao', ['Computadores e Equipamentos', 'Programas e Serviços']],
      ['comunicacoes', ['Telecomunicações', 'Publicidade e Propaganda']],
      ['utilidade_publica', ['Energia Elétrica', 'Água e Saneamento', 'Gás']],
      [
        'financeiro',
        [
          'Bancos',
          'Bancos Diversificados',
          'Soc. Crédito e Financiamento',
          'Gestão de Recursos e Investimentos',
          'Serviços Financeiros Diversos',
          'Seguradoras',
          'Corretoras de Seguros e Resseguros',
          'Resseguradoras',
          'Exploração de Imóveis',
          'Intermediação Imobiliária',
          'Holdings Diversificadas',
          'Dados Financeiros e Bolsas de Valores',
        ],
      ],
    ] as const satisfies ReadonlyArray<readonly [StockSector, readonly string[]]>
  ).flatMap(([sector, names]) => names.map((name) => [subsectorKey(name), sector])),
);

/** "Multicategoria", "Fundos Imobiliários" e "Outros" não dizem o segmento: ficam como Outros. */
const FII_SEGMENT_OF: Record<string, FiiSegment> = Object.fromEntries(
  (
    [
      ['lajes_corporativas', ['Lajes Corporativas', 'Escritórios']],
      ['logistica', ['Logística']],
      ['shoppings', ['Shoppings']],
      ['recebiveis', ['Títulos e Val. Mob.']],
      ['residencial', ['Residencial']],
      ['hoteis', ['Hotel', 'Hotelaria']],
      ['renda_urbana', ['Hospital', 'Varejo', 'Educacional']],
      ['hibrido', ['Híbrido']],
    ] as const satisfies ReadonlyArray<readonly [FiiSegment, readonly string[]]>
  ).flatMap(([segment, names]) => names.map((name) => [subsectorKey(name), segment])),
);

export function suggestSector(assetClass: AssetClass, subsector: string | null): SectorCode {
  const key = subsector ? subsectorKey(subsector) : '';
  const table = assetClass === 'fii' ? FII_SEGMENT_OF : STOCK_SECTOR_OF;
  return table[key] ?? 'outros';
}
