import { describe, expect, it } from 'vitest';
import { FeedAddressError, NewsSourceError } from '../application/ports.js';
import { FEED_MAX_BYTES, HttpFeedFetcher } from './http-feed-fetcher.js';

/** Respostas falsas por endereço; o nome resolve pelo mapa (sem rede nos testes). */
function fetcher(
  responses: Record<string, () => Response>,
  dns: Record<string, string[]> = {},
): { fetcher: HttpFeedFetcher; calls: string[] } {
  const calls: string[] = [];
  const fake = ((input: string) => {
    calls.push(input);
    const make = responses[input];
    return make ? Promise.resolve(make()) : Promise.reject(new Error(`sem resposta: ${input}`));
  }) as unknown as typeof fetch;
  return {
    calls,
    fetcher: new HttpFeedFetcher({
      fetch: fake,
      resolve: (host) => Promise.resolve(dns[host] ?? ['200.152.33.10']),
    }),
  };
}

describe('busca dos feeds com as regras de segurança (SPEC-027 §4.2, CA05)', () => {
  it('https público: devolve o texto', async () => {
    const { fetcher: f } = fetcher({
      'https://site.com/feed': () => new Response('<rss></rss>', { status: 200 }),
    });
    expect(await f.fetch('https://site.com/feed')).toBe('<rss></rss>');
  });

  it('http, localhost, IP interno e nome que resolve para a rede interna: recusados', async () => {
    const { fetcher: f, calls } = fetcher({}, { 'interno.com': ['10.1.2.3'] });
    await expect(f.fetch('http://site.com/feed')).rejects.toThrow(FeedAddressError);
    await expect(f.fetch('https://localhost/feed')).rejects.toThrow(FeedAddressError);
    await expect(f.fetch('https://[::1]/feed')).rejects.toThrow(FeedAddressError);
    await expect(f.fetch('https://169.254.169.254/latest')).rejects.toThrow(FeedAddressError);
    await expect(f.fetch('https://interno.com/feed')).rejects.toThrow(FeedAddressError);
    expect(calls).toEqual([]);
  });

  it('redirecionamento para a rede interna é recusado antes de seguir', async () => {
    const { fetcher: f, calls } = fetcher({
      'https://site.com/feed': () =>
        new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }),
    });
    await expect(f.fetch('https://site.com/feed')).rejects.toThrow(FeedAddressError);
    expect(calls).toEqual(['https://site.com/feed']);
  });

  it('redirecionamento público é seguido', async () => {
    const { fetcher: f } = fetcher({
      'https://site.com/feed': () =>
        new Response(null, { status: 301, headers: { location: '/novo-feed' } }),
      'https://site.com/novo-feed': () => new Response('<rss/>', { status: 200 }),
    });
    expect(await f.fetch('https://site.com/feed')).toBe('<rss/>');
  });

  it('mais de 2 MB: recusado, mesmo sem o tamanho no cabeçalho', async () => {
    const big = 'x'.repeat(FEED_MAX_BYTES + 10);
    const { fetcher: f } = fetcher({
      'https://site.com/feed': () => new Response(big, { status: 200 }),
    });
    await expect(f.fetch('https://site.com/feed')).rejects.toThrow(/2 MB/);
  });

  it('erro do servidor tenta de novo depois; 404 não', async () => {
    const { fetcher: f } = fetcher({
      'https://site.com/500': () => new Response('', { status: 500 }),
      'https://site.com/404': () => new Response('', { status: 404 }),
    });
    await expect(f.fetch('https://site.com/500')).rejects.toMatchObject({ kind: 'retryable' });
    const notFound = await f.fetch('https://site.com/404').catch((error: unknown) => error);
    expect(notFound).toBeInstanceOf(NewsSourceError);
    expect(notFound).toMatchObject({ kind: 'invalid' });
  });
});
