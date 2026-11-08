import { describe, expect, it, vi } from 'vitest';
import { IndexSourceError } from '../application/ports.js';
import { B3IndexHttpSource } from './b3-index-source.js';

function source(response: () => Response | Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
  return { fetch, b3: new B3IndexHttpSource({ baseUrl: 'https://b3.test/', fetch }) };
}

describe('estatísticas históricas pelo site da B3 (SPEC-020, DA06)', () => {
  it('pede um índice e um ano com os parâmetros em base64, como o site', async () => {
    const { fetch, b3 } = source(() => Response.json({ results: [] }));
    expect(await b3.year('IBOV', 2025)).toEqual({ results: [] });
    const [url, init] = fetch.mock.calls[0] ?? [];
    const encoded = String(url).split('/').at(-1) ?? '';
    expect(String(url)).toMatch(
      /^https:\/\/b3\.test\/indexStatisticsProxy\/IndexCall\/GetPortfolioDay\//,
    );
    expect(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))).toEqual({
      index: 'IBOV',
      language: 'pt-br',
      year: '2025',
    });
    expect(init?.headers).toMatchObject({
      'User-Agent': 'simulador-investimentos (projeto academico)',
    });
  });

  it('o JSON dentro de uma string também é lido', async () => {
    const { b3 } = source(() => new Response(JSON.stringify(JSON.stringify({ results: [1] }))));
    expect(await b3.year('IFIX', 2016)).toEqual({ results: [1] });
  });

  it('5xx e 429 podem tentar de novo; 4xx e resposta que não é JSON, não', async () => {
    const kind = async (response: Response) => {
      const error = await source(() => response)
        .b3.year('IBOV', 2025)
        .catch((caught: unknown) => caught);
      return error instanceof IndexSourceError ? error.kind : String(error);
    };
    expect(await kind(new Response('', { status: 503 }))).toBe('retryable');
    expect(await kind(new Response('', { status: 429 }))).toBe('retryable');
    expect(await kind(new Response('', { status: 404 }))).toBe('rejected');
    expect(await kind(new Response('<html>'))).toBe('bad_response');
  });

  it('rede fora do ar pode tentar de novo', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('ECONNRESET')));
    const error = await new B3IndexHttpSource({ fetch })
      .year('IBOV', 2025)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IndexSourceError);
    expect((error as IndexSourceError).kind).toBe('retryable');
  });
});
