import { HEALTH_PATH, isHealthResponse } from '@simulador/shared';
import type { ServerStatus } from '../shared/server-status.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Valida o endereço do servidor (RNF09): só HTTPS; HTTP apenas para localhost em desenvolvimento.
 * Devolve null quando o endereço não pode ser usado.
 */
export function validateServerUrl(raw: string, allowInsecureLocalhost: boolean): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && allowInsecureLocalhost && LOCAL_HOSTS.has(url.hostname)) {
    return url;
  }
  return null;
}

export interface CheckOptions {
  allowInsecureLocalhost: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Consulta GET /api/health e traduz a resposta para a situação exibida ao usuário. */
export async function checkServerHealth(
  rawUrl: string,
  options: CheckOptions,
): Promise<ServerStatus> {
  const base = validateServerUrl(rawUrl, options.allowInsecureLocalhost);
  if (!base) return { kind: 'invalid-url' };

  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(new URL(HEALTH_PATH, base), {
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      headers: { accept: 'application/json' },
    });
    const body: unknown = await response.json();
    if (!isHealthResponse(body)) return { kind: 'unavailable' };
    if (response.status === 200 && body.status === 'ok') {
      return { kind: 'connected', version: body.version };
    }
    if (response.status === 503 && body.status === 'degraded') {
      return { kind: 'degraded', version: body.version };
    }
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
