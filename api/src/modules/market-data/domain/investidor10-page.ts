import {
  isIsoDate,
  type AssetClass,
  type DividendKind,
  type FundInfo,
  type IndicatorCode,
  type IsoDate,
} from '@simulador/shared';
import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Leitor das páginas do Investidor10 (SPEC-041 §4.2), usadas com autorização só neste projeto
 * acadêmico. Puro: recebe o HTML (e o JSON do histórico), não sabe de rede.
 */

/** A página não tem a tabela esperada: o site mudou. Nada do ativo é gravado (§4.3). */
export class Investidor10LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Investidor10LayoutError';
  }
}

/** Nome sem acento, minúsculo e só com letras e números: "Dívida Líquida / Ebitda" → "dividaliquidaebitda". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Nomes que o Investidor10 usa (no cartão e no histórico) para cada indicador do cadastro. */
const STOCK_NAMES: Record<string, IndicatorCode> = {
  pl: 'p_l',
  pvp: 'p_vp',
  preceitapsr: 'psr',
  evebitda: 'ev_ebitda',
  evebit: 'ev_ebit',
  pebitda: 'p_ebitda',
  pebit: 'p_ebit',
  pativo: 'p_ativo',
  pativocircliq: 'p_ativo_circ_liq',
  pcapgiro: 'p_cap_giro',
  lpa: 'lpa',
  vpa: 'vpa',
  margembruta: 'margem_bruta',
  margemebitda: 'margem_ebitda',
  // Assim mesmo no histórico do Investidor10.
  margemebtida: 'margem_ebitda',
  margemebit: 'margem_ebit',
  margemliquida: 'margem_liquida',
  giroativos: 'giro_ativos',
  roe: 'roe',
  roa: 'roa',
  roic: 'roic',
  dividendyield: 'dividend_yield',
  payout: 'payout',
  liquidezcorrente: 'liquidez_corrente',
  dividaliquidaebitda: 'div_liq_ebitda',
  dividaliquidaebit: 'div_liq_ebit',
  dividaliquidapatrimonio: 'div_liq_pl',
  dividabrutapatrimonio: 'div_bruta_pl',
  patrimonioativos: 'pl_ativos',
  passivosativos: 'passivos_ativos',
  cagrreceitas5anos: 'cagr_receitas_5a',
  cagrlucros5anos: 'cagr_lucros_5a',
};

/** Cartões do topo e campos de informação do FII. */
const FII_NAMES: Record<string, IndicatorCode> = {
  dy12m: 'fii_dy_12m',
  pvp: 'fii_p_vp',
  liquidezdiaria: 'fii_liquidez_diaria',
  vacancia: 'fii_vacancia',
  numerodecotistas: 'fii_cotistas',
  cotasemitidas: 'fii_cotas_emitidas',
  valpatrimonialpcota: 'fii_vp_cota',
  valorpatrimonial: 'fii_valor_patrimonial',
  ultimorendimento: 'fii_ultimo_rendimento',
};

const FII_TEXT_FIELDS: Record<string, keyof FundInfo> = {
  tipodefundo: 'fundType',
  segmento: 'segment',
  mandato: 'mandate',
  publicoalvo: 'audience',
  prazodeduracao: 'term',
  tipodegestao: 'management',
  taxadeadministracao: 'adminFee',
};

const MULTIPLIERS: ReadonlyArray<[RegExp, number]> = [
  [/\s*(bilh(oes|ao|ões|ão)|b)$/i, 9],
  [/\s*(milh(oes|ao|ões|ão)|m(i|il)?)$/i, 6],
  [/\s*(mil|k)$/i, 3],
];

/**
 * Número do jeito que o site escreve, em decimal (texto), sem ponto flutuante (RNF12): "4,55",
 * "-0,54", "50,60%", "R$ 5,30 Bilhões", "R$ 22,26 M", "1.570.590". "-" e vazio: `null`. Texto que
 * não é número lança erro.
 */
export function parseBrNumber(raw: string): string | null {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (text === '' || text === '-' || text === '—') return null;
  text = text
    .replace(/^R\$\s*/i, '')
    .replace(/%$/, '')
    .trim();
  // "R$ -" e "-%": sem valor, com a unidade na frente ou atrás.
  if (text === '' || text === '-' || text === '—') return null;
  // Milhões abreviado ("M") só depois de "Mil" para não confundir os dois.
  let shift = 0;
  if (/\s*mil$/i.test(text)) {
    shift = 3;
    text = text.replace(/\s*mil$/i, '');
  } else {
    for (const [pattern, power] of MULTIPLIERS) {
      if (pattern.test(text)) {
        shift = power;
        text = text.replace(pattern, '');
        break;
      }
    }
  }
  text = text.trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(text)) {
    throw new Error(`número que não dá para ler: "${raw.trim()}"`);
  }
  const plain = text.replace(/\./g, '').replace(',', '.');
  return shiftDecimal(plain, shift);
}

/** Multiplica um decimal em texto por 10^shift, só movendo a vírgula. */
function shiftDecimal(value: string, shift: number): string {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const digits = integer + fraction.padEnd(shift, '0');
  const point = integer.length + shift;
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  const rest = digits.slice(point).replace(/0+$/, '');
  const result = rest ? `${whole}.${rest}` : whole;
  return negative && result !== '0' ? `-${result}` : result;
}

/** Valor do JSON do histórico: número da fonte, guardado com até 6 casas. */
export function historyNumber(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return parseBrNumber(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`valor do histórico que não dá para ler: ${JSON.stringify(value)}`);
  }
  const fixed = value.toFixed(6).replace(/\.?0+$/, '');
  return fixed === '-0' ? '0' : fixed;
}

export interface ParsedDividend {
  kind: DividendKind;
  exDate: IsoDate;
  paymentDate: IsoDate | null;
  value: string;
}

export interface ParsedPage {
  /** Valores atuais, pelo código do cadastro. */
  current: Map<IndicatorCode, string | null>;
  fund: FundInfo | null;
  dividends: ParsedDividend[];
  /** Id do ativo no histórico do Investidor10 (só ações). */
  historyId: number | null;
  /** Nomes fora do cadastro, linhas que não deu para ler: avisos da execução. */
  warnings: string[];
}

const clean = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Lê a página de uma ação, unit ou FII. Lança Investidor10LayoutError se a tabela não estiver lá. */
export function parseInvestidor10Page(
  html: string,
  assetClass: AssetClass,
  ticker: string,
): ParsedPage {
  const root = parse(html);
  const warnings: string[] = [];
  const current = new Map<IndicatorCode, string | null>();
  const read = (code: IndicatorCode, name: string, text: string) => {
    try {
      current.set(code, parseBrNumber(text));
    } catch (error) {
      warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let fund: FundInfo | null = null;
  if (assetClass === 'stock') {
    const cards = root.querySelectorAll('#table-indicators article.indicator-card');
    if (cards.length === 0) {
      throw new Investidor10LayoutError(`página de ${ticker} sem a tabela de indicadores`);
    }
    for (const card of cards) {
      const name = clean(card.querySelector('.indicator-card-title')?.text);
      const code = STOCK_NAMES[normalizeName(name)];
      if (!code) {
        warnings.push(`indicador fora do cadastro: "${name}"`);
        continue;
      }
      read(code, name, clean(card.querySelector('.indicator-card-value')?.text));
    }
  } else {
    const cells = root.querySelectorAll('#table-indicators .cell');
    if (cells.length === 0) {
      throw new Investidor10LayoutError(`página de ${ticker} sem as informações do fundo`);
    }
    fund = {
      fundType: null,
      segment: null,
      mandate: null,
      audience: null,
      term: null,
      management: null,
      adminFee: null,
    };
    for (const card of root.querySelectorAll('#cards-ticker ._card')) {
      const name = clean(card.querySelector('._card-header')?.text).replace(ticker, '').trim();
      const code = FII_NAMES[normalizeName(name)];
      if (!code) continue; // cotação e variação: não são indicadores
      read(code, name, clean(card.querySelector('._card-body .value, ._card-body span')?.text));
    }
    for (const cell of cells) {
      const name = clean(cell.querySelector('.name')?.text);
      const value = clean(cell.querySelector('.value')?.text);
      const key = normalizeName(name);
      const textField = FII_TEXT_FIELDS[key];
      if (textField) {
        fund[textField] = value === '' || value === '-' ? null : value.slice(0, 200);
        continue;
      }
      const code = FII_NAMES[key];
      if (code) read(code, name, value);
    }
  }

  const historyId = /historico-indicadores\/(\d+)\//.exec(html)?.[1];
  return {
    current,
    fund,
    dividends: parseDividends(root, assetClass, warnings),
    historyId: historyId ? Number(historyId) : null,
    warnings,
  };
}

/** Tabela de dividendos (SPEC-042): tipo, data com, pagamento e valor por ação ou cota. */
function parseDividends(
  root: HTMLElement,
  assetClass: AssetClass,
  warnings: string[],
): ParsedDividend[] {
  const dividends: ParsedDividend[] = [];
  for (const row of root.querySelectorAll('#table-dividends-history tbody tr')) {
    const [kindText, exText, payText, valueText] = row
      .querySelectorAll('td')
      .map((td) => clean(td.text));
    const kind = dividendKind(kindText ?? '', assetClass);
    if (kind === 'skip') continue;
    const exDate = brDate(exText ?? '');
    // Sem data ("-") ou ainda sem data marcada ("Provisionado"): fica sem data de pagamento.
    const pending =
      payText === '-' || payText === '' || normalizeName(payText ?? '') === 'provisionado';
    const paymentDate = pending ? null : brDate(payText ?? '');
    let value: string | null;
    try {
      value = parseBrNumber(valueText ?? '');
    } catch {
      value = null;
    }
    if (
      !kind ||
      !exDate ||
      (!pending && !paymentDate) ||
      !value ||
      !/^[1-9]|^0\.\d*[1-9]/.test(value)
    ) {
      warnings.push(
        `provento que não dá para ler: ${[kindText, exText, payText, valueText].join(' | ')}`,
      );
      continue;
    }
    dividends.push({
      kind,
      exDate,
      // Pagamento antes da data com não existe: a fonte errou, fica sem data de pagamento.
      paymentDate: paymentDate && paymentDate >= exDate ? paymentDate : null,
      value,
    });
  }
  return dividends;
}

/**
 * "Dividendos" de um FII é rendimento; "Bonificação" é evento em ações (vem da B3, §4.3): pulado.
 * Tipo desconhecido: `null` (aviso).
 */
function dividendKind(text: string, assetClass: AssetClass): DividendKind | 'skip' | null {
  const key = normalizeName(text);
  if (key === 'dividendos' || key === 'dividendo')
    return assetClass === 'fii' ? 'rendimento' : 'dividendo';
  if (key === 'jscp' || key === 'jcp') return 'jcp';
  // "Rend. Trib." (rendimento tributável) aparece nas ações; a B3 chama de RENDIMENTO.
  if (key === 'rendimento' || key === 'rendimentos' || key === 'rendtrib') return 'rendimento';
  if (key === 'amortizacao' || key === 'amortizacoes') return 'amortizacao';
  if (key === 'bonificacao') return 'skip';
  return null;
}

function brDate(text: string): IsoDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return isIsoDate(date) ? date : null;
}

/**
 * Histórico das ações (`/api/historico-indicadores/{id}/10`): por nome do indicador, uma lista de
 * `{ year, value }`. "Atual" fica de fora (vem da página). Indicador fora do cadastro vira aviso.
 */
export function parseIndicatorHistory(json: unknown): {
  rows: Map<IndicatorCode, Map<string, string | null>>;
  warnings: string[];
} {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Investidor10LayoutError('histórico de indicadores em formato inesperado');
  }
  const rows = new Map<IndicatorCode, Map<string, string | null>>();
  const warnings: string[] = [];
  for (const [name, entries] of Object.entries(json as Record<string, unknown>)) {
    const code = STOCK_NAMES[normalizeName(name)];
    if (!code) {
      warnings.push(`indicador do histórico fora do cadastro: "${name}"`);
      continue;
    }
    if (!Array.isArray(entries)) continue;
    const years = rows.get(code) ?? new Map<string, string | null>();
    for (const entry of entries) {
      const { year, value } = (entry ?? {}) as { year?: unknown; value?: unknown };
      if (typeof year !== 'string' || !/^(19|20)\d{2}$/.test(year)) continue;
      try {
        years.set(year, historyNumber(value));
      } catch (error) {
        warnings.push(`${name} ${year}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    rows.set(code, years);
  }
  return { rows, warnings };
}
