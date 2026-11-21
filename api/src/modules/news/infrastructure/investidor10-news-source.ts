import { NewsSourceError, type ParentNewsSource } from '../application/ports.js';

/** Endereço do Investidor10 (o mesmo da SPEC-041). */
export const INVESTIDOR10_NEWS_BASE_URL = 'https://investidor10.com.br';

const REQUEST_TIMEOUT_MS = 60_000;
/** Identifica o projeto para quem autorizou o uso (SPEC-041 §4.3, SPEC-027 §4.1). */
const USER_AGENT = 'simulador-investimentos (projeto academico Mackenzie, uso autorizado)';

export interface Investidor10NewsHttpSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Notícias do Investidor10 (SPEC-027, DA06): o sitemap de notícias, o sitemap do arquivo e a página
 * de cada notícia. Uso autorizado só neste projeto acadêmico; quem chama só chama com o
 * interruptor ligado.
 */
export class Investidor10NewsHttpSource implements ParentNewsSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: Investidor10NewsHttpSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? INVESTIDOR10_NEWS_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async newsSitemap(): Promise<string> {
    const text = await this.get(`${this.baseUrl}/sitemap-news.xml`, 'application/xml');
    if (text === null) throw new NewsSourceError('retryable', 'sitemap de notícias não encontrado');
    return text;
  }

  async archiveSitemap(): Promise<string> {
    const text = await this.get(`${this.baseUrl}/noticias/sitemap.xml`, 'application/xml');
    if (text === null) throw new NewsSourceError('retryable', 'sitemap do arquivo não encontrado');
    return text;
  }

  /** Só páginas do próprio site: o endereço vem do sitemap, mas nunca se segue outro domínio. */
  async article(url: string): Promise<string | null> {
    const base = new URL(this.baseUrl);
    const target = new URL(url);
    if (target.host !== base.host) {
      throw new NewsSourceError('invalid', `endereço fora do Investidor10: ${target.host}`);
    }
    target.protocol = base.protocol;
    return this.get(target.toString(), 'text/html');
  }

  private async get(url: string, accept: string): Promise<string | null> {
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new NewsSourceError(
        'retryable',
        `Investidor10 fora do ar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status === 404 || response.status === 410) return null;
    if (response.status === 403 || response.status === 429) {
      throw new NewsSourceError('blocked', `Investidor10 recusou (${response.status})`);
    }
    if (!response.ok) {
      throw new NewsSourceError('retryable', `Investidor10 respondeu ${response.status}`);
    }
    return response.text();
  }
}
