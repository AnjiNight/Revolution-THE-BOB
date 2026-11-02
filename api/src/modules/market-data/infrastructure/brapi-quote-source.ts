import {
  QuoteSourceError,
  type IntradayQuoteSource,
  type QuoteUsage,
  type SourceQuote,
} from '../application/ports.js';
import { compareDecimals, decimalFromJson } from '../domain/decimal.js';

export const BRAPI_BASE_URL = 'https://brapi.dev';

const REQUEST_TIMEOUT_MS = 15_000;

export interface BrapiQuoteSourceOptions {
  /** Token do plano (SPEC-009). Sem ele, a brapi só responde os tickers de teste. */
  token: string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  clock?: () => Date;
}

/**
 * Adaptador da brapi (DA06): cotação simples de um ativo (`/api/quote/{ticker}`, que vale para
 * ações e FIIs em todos os planos), com o token no cabeçalho. Converte a resposta para o formato
 * do sistema e classifica as falhas. A cota do plano vem nos cabeçalhos de cada resposta.
 */
export class BrapiQuoteSource implements IntradayQuoteSource {
  readonly tokenConfigured: boolean;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly clock: () => Date;

  constructor(private readonly options: BrapiQuoteSourceOptions) {
    this.tokenConfigured = Boolean(options.token);
    this.baseUrl = (options.baseUrl ?? BRAPI_BASE_URL).replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.clock = options.clock ?? (() => new Date());
  }

  async quote(ticker: string): Promise<SourceQuote> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}/api/quote/${encodeURIComponent(ticker)}`, {
        headers: {
          accept: 'application/json',
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new QuoteSourceError(
        'unavailable',
        `brapi não respondeu (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    const usage = usageFrom(response.headers, this.clock());

    if (response.status === 429) {
      // Cota do ciclo zerada: não adianta tentar antes de renovar. Senão, limite por minuto.
      if (usage && usage.remaining <= 0) {
        throw new QuoteSourceError('quota_exhausted', 'cota do plano da brapi esgotada', usage);
      }
      throw new QuoteSourceError('rate_limited', 'brapi pediu para esperar (429)', usage);
    }
    if (response.status === 404 || response.status === 400) {
      throw new QuoteSourceError(
        'not_found',
        `ticker não encontrado na brapi (${response.status})`,
        usage,
      );
    }
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      throw new QuoteSourceError(
        'unauthorized',
        `a brapi recusou a consulta (${response.status}): token ausente ou inválido para este ticker`,
        usage,
      );
    }
    if (!response.ok) {
      throw new QuoteSourceError('unavailable', `brapi respondeu ${response.status}`, usage);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new QuoteSourceError('bad_response', 'resposta da brapi não é JSON', usage);
    }
    return { ...parseQuote(body, ticker), usage };
  }
}

type Fields = Omit<SourceQuote, 'usage'>;

/** Lê o primeiro resultado da resposta. Preço e horário são obrigatórios; o resto é opcional. */
export function parseQuote(body: unknown, ticker: string): Fields {
  const result = (body as { results?: unknown[] } | null)?.results?.[0] as
    Record<string, unknown> | undefined;
  if (!result || typeof result !== 'object') {
    throw new QuoteSourceError('not_found', 'resposta da brapi sem resultado para o ticker');
  }
  if (String(result.symbol ?? '').toUpperCase() !== ticker.toUpperCase()) {
    throw new QuoteSourceError(
      'bad_response',
      `resposta da brapi é de outro ticker (${String(result.symbol)})`,
    );
  }
  const price = decimalFromJson(result.regularMarketPrice);
  if (price === null || compareDecimals(price, '0') <= 0) {
    throw new QuoteSourceError('bad_response', 'resposta da brapi sem preço válido');
  }
  const at =
    typeof result.regularMarketTime === 'string' ? new Date(result.regularMarketTime) : null;
  if (!at || Number.isNaN(at.getTime())) {
    throw new QuoteSourceError('bad_response', 'resposta da brapi sem horário da cotação');
  }
  const optional = (value: unknown) => {
    const text = decimalFromJson(value);
    return text !== null && compareDecimals(text, '0') > 0 ? text : null;
  };
  return {
    price,
    at,
    open: optional(result.regularMarketOpen),
    high: optional(result.regularMarketDayHigh),
    low: optional(result.regularMarketDayLow),
    previousClose: optional(result.regularMarketPreviousClose),
  };
}

/**
 * Cota do plano nos cabeçalhos: `x-ratelimit-remaining`, `x-ratelimit-limit` e `ratelimit-reset`
 * (segundos até renovar) quando a janela é o ciclo de cobrança. Sem token, a brapi só informa o
 * limite por minuto: aí não há cota de ciclo para ler.
 */
export function usageFrom(headers: Headers, now: Date): QuoteUsage | null {
  if (headers.get('x-ratelimit-window') !== 'billing-cycle') return null;
  // Cabeçalho ausente é "não sei", nunca zero: Number(null) daria 0 e pareceria cota esgotada.
  const read = (...names: string[]) => {
    const text = names.map((name) => headers.get(name)).find((value) => value?.trim());
    return text ? Number(text) : Number.NaN;
  };
  const remaining = read('x-ratelimit-remaining', 'ratelimit-remaining');
  const limit = read('x-ratelimit-limit', 'ratelimit-limit');
  const resetSeconds = read('ratelimit-reset');
  if (![remaining, limit, resetSeconds].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return {
    remaining: Math.floor(remaining),
    limit: Math.floor(limit),
    resetsAt: new Date(now.getTime() + resetSeconds * 1000),
  };
}
