import type { MarketTodaySymbol } from '@simulador/shared';
import { decimalFromJson } from '../../financial-calculation/decimal.js';
import {
  MarketQuoteSourceError,
  type MarketQuote,
  type MarketQuoteSource,
} from '../application/ports.js';

/** Endereço público da rota de gráfico da Yahoo Finance. */
export const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com';

/** O símbolo de cada um na Yahoo: o Ibovespa e o dólar em reais. */
export const YAHOO_SYMBOLS: Record<MarketTodaySymbol, string> = {
  ibovespa: '^BVSP',
  dollar: 'BRL=X',
};

const REQUEST_TIMEOUT_MS = 15_000;
/** Um `User-Agent` próprio do app (SPEC-048 §4.2): a Yahoo sabe quem pergunta. */
const USER_AGENT = 'SimuladorInvestimentos/1.0 (projeto academico)';

export interface YahooChartSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador da rota de gráfico da Yahoo Finance (SPEC-048, DA06): uma consulta por símbolo
 * (`/v8/finance/chart/{símbolo}?range=1d&interval=5m`), sem token. Lê só o resumo (`meta`): o
 * último valor, o fechamento anterior e o horário. Uso autorizado para este projeto, conforme
 * informado pela equipe em 21/11/2026. Em erro, nova tentativa só na próxima coleta.
 */
export class YahooChartSource implements MarketQuoteSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: YahooChartSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? YAHOO_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async quote(symbol: MarketTodaySymbol): Promise<MarketQuote> {
    const code = YAHOO_SYMBOLS[symbol];
    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(code)}?range=1d&interval=5m`;
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MarketQuoteSourceError(
        'unavailable',
        `Yahoo fora do ar (${code}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status === 404) {
      throw new MarketQuoteSourceError('no_data', `Yahoo sem dados de ${code}`);
    }
    if (!response.ok) {
      throw new MarketQuoteSourceError(
        'unavailable',
        `Yahoo respondeu ${response.status} (${code})`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MarketQuoteSourceError('bad_response', `resposta da Yahoo não é JSON (${code})`);
    }
    return parseChart(body, code);
  }
}

/** O resumo da resposta da rota de gráfico: o último valor, o fechamento anterior e o horário. */
export function parseChart(body: unknown, code: string): MarketQuote {
  const chart = (body as { chart?: { result?: unknown; error?: unknown } } | null)?.chart;
  const result = Array.isArray(chart?.result) ? (chart.result[0] as unknown) : null;
  const meta = (result as { meta?: Record<string, unknown> } | null)?.meta;
  if (!meta) {
    if (chart && chart.error)
      throw new MarketQuoteSourceError('no_data', `Yahoo sem dados de ${code}`);
    throw new MarketQuoteSourceError('bad_response', `resposta da Yahoo sem o resumo (${code})`);
  }
  const value = positive(meta.regularMarketPrice);
  const time = meta.regularMarketTime;
  if (!value || typeof time !== 'number' || !Number.isFinite(time) || time <= 0) {
    throw new MarketQuoteSourceError(
      'bad_response',
      `resposta da Yahoo sem valor ou horário (${code})`,
    );
  }
  return {
    at: new Date(time * 1000),
    value,
    previousClose: positive(meta.chartPreviousClose) ?? positive(meta.previousClose),
  };
}

/**
 * Número positivo da resposta → texto decimal com até 6 casas (a coluna guarda 6). A Yahoo às vezes
 * manda o ponto flutuante cru (5.905200004577637): arredonda antes.
 */
function positive(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return decimalFromJson(Number(value.toFixed(6)));
}
