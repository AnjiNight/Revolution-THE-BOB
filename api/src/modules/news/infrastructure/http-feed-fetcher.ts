import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { FeedAddressError, NewsSourceError, type FeedFetcher } from '../application/ports.js';
import { isLocalHostname, isPrivateAddress } from '../domain/address.js';

/** Limites do §4.2: 2 MB, 20 segundos e até 3 redirecionamentos (cada um conferido de novo). */
export const FEED_MAX_BYTES = 2 * 1024 * 1024;
export const FEED_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'simulador-investimentos (projeto academico Mackenzie)';

export interface HttpFeedFetcherOptions {
  fetch?: typeof fetch;
  /** Endereços do nome; trocado nos testes. */
  resolve?: (hostname: string) => Promise<string[]>;
}

/**
 * Busca os feeds das fontes curadas com as regras de segurança da DA19 e do §4.2: só `https`, só
 * endereços públicos (também depois de cada redirecionamento), resposta de até 2 MB em até 20
 * segundos. O texto volta como veio; quem lê o feed guarda só texto puro.
 */
export class HttpFeedFetcher implements FeedFetcher {
  private readonly fetchFn: typeof fetch;
  private readonly resolve: (hostname: string) => Promise<string[]>;

  constructor(options: HttpFeedFetcherOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.resolve =
      options.resolve ??
      (async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address));
  }

  async fetch(url: string): Promise<string> {
    const signal = AbortSignal.timeout(FEED_TIMEOUT_MS);
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await this.checkAddress(target);
      let response: Response;
      try {
        response = await this.fetchFn(target, {
          redirect: 'manual',
          signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          },
        });
      } catch (error) {
        throw new NewsSourceError(
          'retryable',
          `feed fora do ar: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new NewsSourceError('invalid', 'redirecionamento sem destino');
        target = new URL(location, target).toString();
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        throw new NewsSourceError('invalid', `feed não encontrado (${response.status})`);
      }
      if (!response.ok) throw new NewsSourceError('retryable', `feed respondeu ${response.status}`);
      return readLimited(response);
    }
    throw new NewsSourceError('invalid', 'redirecionamentos demais');
  }

  private async checkAddress(url: string): Promise<void> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new FeedAddressError('not_https');
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (isLocalHostname(host)) throw new FeedAddressError('private_address');
    let addresses: string[];
    if (isIP(host)) addresses = [host];
    else {
      try {
        addresses = await this.resolve(host);
      } catch {
        throw new NewsSourceError('retryable', `nome não encontrado: ${host}`);
      }
    }
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new FeedAddressError('private_address');
    }
  }
}

/** Lê o corpo até o limite; passou, para e recusa. */
async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > FEED_MAX_BYTES) throw new NewsSourceError('invalid', 'feed maior que 2 MB');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FEED_MAX_BYTES) {
      await reader.cancel();
      throw new NewsSourceError('invalid', 'feed maior que 2 MB');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
