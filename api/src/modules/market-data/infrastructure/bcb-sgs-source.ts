import type { IsoDate } from '@simulador/shared';
import { IndexSourceError, type IndexSource } from '../application/ports.js';
import { toSgsDate } from '../domain/cdi.js';

/** Endereço público da API SGS do Banco Central. */
export const BCB_SGS_BASE_URL = 'https://api.bcb.gov.br';

const REQUEST_TIMEOUT_MS = 60_000;

export interface BcbSgsSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador da API SGS do Banco Central (SPEC-007, DA06): uma série por intervalo de datas, em
 * JSON, sem token. A API recusa (406) intervalo de mais de 10 anos e consulta sem datas; o
 * processador consulta ano a ano.
 */
export class BcbSgsSource implements IndexSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: BcbSgsSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? BCB_SGS_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async series(code: number, from: IsoDate, to: IsoDate): Promise<unknown[] | null> {
    const url =
      `${this.baseUrl}/dados/serie/bcdata.sgs.${code}/dados?formato=json` +
      `&dataInicial=${encodeURIComponent(toSgsDate(from))}` +
      `&dataFinal=${encodeURIComponent(toSgsDate(to))}`;
    const label = `série ${code} de ${from} a ${to}`;
    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new IndexSourceError(
        'retryable',
        `Banco Central fora do ar (${label}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Nada publicado no intervalo (o CDI de hoje só sai no dia útil seguinte).
    if (response.status === 404) return null;
    if (response.status === 429 || response.status >= 500) {
      throw new IndexSourceError(
        'retryable',
        `Banco Central respondeu ${response.status} (${label})`,
      );
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
      throw new IndexSourceError(
        'rejected',
        `Banco Central recusou a consulta (${response.status}, ${label})${detail ? `: ${detail}` : ''}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new IndexSourceError('bad_response', `resposta do Banco Central não é JSON (${label})`);
    }
    if (!Array.isArray(body)) {
      throw new IndexSourceError(
        'bad_response',
        `resposta do Banco Central não é uma lista (${label})`,
      );
    }
    return body;
  }
}
