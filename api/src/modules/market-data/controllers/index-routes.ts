import { INDEX_PATHS } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenService } from '../../identity/application/ports.js';
import { makeAuthenticate, requireCollaborator } from '../../identity/controllers/authenticate.js';
import type { CdiStatusService } from '../application/cdi-status-service.js';
import type { MarketIndexStatusService } from '../application/market-index-status-service.js';

export interface IndexRoutesOptions {
  cdi: CdiStatusService;
  /** SPEC-020: Ibovespa e IFIX. */
  marketIndexes: MarketIndexStatusService;
  accessTokens: AccessTokenService;
}

/**
 * Indexadores (SPEC-007 §5.2) e índices da B3 (SPEC-020 §5.2): só a situação das séries, para o
 * colaborador. As séries chegam ao usuário pela rentabilidade da carteira (SPEC-020).
 */
export function registerIndexRoutes(app: FastifyInstance, options: IndexRoutesOptions): void {
  const collaboratorOnly = {
    preHandler: [makeAuthenticate(options.accessTokens), requireCollaborator],
  };

  app.get(INDEX_PATHS.cdi, collaboratorOnly, async (_request, reply) => {
    return reply.send(await options.cdi.status());
  });

  app.get(INDEX_PATHS.marketIndexes, collaboratorOnly, async (_request, reply) => {
    return reply.send(await options.marketIndexes.status());
  });
}
