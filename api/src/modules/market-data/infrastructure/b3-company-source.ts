import type { B3CompanySource } from '../application/ports.js';

/** Endereço das páginas das empresas listadas no site da B3. */
export const B3_LISTED_BASE_URL = 'https://sistemaswebb3-listados.b3.com.br';

const REQUEST_TIMEOUT_MS = 60_000;

export interface B3CompanyHttpSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador da página da empresa no site da B3 (SPEC-042, DA06), usada só para os eventos
 * corporativos, com as regras de uso acadêmico do §4.3 (só dentro do app, com "Fonte: B3"). A
 * consulta é o JSON que o próprio site usa, com os parâmetros em base64.
 */
export class B3CompanyHttpSource implements B3CompanySource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: B3CompanyHttpSourceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? B3_LISTED_BASE_URL).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  company(code: string): Promise<unknown> {
    return this.call(
      'GetListedSupplementCompany',
      { issuingCompany: code, language: 'pt-br' },
      code,
    );
  }

  /** SPEC-021: a página de detalhe da empresa, com a classificação setorial da B3. */
  detail(codeCvm: string): Promise<unknown> {
    return this.call('GetDetail', { codeCVM: codeCvm, language: 'pt-br' }, `CVM ${codeCvm}`);
  }

  private async call(
    method: string,
    query: Record<string, string>,
    code: string,
  ): Promise<unknown> {
    const params = Buffer.from(JSON.stringify(query), 'utf8').toString('base64');
    const response = await this.fetch(
      `${this.baseUrl}/listedCompaniesProxy/CompanyCall/${method}/${params}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'simulador-investimentos (projeto academico)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`B3 respondeu ${response.status} para ${code}`);
    const text = await response.text();
    if (text.trim() === '') return null;
    try {
      const body = JSON.parse(text) as unknown;
      // A B3 responde o JSON dentro de uma string ("[{\"stockCapital\":…"), conferido em 05/11/2026.
      return typeof body === 'string' ? (JSON.parse(body) as unknown) : body;
    } catch {
      throw new Error(`resposta da B3 para ${code} não é JSON`);
    }
  }
}
