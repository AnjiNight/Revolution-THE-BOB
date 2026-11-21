import {
  normalizeSearchText,
  type FiiSegment,
  type SectorCode,
  type StockSector,
} from '@simulador/shared';

/**
 * Classificação sugerida pelas fontes melhores (SPEC-021 §4.2): o setor econômico da B3 para as
 * ações e o segmento do Investidor10 para os FIIs. Puro: recebe os textos das fontes e devolve o
 * código do catálogo (SPEC-006), ou `null` quando a fonte não diz nada que sirva.
 */

/** Chave de comparação: sem acentos, minúsculas, sem pontuação (a B3 troca vírgulas por pontos). */
function key(text: string): string {
  return normalizeSearchText(text.replace(/[.,;/]/g, ' '));
}

/** Os setores econômicos da B3 (o 1º nível da classificação), que são a lista do catálogo. */
const B3_SECTORS: Record<string, StockSector> = {
  'bens industriais': 'bens_industriais',
  comunicacoes: 'comunicacoes',
  // Nome antigo da B3 para o mesmo setor.
  telecomunicacoes: 'comunicacoes',
  'consumo ciclico': 'consumo_ciclico',
  'consumo nao ciclico': 'consumo_nao_ciclico',
  financeiro: 'financeiro',
  'financeiro e outros': 'financeiro',
  'materiais basicos': 'materiais_basicos',
  'petroleo gas e biocombustiveis': 'petroleo_gas_biocombustiveis',
  saude: 'saude',
  'tecnologia da informacao': 'tecnologia_informacao',
  'utilidade publica': 'utilidade_publica',
  outros: 'outros',
};

/**
 * "Consumo Cíclico / Comércio / Eletrodomésticos" → `consumo_ciclico`. Setor que a lista não conhece
 * (ou texto vazio) → `null`.
 */
export function stockSectorFromB3(industryClassification: string | null): StockSector | null {
  if (!industryClassification) return null;
  const [sector = ''] = industryClassification.split(' / ');
  return B3_SECTORS[key(sector)] ?? null;
}

/** Os três níveis da classificação, como a B3 publica ("setor / subsetor / segmento"). */
export function b3ClassificationLevels(industryClassification: string | null): {
  sector: string | null;
  subsector: string | null;
  segment: string | null;
} {
  const [sector, subsector, segment] = (industryClassification ?? '')
    .split(' / ')
    .map((part) => part.trim() || null);
  return { sector: sector ?? null, subsector: subsector ?? null, segment: segment ?? null };
}

/** Segmentos do Investidor10 (SPEC-041) e o segmento do catálogo de cada um. */
const INVESTIDOR10_SEGMENTS: Record<string, FiiSegment> = {
  'titulos e valores mobiliarios': 'recebiveis',
  'lajes corporativas': 'lajes_corporativas',
  'logistico industria galpoes': 'logistica',
  'shoppings varejo': 'shoppings',
  hibrido: 'hibrido',
  residencial: 'residencial',
  hoteis: 'hoteis',
  hospitalar: 'renda_urbana',
  'agencias bancarias': 'renda_urbana',
  educacional: 'renda_urbana',
  'fundo de fundos': 'fundo_de_fundos',
  outros: 'outros',
};

/**
 * Pelo tipo e pelo segmento do Investidor10 (§4.2): fundo de fundos e fundo de desenvolvimento pelo
 * tipo; o resto pelo segmento; "Outros" com tipo "Fundo de Papel" é recebíveis.
 */
export function fiiSegmentFromInvestidor10(
  fundType: string | null,
  segment: string | null,
): FiiSegment | null {
  const type = key(fundType ?? '');
  if (type === 'fundo de fundos') return 'fundo_de_fundos';
  if (type === 'fundo de desenvolvimento') return 'desenvolvimento';
  const mapped = segment ? INVESTIDOR10_SEGMENTS[key(segment)] : undefined;
  if (mapped === 'outros' && type === 'fundo de papel') return 'recebiveis';
  return mapped ?? null;
}

/**
 * §4.2, "quando troca": só com um setor específico (nunca troca por "Outros") e só quando muda.
 */
export function suggestionChange(current: SectorCode, suggested: SectorCode | null): boolean {
  return suggested !== null && suggested !== 'outros' && suggested !== current;
}
