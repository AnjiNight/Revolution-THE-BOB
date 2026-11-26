import { PREMIUM_REQUIRED, SUBSCRIPTION_PATHS } from '@simulador/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import { HttpError } from '../../../shared/http/http-error.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireUser,
} from '../../identity/controllers/authenticate.js';
import type { SubscriptionService } from '../application/subscription-service.js';

export interface SubscriptionRoutesOptions {
  subscriptions: SubscriptionService;
  accessTokens: AccessTokenService;
}

const run = domainErrorRunner({
  plan_not_found: { status: 400, message: 'Escolha o plano mensal ou o anual.' },
  subscription_active: { status: 409, message: 'Você já tem uma assinatura ativa.' },
  subscription_not_found: { status: 404, message: 'Você não tem assinatura ativa.' },
});

/**
 * preHandler dos recursos premium, depois de `authenticate` (DA12): 403 `premium_required` para
 * quem não tem assinatura ativa. O colaborador não tem plano e passa (decisão 6).
 */
export function makeRequirePremium(subscriptions: Pick<SubscriptionService, 'hasPremium'>) {
  return async function requirePremium(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const { userId, role } = requireAuth(request);
    if (!(await subscriptions.hasPremium(userId, role))) {
      throw new HttpError(403, PREMIUM_REQUIRED, 'Este é um recurso do plano Assinante.');
    }
  };
}

/** SPEC-025: planos e a assinatura da pessoa conectada (pagamento simulado). */
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  options: SubscriptionRoutesOptions,
): void {
  const { subscriptions } = options;
  const authenticate = makeAuthenticate(options.accessTokens);
  const signedIn = { preHandler: [authenticate] };
  // Assinar, cancelar e reativar: só a conta de usuário; o colaborador não tem plano.
  const userOnly = { preHandler: [authenticate, requireUser] };

  // Os planos são públicos: a tela de planos pode aparecer antes do login.
  app.get(SUBSCRIPTION_PATHS.plans, async (_request, reply) =>
    reply.send(await subscriptions.plans()),
  );

  app.get(SUBSCRIPTION_PATHS.mine, signedIn, async (request, reply) => {
    const { userId, role } = requireAuth(request);
    return reply.send(await subscriptions.mine(userId, role));
  });

  app.post<{ Body: { plan?: unknown } | null }>(
    SUBSCRIPTION_PATHS.mine,
    userOnly,
    async (request, reply) => {
      const { userId, role } = requireAuth(request);
      const plan = request.body && typeof request.body === 'object' ? request.body.plan : undefined;
      const result = await run(() => subscriptions.subscribe(userId, role, plan));
      return reply.status(201).send(result);
    },
  );

  app.post(SUBSCRIPTION_PATHS.cancel, userOnly, async (request, reply) => {
    const { userId, role } = requireAuth(request);
    return reply.send(await run(() => subscriptions.cancel(userId, role)));
  });

  app.post(SUBSCRIPTION_PATHS.resume, userOnly, async (request, reply) => {
    const { userId, role } = requireAuth(request);
    return reply.send(await run(() => subscriptions.resume(userId, role)));
  });
}
