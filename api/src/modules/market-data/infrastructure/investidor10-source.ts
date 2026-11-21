import { Investidor10SourceError, type Investidor10Source } from '../application/ports.js';

/** Endereço do Investidor10. */
export const INVESTIDOR10_BASE_URL = 'https://investidor10.com.br';

const REQUEST_TIMEOUT_MS = 60_000;
/** Identifica o projeto para quem autorizou o uso (SPEC-041 §4.3). */
const USER_AGENT = 'simulador-investimentos (projeto academico Mackenzie, uso autorizado)';

export interface Investidor10HttpSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador do Investidor10 (SPEC-041, DA06): a página pública de cada ativo e o histórico anual de
 * indicadores, que a página carrega à parte. Uso autorizado por escrito, só neste projeto
 * acadêmico; quem chama só chama com o interruptor ligado.
 */
export class Investidor10HttpSource implements Investidor10Source {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: Investidor10HttpSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? INVESTIDOR10_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async page(path: string): Promise<string | null> {
    const response = await this.get(`${this.baseUrl}/${path}/`, 'text/html');
    return response ? response.text() : null;
  }

  async history(id: number): Promise<unknown> {
    const response = await this.get(
      `${this.baseUrl}/api/historico-indicadores/${id}/10?v=2`,
      'application/json',
    );
    if (!response) return null;
    try {
      return await response.json();
    } catch {
      throw new Investidor10SourceError('retryable', `histórico ${id}: resposta que não é JSON`);
    }
  }

  private async get(url: string, accept: string): Promise<Response | null> {
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Investidor10SourceError(
        'retryable',
        `Investidor10 fora do ar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Ticker que o site não tem: 404, ou 410 como o site responde hoje.
    if (response.status === 404 || response.status === 410) return null;
    if (response.status === 403 || response.status === 429) {
      throw new Investidor10SourceError('blocked', `Investidor10 recusou (${response.status})`);
    }
    if (!response.ok) {
      throw new Investidor10SourceError('retryable', `Investidor10 respondeu ${response.status}`);
    }
    return response;
  }
}
