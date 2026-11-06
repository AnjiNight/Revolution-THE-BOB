import { FUNDAMENTALS_PATHS, isDividendPeriod, type DividendPeriod } from '@simulador/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../../../shared/http/http-error.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import { makeAuthenticate, requireCollaborator } from '../../identity/controllers/authenticate.js';
import {
  FundamentalsAssetNotFoundError,
  SourceDisabledError,
  type FundamentalsService,
} from '../application/fundamentals-service.js';

export interface FundamentalsRoutesOptions {
  fundamentals: FundamentalsService;
  accessTokens: AccessTokenService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IdParams {
  id: string;
}

/**
 * Indicadores (SPEC-041) e proventos (SPEC-042) da ficha do ativo, para qualquer pessoa conectada,
 * e a situação da coleta do Investidor10 para o colaborador. Nenhuma rota devolve os dados em massa
 * (SPEC-041 §4.1).
 */
export function registerFundamentalsRoutes(
  app: FastifyInstance,
  options: FundamentalsRoutesOptions,
): void {
  const authenticate = makeAuthenticate(options.accessTokens);
  const authenticated = { preHandler: authenticate };
  const collaboratorOnly = { preHandler: [authenticate, requireCollaborator] };
  const { fundamentals } = options;

  app.get<{ Params: IdParams }>(
    FUNDAMENTALS_PATHS.fundamentals,
    authenticated,
    async (request, reply) => {
      return reply.send(await run(() => fundamentals.fundamentals(assetId(request))));
    },
  );

  app.get<{ Params: IdParams; Querystring: { period?: string } }>(
    FUNDAMENTALS_PATHS.dividends,
    authenticated,
    async (request, reply) => {
      const id = assetId(request);
      const period = request.query.period ?? '12m';
      if (!isDividendPeriod(period)) {
        throw new HttpError(400, 'validation_error', 'Período inválido.', {
          period: 'invalid_option',
        });
      }
      return reply.send(await run(() => fundamentals.dividends(id, period as DividendPeriod)));
    },
  );

  app.get(FUNDAMENTALS_PATHS.collection, collaboratorOnly, async (_request, reply) => {
    return reply.send(await fundamentals.status());
  });
}

function assetId(request: FastifyRequest<{ Params: IdParams }>): string {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) throw new HttpError(404, 'asset_not_found', 'Ativo não encontrado.');
  return id;
}

async function run<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SourceDisabledError) {
      throw new HttpError(
        404,
        'source_disabled',
        'Os indicadores do Investidor10 estão desligados.',
      );
    }
    if (error instanceof FundamentalsAssetNotFoundError) {
      throw new HttpError(404, 'asset_not_found', 'Ativo não encontrado.');
    }
    throw error;
  }
}
