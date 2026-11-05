import type { IsoDate } from './calendar.js';

/** Rotas dos indicadores e proventos (SPECs 041 e 042). `:id` vira o id do ativo com `assetPath`. */
export const FUNDAMENTALS_PATHS = {
  fundamentals: '/api/assets/:id/fundamentals',
  dividends: '/api/assets/:id/dividends',
  collection: '/api/collaborator/investidor10',
} as const;

/** Como o número é mostrado: múltiplo ("4,55"), percentual, reais ou contagem. */
export type IndicatorUnit = 'multiple' | 'percent' | 'money' | 'count';

export type IndicatorGroup =
  'valuation' | 'efficiency' | 'profitability' | 'dividends' | 'debt' | 'growth' | 'fund';

/**
 * Cadastro fixo dos indicadores (SPEC-041 §4.3), na ordem da tela. O nome e a explicação de cada
 * um ficam nos textos do app (`fundamentals.indicator.<código>`).
 */
export const INDICATORS = [
  { code: 'p_l', group: 'valuation', unit: 'multiple' },
  { code: 'p_vp', group: 'valuation', unit: 'multiple' },
  { code: 'psr', group: 'valuation', unit: 'multiple' },
  { code: 'ev_ebitda', group: 'valuation', unit: 'multiple' },
  { code: 'ev_ebit', group: 'valuation', unit: 'multiple' },
  { code: 'p_ebitda', group: 'valuation', unit: 'multiple' },
  { code: 'p_ebit', group: 'valuation', unit: 'multiple' },
  { code: 'p_ativo', group: 'valuation', unit: 'multiple' },
  { code: 'p_ativo_circ_liq', group: 'valuation', unit: 'multiple' },
  { code: 'p_cap_giro', group: 'valuation', unit: 'multiple' },
  { code: 'lpa', group: 'valuation', unit: 'money' },
  { code: 'vpa', group: 'valuation', unit: 'money' },
  { code: 'margem_bruta', group: 'efficiency', unit: 'percent' },
  { code: 'margem_ebitda', group: 'efficiency', unit: 'percent' },
  { code: 'margem_ebit', group: 'efficiency', unit: 'percent' },
  { code: 'margem_liquida', group: 'efficiency', unit: 'percent' },
  { code: 'giro_ativos', group: 'efficiency', unit: 'multiple' },
  { code: 'roe', group: 'profitability', unit: 'percent' },
  { code: 'roa', group: 'profitability', unit: 'percent' },
  { code: 'roic', group: 'profitability', unit: 'percent' },
  { code: 'dividend_yield', group: 'dividends', unit: 'percent' },
  { code: 'payout', group: 'dividends', unit: 'percent' },
  { code: 'liquidez_corrente', group: 'debt', unit: 'multiple' },
  { code: 'div_liq_ebitda', group: 'debt', unit: 'multiple' },
  { code: 'div_liq_ebit', group: 'debt', unit: 'multiple' },
  { code: 'div_liq_pl', group: 'debt', unit: 'multiple' },
  { code: 'div_bruta_pl', group: 'debt', unit: 'multiple' },
  { code: 'pl_ativos', group: 'debt', unit: 'multiple' },
  { code: 'passivos_ativos', group: 'debt', unit: 'multiple' },
  { code: 'cagr_receitas_5a', group: 'growth', unit: 'percent' },
  { code: 'cagr_lucros_5a', group: 'growth', unit: 'percent' },
  // FIIs
  { code: 'fii_dy_12m', group: 'fund', unit: 'percent' },
  { code: 'fii_p_vp', group: 'fund', unit: 'multiple' },
  { code: 'fii_vp_cota', group: 'fund', unit: 'money' },
  { code: 'fii_valor_patrimonial', group: 'fund', unit: 'money' },
  { code: 'fii_ultimo_rendimento', group: 'fund', unit: 'money' },
  { code: 'fii_liquidez_diaria', group: 'fund', unit: 'money' },
  { code: 'fii_vacancia', group: 'fund', unit: 'percent' },
  { code: 'fii_cotistas', group: 'fund', unit: 'count' },
  { code: 'fii_cotas_emitidas', group: 'fund', unit: 'count' },
] as const satisfies ReadonlyArray<{ code: string; group: IndicatorGroup; unit: IndicatorUnit }>;

export type IndicatorCode = (typeof INDICATORS)[number]['code'];

export const INDICATOR_GROUPS: readonly IndicatorGroup[] = [
  'valuation',
  'efficiency',
  'profitability',
  'dividends',
  'debt',
  'growth',
  'fund',
];

export interface IndicatorValue {
  code: IndicatorCode;
  /** Decimal em texto; `null` quando a fonte não tem valor ("-"). */
  value: string | null;
}

/** Informações em texto de um FII, como o Investidor10 mostra. */
export interface FundInfo {
  fundType: string | null;
  segment: string | null;
  mandate: string | null;
  audience: string | null;
  term: string | null;
  management: string | null;
  adminFee: string | null;
}

/** Corpo de `GET /api/assets/:id/fundamentals` (SPEC-041 §5.2). */
export interface AssetFundamentals {
  source: 'investidor10';
  /** `collected`; `not_collected` antes da primeira visita; `no_page` sem página no Investidor10. */
  status: 'collected' | 'not_collected' | 'no_page' | 'error';
  /** Última coleta com dados (ISO 8601); `null` sem nenhuma. */
  collectedAt: string | null;
  /** Valores atuais, na ordem do cadastro; só os que a fonte tem. */
  current: IndicatorValue[];
  /** Ações: anos do histórico, do mais recente ao mais antigo, e os valores de cada indicador. */
  history: { years: string[]; rows: Array<{ code: IndicatorCode; values: Array<string | null> }> };
  fund: FundInfo | null;
}

export type DividendKind = 'dividendo' | 'jcp' | 'rendimento' | 'amortizacao';
export type DividendPeriod = '12m' | '5y' | 'all';
export const DIVIDEND_PERIODS: readonly DividendPeriod[] = ['12m', '5y', 'all'];

export function isDividendPeriod(value: unknown): value is DividendPeriod {
  return typeof value === 'string' && (DIVIDEND_PERIODS as readonly string[]).includes(value);
}

export interface Dividend {
  kind: DividendKind;
  exDate: IsoDate;
  paymentDate: IsoDate | null;
  /** Por ação ou cota, bruto, decimal em texto. */
  value: string;
}

/** Corpo de `GET /api/assets/:id/dividends` (SPEC-042 §5.2). */
export interface AssetDividends {
  source: 'investidor10';
  collectedAt: string | null;
  period: DividendPeriod;
  /** Soma por ação ou cota com data com nos últimos 12 meses; `null` sem nenhum. */
  total12m: string | null;
  /** Do mais recente ao mais antigo. */
  items: Dividend[];
}

/** Coleta do Investidor10 no Início do colaborador (SPEC-041 §5.3). */
export interface Investidor10Status {
  enabled: boolean;
  lastRun: { at: string; status: 'sucesso' | 'parcial' | 'falha' } | null;
  collected: number;
  noPage: number;
  errors: number;
  activeAssets: number;
}

/** Erro das rotas quando a coleta do Investidor10 está desligada (fim da autorização). */
export type FundamentalsErrorCode = 'source_disabled';
