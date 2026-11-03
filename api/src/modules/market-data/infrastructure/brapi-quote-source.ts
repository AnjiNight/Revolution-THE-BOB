import {
  QuoteSourceError,
  type AssetListing,
  type ListedAsset,
  type ListKind,
  type QuoteListSource,
  type QuoteUsage,
  type SourceQuote,
} from '../application/ports.js';
import { compareDecimals, decimalFromJson } from '../domain/decimal.js';

export const BRAPI_BASE_URL = 'https://brapi.dev';

const REQUEST_TIMEOUT_MS = 15_000;
/** A lista devolve até 2.000 papéis por página; ações e FIIs cabem numa só (SPEC-040 §4.3). */
const LIST_PAGE_SIZE = 2000;
/** Se um dia precisar de mais páginas, para aqui: nunca uma sequência sem fim de consultas. */
const MAX_LIST_PAGES = 5;

export interface BrapiQuoteSourceOptions {
  /** Token do plano. Opcional desde a SPEC-040: a lista responde igual sem ele. */
  token: string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  clock?: () => Date;
}

/**
 * Adaptador da brapi (DA06). A lista (`/api/quote/list`, SPEC-040) traz ações e FIIs com nome,
 * subsetor, logo, preço e variação, numa consulta por classe; a cotação simples
 * (`/api/quote/{ticker}`, SPEC-009) traz um ativo com o horário e os dados do dia. Converte as
 * respostas para o formato do sistema e classifica as falhas. Quando a brapi desconta a consulta
 * da cota do plano, a cota vem nos cabeçalhos da resposta.
 */
export class BrapiQuoteSource implements QuoteListSource {
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

  async list(kind: ListKind): Promise<AssetListing> {
    const assets: ListedAsset[] = [];
    let requests = 0;
    let usage: QuoteUsage | null = null;
    for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
      const params = new URLSearchParams(
        kind === 'fii' ? { type: 'fund', subType: 'fii' } : { type: 'stock' },
      );
      params.set('limit', String(LIST_PAGE_SIZE));
      params.set('page', String(page));
      const answer = await this.request(`/api/quote/list?${params.toString()}`, 'lista');
      requests += 1;
      usage = answer.usage ?? usage;
      assets.push(...parseList(answer.body, kind));
      if ((answer.body as { hasNextPage?: unknown }).hasNextPage !== true) break;
    }
    return { assets, requests, usage };
  }

  async quote(ticker: string): Promise<SourceQuote> {
    const answer = await this.request(`/api/quote/${encodeURIComponent(ticker)}`, 'ticker');
    return { ...parseQuote(answer.body, ticker), usage: answer.usage };
  }

  /** Faz a consulta e classifica as falhas; devolve o JSON e a cota, se veio. */
  private async request(
    path: string,
    what: 'lista' | 'ticker',
  ): Promise<{ body: unknown; usage: QuoteUsage | null }> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
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
        what === 'ticker'
          ? `ticker não encontrado na brapi (${response.status})`
          : `a brapi não reconheceu a consulta da lista (${response.status})`,
        usage,
      );
    }
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      throw new QuoteSourceError(
        'unauthorized',
        `a brapi recusou a consulta (${response.status}): token ausente ou inválido`,
        usage,
      );
    }
    if (!response.ok) {
      throw new QuoteSourceError('unavailable', `brapi respondeu ${response.status}`, usage);
    }

    try {
      return { body: await response.json(), usage };
    } catch {
      throw new QuoteSourceError('bad_response', 'resposta da brapi não é JSON', usage);
    }
  }
}

const LIST_SUBTYPES: Record<ListKind, ReadonlyArray<ListedAsset['subType']>> = {
  stock: ['stock', 'unit'],
  fii: ['fii'],
};

/**
 * Lê a lista. Papéis de outros tipos (ETF, BDR, FI-Infra...) e itens malformados são descartados;
 * preço zerado ou ausente vira `null` (o papel continua, sem preço).
 */
export function parseList(body: unknown, kind: ListKind): ListedAsset[] {
  const items = (body as { stocks?: unknown } | null)?.stocks;
  if (!Array.isArray(items)) {
    throw new QuoteSourceError('bad_response', 'resposta da lista da brapi sem "stocks"');
  }
  const wanted = LIST_SUBTYPES[kind];
  return items.flatMap((item: unknown): ListedAsset[] => {
    if (!item || typeof item !== 'object') return [];
    const fields = item as Record<string, unknown>;
    const ticker = text(fields.stock)?.toUpperCase();
    const subType = wanted.find((type) => type === fields.subType);
    if (!ticker || !subType) return [];
    const price = decimalFromJson(fields.close);
    return [
      {
        ticker,
        name: text(fields.name) ?? ticker,
        subType,
        subsector: text(fields.subsector),
        logoUrl: text(fields.logo),
        price: price !== null && compareDecimals(price, '0') > 0 ? price : null,
        change: decimalFromJson(fields.change),
      },
    ];
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
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
    const decimal = decimalFromJson(value);
    return decimal !== null && compareDecimals(decimal, '0') > 0 ? decimal : null;
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
 * (segundos até renovar) quando a janela é o ciclo de cobrança. Sem token, ou numa consulta que a
 * brapi não desconta (a lista), ela só informa o limite por minuto: aí não há cota de ciclo.
 */
export function usageFrom(headers: Headers, now: Date): QuoteUsage | null {
  if (headers.get('x-ratelimit-window') !== 'billing-cycle') return null;
  // Cabeçalho ausente é "não sei", nunca zero: Number(null) daria 0 e pareceria cota esgotada.
  const read = (...names: string[]) => {
    const value = names.map((name) => headers.get(name)).find((header) => header?.trim());
    return value ? Number(value) : Number.NaN;
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
