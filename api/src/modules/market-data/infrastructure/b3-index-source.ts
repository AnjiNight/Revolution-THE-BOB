import { IndexSourceError, type MarketIndexSource } from '../application/ports.js';
import { B3_LISTED_BASE_URL } from './b3-company-source.js';

const REQUEST_TIMEOUT_MS = 60_000;

export interface B3IndexHttpSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador das estatísticas históricas dos índices no site da B3 (SPEC-020 §4.4, DA06), com as
 * regras de uso acadêmico da SPEC-042 §4.3 (só dentro do app, com "Fonte: B3"). A consulta é o JSON
 * que o próprio site usa, com os parâmetros em base64: um índice e um ano por pedido.
 */
export class B3IndexHttpSource implements MarketIndexSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: B3IndexHttpSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? B3_LISTED_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async year(code: string, year: number): Promise<unknown> {
    const params = Buffer.from(
      JSON.stringify({ index: code, language: 'pt-br', year: String(year) }),
      'utf8',
    ).toString('base64');
    const label = `${code} de ${year}`;
    let response: Response;
    try {
      response = await this.fetch(
        `${this.baseUrl}/indexStatisticsProxy/IndexCall/GetPortfolioDay/${params}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'simulador-investimentos (projeto academico)',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new IndexSourceError(
        'retryable',
        `B3 fora do ar (${label}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new IndexSourceError('retryable', `B3 respondeu ${response.status} (${label})`);
    }
    if (!response.ok) {
      throw new IndexSourceError(
        'rejected',
        `B3 recusou a consulta (${response.status}, ${label})`,
      );
    }
    const text = await response.text();
    try {
      const body = JSON.parse(text) as unknown;
      // Como na página da empresa (SPEC-042), a B3 pode responder o JSON dentro de uma string.
      return typeof body === 'string' ? (JSON.parse(body) as unknown) : body;
    } catch {
      throw new IndexSourceError('bad_response', `resposta da B3 não é JSON (${label})`);
    }
  }
}
