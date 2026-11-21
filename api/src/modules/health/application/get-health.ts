import type { HealthResponse } from '@simulador/shared';

/** Porta implementada pela infraestrutura: verifica se o banco responde. */
export interface DatabaseProbe {
  isAvailable(): Promise<boolean>;
}

/** Caso de uso: situação do servidor e do banco (SPEC-001, §5.1). */
export async function getHealth(
  probe: DatabaseProbe,
  version: string,
  now: () => Date = () => new Date(),
): Promise<HealthResponse> {
  const available = await probe.isAvailable().catch(() => false);
  return {
    status: available ? 'ok' : 'degraded',
    version,
    database: available ? 'ok' : 'unavailable',
    timestamp: now().toISOString(),
  };
}
