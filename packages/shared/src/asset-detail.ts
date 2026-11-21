import { z } from 'zod';
import type { Asset, AssetHistory, AssetQuote } from './assets.js';
import { validate, type ValidationResult } from './auth.js';
import { isoDateInBrasilia } from './calendar.js';

/**
 * Último pregão de um ativo nos arquivos da B3 (SPEC-010 §4.2). Preços e volume em decimal como
 * texto (RNF12).
 */
export interface AssetSession {
  /** AAAA-MM-DD. */
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  /** Fechamento do pregão anterior guardado; `null` no primeiro pregão do ativo. */
  previousClose: string | null;
  /** Variação sobre o fechamento anterior, em %, com 2 casas; `null` sem ele. */
  change: string | null;
  trades: number | null;
  volume: string | null;
}

/** Corpo de `GET /api/assets/:id` (SPEC-010): os dados da busca e o que só a ficha mostra. */
export interface AssetDetail extends Asset {
  active: boolean;
  /** ISO 8601; `null` no ativo ativo. */
  deactivatedAt: string | null;
  lastSession: AssetSession | null;
  history: AssetHistory;
}

/** Períodos do gráfico (SPEC-010 §4.2): 1 mês, 6 meses, 1 ano, 5 anos e Tudo. */
export const PRICE_HISTORY_PERIODS = ['1m', '6m', '1y', '5y', 'max'] as const;
export type PriceHistoryPeriod = (typeof PRICE_HISTORY_PERIODS)[number];

/** A ficha abre em 1 ano (decisão 2 da SPEC-010). */
export const DEFAULT_PRICE_HISTORY_PERIOD: PriceHistoryPeriod = '1y';

/** Com a ficha aberta, a cotação do topo é pedida de novo a cada 5 minutos (SPEC-010 §4.2). */
export const ASSET_DETAIL_REFRESH_MINUTES = 5;

export interface PricePoint {
  /** AAAA-MM-DD. */
  date: string;
  close: string;
}

export interface PriceExtreme {
  date: string;
  price: string;
}

/**
 * Salto de um pregão para o seguinte: fechamento pelo menos 1,8 vez maior ou menor que o anterior
 * (desdobramento, grupamento ou variação real; SPEC-010, decisão 1).
 */
export interface PriceJump {
  date: string;
  /** Variação sobre o pregão anterior, em %, com 2 casas. */
  change: string;
}

export interface PriceSummary {
  /** Do primeiro ao último fechamento do período, em %, com 2 casas; `null` com salto no período. */
  change: string | null;
  min: PriceExtreme;
  max: PriceExtreme;
}

/** Evento corporativo no gráfico (SPEC-042), pela B3. */
export interface PriceEvent {
  kind: 'desdobramento' | 'grupamento' | 'bonificacao';
  /** Data com (AAAA-MM-DD): o preço muda no pregão seguinte. */
  date: string;
  /** Quantas ações passa a valer uma ("4", "0.1", "1.05"). */
  multiplier: string;
  source: 'b3';
}

/** Corpo de `GET /api/assets/:id/history`. */
export interface PriceHistory {
  period: PriceHistoryPeriod;
  /** SPEC-042: preços ajustados pelos eventos corporativos (padrão) ou como a B3 publicou. */
  adjusted: boolean;
  /** Eventos com data com dentro do período. */
  events: PriceEvent[];
  /** Primeiro e último pregão mostrados; `null` sem cotação. */
  from: string | null;
  to: string | null;
  /** O histórico do ativo começa depois do início do período ("Histórico desde…"). */
  shorterThanPeriod: boolean;
  /** Um ponto por pregão, em ordem de data. */
  points: PricePoint[];
  /** `null` com menos de dois pregões. */
  summary: PriceSummary | null;
  jumps: PriceJump[];
}

export interface PriceHistoryQuery {
  period: PriceHistoryPeriod;
  /** SPEC-042: `false` mostra os preços como a B3 publicou. */
  adjusted: boolean;
}

const priceHistoryQuerySchema = z.object({
  period: z.enum(PRICE_HISTORY_PERIODS, { error: 'invalid_option' }).optional(),
  adjusted: z.enum(['true', 'false'], { error: 'invalid_option' }).optional(),
});

/** Valida a query string do gráfico; sem `period`, 1 ano; sem `adjusted`, ajustado. */
export function validatePriceHistoryQuery(input: unknown): ValidationResult<PriceHistoryQuery> {
  const checked = validate(priceHistoryQuerySchema, input);
  if (!checked.success) return checked;
  return {
    success: true,
    data: {
      period: checked.data.period ?? DEFAULT_PRICE_HISTORY_PERIOD,
      adjusted: checked.data.adjusted !== 'false',
    },
  };
}

export function isPriceHistoryPeriod(value: unknown): value is PriceHistoryPeriod {
  return typeof value === 'string' && (PRICE_HISTORY_PERIODS as readonly string[]).includes(value);
}

/**
 * Qual preço vai no topo da ficha (SPEC-010 §4.2): a cotação do pregão quando ela é de um dia
 * depois do último fechamento da B3 (no horário de Brasília); senão, o fechamento, que é o oficial.
 */
export function showsIntradayQuote(
  quote: AssetQuote | null,
  lastSession: Pick<AssetSession, 'date'> | null,
): quote is AssetQuote {
  if (!quote) return false;
  if (!lastSession) return true;
  return isoDateInBrasilia(new Date(quote.at)) > lastSession.date;
}
