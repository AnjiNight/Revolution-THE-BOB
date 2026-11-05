import { PORTFOLIO_PATHS, validateNewPortfolio, validateRenamePortfolio } from '@simulador/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import { HttpError } from '../../../shared/http/http-error.js';
import { ensureValid } from '../../../shared/http/validation.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireUser,
} from '../../identity/controllers/authenticate.js';
import type { PortfolioService } from '../application/portfolio-service.js';
import { PortfolioNotFoundError } from '../domain/errors.js';

export interface PortfolioRoutesOptions {
  portfolios: PortfolioService;
  accessTokens: AccessTokenService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const run = domainErrorRunner({
  portfolio_not_found: { status: 404, message: 'Carteira não encontrada.' },
  portfolio_name_in_use: { status: 409, message: 'Você já tem uma carteira com este nome.' },
  portfolio_limit_reached: { status: 409, message: 'Você já tem o número máximo de carteiras.' },
  calendar_not_published: {
    status: 409,
    message: 'O calendário de pregão desse ano ainda não foi publicado.',
  },
  validation_error: { status: 400, message: 'Dados inválidos.' },
});

interface IdParams {
  id: string;
}

/**
 * Carteiras (SPEC-012 §5.1): só a conta de usuário (403 para o colaborador). Carteira de outra
 * pessoa responde 404, como se não existisse, e a tentativa fica no log sem dados da carteira
 * (RB03, QA05).
 */
export function registerPortfolioRoutes(
  app: FastifyInstance,
  options: PortfolioRoutesOptions,
): void {
  const { portfolios } = options;
  const userOnly = { preHandler: [makeAuthenticate(options.accessTokens), requireUser] };

  /** Rota de uma carteira: a de outra pessoa vira o mesmo 404 e só deixa o aviso no log. */
  const owned = <T>(request: FastifyRequest, action: () => Promise<T>) =>
    run(async () => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof PortfolioNotFoundError && error.foreign) {
          request.log.warn(
            { userId: requireAuth(request).userId },
            'tentativa de acessar carteira de outro usuário',
          );
        }
        throw error;
      }
    });

  app.get(PORTFOLIO_PATHS.list, userOnly, async (request, reply) => {
    return reply.send(await portfolios.list(requireAuth(request).userId));
  });

  app.post(PORTFOLIO_PATHS.list, userOnly, async (request, reply) => {
    const input = ensureValid(validateNewPortfolio(request.body));
    const portfolio = await run(() => portfolios.create(requireAuth(request).userId, input));
    return reply.status(201).send({ portfolio });
  });

  app.get<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const portfolio = await owned(request, () => portfolios.get(requireAuth(request).userId, id));
    return reply.send({ portfolio });
  });

  app.patch<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    const { name } = ensureValid(validateRenamePortfolio(request.body));
    const portfolio = await owned(request, () =>
      portfolios.rename(requireAuth(request).userId, id, name),
    );
    return reply.send({ portfolio });
  });

  app.delete<{ Params: IdParams }>(PORTFOLIO_PATHS.item, userOnly, async (request, reply) => {
    const id = portfolioId(request);
    await owned(request, () => portfolios.delete(requireAuth(request).userId, id));
    return reply.status(204).send();
  });
}

function portfolioId(request: FastifyRequest<{ Params: IdParams }>): string {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) {
    throw new HttpError(404, 'portfolio_not_found', 'Carteira não encontrada.');
  }
  return id;
}
