import { INDEX_PATHS } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenService } from '../../identity/application/ports.js';
import { makeAuthenticate, requireCollaborator } from '../../identity/controllers/authenticate.js';
import type { CdiStatusService } from '../application/cdi-status-service.js';

export interface IndexRoutesOptions {
  cdi: CdiStatusService;
  accessTokens: AccessTokenService;
}

/**
 * Indexadores (SPEC-007 §5.2): só a situação da série do CDI, para o colaborador. Nenhuma rota
 * devolve a série; a SPEC-020 cria a leitura que precisar.
 */
export function registerIndexRoutes(app: FastifyInstance, options: IndexRoutesOptions): void {
  const collaboratorOnly = {
    preHandler: [makeAuthenticate(options.accessTokens), requireCollaborator],
  };

  app.get(INDEX_PATHS.cdi, collaboratorOnly, async (_request, reply) => {
    return reply.send(await options.cdi.status());
  });
}
