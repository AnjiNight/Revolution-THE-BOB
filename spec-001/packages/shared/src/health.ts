/** Caminho da rota de verificação de saúde do servidor (SPEC-001). */
export const HEALTH_PATH = '/api/health';

export type HealthStatus = 'ok' | 'degraded';
export type DatabaseStatus = 'ok' | 'unavailable';

/** Corpo devolvido por `GET /api/health`. Nunca contém detalhes de erro. */
export interface HealthResponse {
  status: HealthStatus;
  version: string;
  database: DatabaseStatus;
  timestamp: string;
}

/** Valida um JSON recebido do servidor, sem confiar no formato. */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'ok' || v.status === 'degraded') &&
    typeof v.version === 'string' &&
    (v.database === 'ok' || v.database === 'unavailable') &&
    typeof v.timestamp === 'string'
  );
}
