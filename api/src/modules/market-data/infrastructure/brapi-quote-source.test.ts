import { describe, expect, it } from 'vitest';
import { QuoteSourceError } from '../application/ports.js';
import { BrapiQuoteSource, usageFrom } from './brapi-quote-source.js';

const NOW = new Date('2026-11-03T15:00:00.000Z');

/** Resposta como a brapi devolveu de verdade em 02/11/2026 (só os campos que importam). */
function brapiBody(overrides: Record<string, unknown> = {}) {
  return {
    results: [
      {
        symbol: 'PETR4',
        shortName: 'PETR4',
        currency: 'BRL',
        regularMarketPrice: 52.71,
        regularMarketTime: '2026-11-03T14:31:30.000Z',
        regularMarketOpen: 52.45,
        regularMarketDayHigh: 53.66,
        regularMarketDayLow: 52.36,
        regularMarketPreviousClose: 52.2,
        regularMarketChange: 0.51,
        regularMarketChangePercent: 0.98,
        ...overrides,
      },
    ],
    requestedAt: '2026-11-03T15:00:00.000Z',
    took: 0,
  };
}

const BILLING_HEADERS = {
  'x-ratelimit-window': 'billing-cycle',
  'x-ratelimit-limit': '15000',
  'x-ratelimit-remaining': '14999',
  'ratelimit-reset': '3600',
};

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, headers }));
  };
  return { fetchFn, calls };
}

const source = (fetchFn: typeof fetch, token: string | null = 'token-de-teste') =>
  new BrapiQuoteSource({ token, fetch: fetchFn, baseUrl: 'https://brapi.test/', clock: () => NOW });

async function failure(promise: Promise<unknown>): Promise<QuoteSourceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof QuoteSourceError) return error;
    throw error;
  }
  throw new Error('esperava QuoteSourceError');
}

describe('adaptador da brapi (SPEC-009, CA01)', () => {
  it('lê preço, horário e os dados do dia em decimal, com a cota do ciclo', async () => {
    const { fetchFn, calls } = fakeFetch(200, brapiBody(), BILLING_HEADERS);
    expect(await source(fetchFn).quote('PETR4')).toEqual({
      price: '52.71',
      at: new Date('2026-11-03T14:31:30.000Z'),
      open: '52.45',
      high: '53.66',
      low: '52.36',
      previousClose: '52.2',
      usage: { remaining: 14_999, limit: 15_000, resetsAt: new Date('2026-11-03T16:00:00.000Z') },
    });
    expect(calls[0]?.url).toBe('https://brapi.test/api/quote/PETR4');
    expect(calls[0]?.headers.authorization).toBe('Bearer token-de-teste');
  });

  it('sem token, não manda o cabeçalho; a cota por minuto não é a do ciclo', async () => {
    const { fetchFn, calls } = fakeFetch(200, brapiBody(), {
      'ratelimit-limit': '20',
      'ratelimit-remaining': '19',
      'ratelimit-reset': '60',
    });
    const quote = await source(fetchFn, null).quote('PETR4');
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(quote.usage).toBeNull();
    expect(new BrapiQuoteSource({ token: null }).tokenConfigured).toBe(false);
  });

  it('campos opcionais ausentes viram vazio; preço e horário são obrigatórios', async () => {
    const partial = await source(
      fakeFetch(200, brapiBody({ regularMarketOpen: null, regularMarketDayHigh: undefined }))
        .fetchFn,
    ).quote('PETR4');
    expect(partial).toMatchObject({ open: null, high: null, low: '52.36' });

    for (const broken of [
      { regularMarketPrice: null },
      { regularMarketPrice: 0 },
      { regularMarketTime: 'ontem' },
      { symbol: 'VALE3' },
    ]) {
      const error = await failure(source(fakeFetch(200, brapiBody(broken)).fetchFn).quote('PETR4'));
      expect(error.kind, JSON.stringify(broken)).toBe('bad_response');
    }
    expect((await failure(source(fakeFetch(200, 'não é JSON').fetchFn).quote('PETR4'))).kind).toBe(
      'bad_response',
    );
    expect(
      (await failure(source(fakeFetch(200, { results: [] }).fetchFn).quote('PETR4'))).kind,
    ).toBe('not_found');
  });

  it('classifica as falhas', async () => {
    const kind = async (status: number, headers: Record<string, string> = {}) =>
      (await failure(source(fakeFetch(status, { error: true }, headers).fetchFn).quote('PETR4')))
        .kind;
    expect(await kind(404)).toBe('not_found');
    expect(await kind(400)).toBe('not_found');
    expect(await kind(401)).toBe('unauthorized');
    expect(await kind(403)).toBe('unauthorized');
    expect(await kind(500)).toBe('unavailable');
    expect(await kind(503)).toBe('unavailable');
    expect(await kind(429, { 'retry-after': '30' })).toBe('rate_limited');
    expect(await kind(429, { ...BILLING_HEADERS, 'x-ratelimit-remaining': '0' })).toBe(
      'quota_exhausted',
    );
  });

  it('cota esgotada informa quando renova', async () => {
    const error = await failure(
      source(
        fakeFetch(429, { error: true }, { ...BILLING_HEADERS, 'x-ratelimit-remaining': '0' })
          .fetchFn,
      ).quote('PETR4'),
    );
    expect(error.usage).toEqual({
      remaining: 0,
      limit: 15_000,
      resetsAt: new Date('2026-11-03T16:00:00.000Z'),
    });
  });

  it('brapi fora do ar (rede) vira indisponível', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    expect((await failure(source(offline).quote('PETR4'))).kind).toBe('unavailable');
  });

  it('cabeçalhos de cota incompletos não viram cota', () => {
    expect(usageFrom(new Headers({ 'x-ratelimit-window': 'billing-cycle' }), NOW)).toBeNull();
  });
});
