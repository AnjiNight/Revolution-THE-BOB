import {
  acceptConsentSchema,
  accountDeletionConfirmSchema,
  accountDeletionRequestSchema,
  changeEmailSchema,
  changePasswordSchema,
  confirmEmailChangeSchema,
  PROFILE_PATHS,
  updateNameSchema,
} from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { parseBody } from '../../../shared/http/validation.js';
import type { AccountDataService } from '../application/account-data-service.js';
import type { AccessTokenService } from '../application/ports.js';
import type { ProfileService } from '../application/profile-service.js';
import { run } from './auth-routes.js';
import { makeAuthenticate, requireAuth } from './authenticate.js';

export interface ProfileRoutesOptions {
  profile: ProfileService;
  /** SPEC-034: exportação e exclusão dos dados pessoais. */
  accountData: AccountDataService;
  accessTokens: AccessTokenService;
  /** Limite por minuto e por IP nas rotas sensíveis: senha atual, códigos e dados pessoais (RNF10). */
  rateLimitPerMinute: number;
}

/** Perfil e consentimentos da pessoa conectada (SPEC-003). Nenhuma rota recebe id de usuário. */
export function registerProfileRoutes(app: FastifyInstance, options: ProfileRoutesOptions): void {
  const { profile } = options;
  const authenticated = { preHandler: makeAuthenticate(options.accessTokens) };
  const withPassword = {
    ...authenticated,
    config: { rateLimit: { max: options.rateLimitPerMinute, timeWindow: '1 minute' } },
  };

  app.get(PROFILE_PATHS.profile, authenticated, async (request, reply) => {
    const user = await run(() => profile.getProfile(requireAuth(request).userId));
    return reply.send({ user });
  });

  app.patch(PROFILE_PATHS.profile, authenticated, async (request, reply) => {
    const { name } = parseBody(updateNameSchema, request.body);
    const user = await run(() => profile.updateName(requireAuth(request).userId, name));
    return reply.send({ user });
  });

  // SPEC-039: o e-mail ainda não muda; o código vai para o endereço novo.
  app.put(PROFILE_PATHS.email, withPassword, async (request, reply) => {
    const input = parseBody(changeEmailSchema, request.body);
    await run(() => profile.changeEmail(requireAuth(request).userId, input, request.log));
    return reply.status(202).send();
  });

  app.post(PROFILE_PATHS.emailConfirm, withPassword, async (request, reply) => {
    const input = parseBody(confirmEmailChangeSchema, request.body);
    const user = await run(() =>
      profile.confirmEmailChange(requireAuth(request).userId, input, request.log),
    );
    return reply.send({ user });
  });

  // Devolve uma sessão nova: todas as anteriores, inclusive a atual, são encerradas.
  app.put(PROFILE_PATHS.password, withPassword, async (request, reply) => {
    const input = parseBody(changePasswordSchema, request.body);
    return reply.send(await run(() => profile.changePassword(requireAuth(request).userId, input)));
  });

  app.get(PROFILE_PATHS.consents, authenticated, async (request, reply) => {
    return reply.send(await run(() => profile.listConsents(requireAuth(request).userId)));
  });

  // SPEC-034: arquivo com tudo o que o app guarda sobre a pessoa (LGPD).
  app.get(PROFILE_PATHS.export, withPassword, async (request, reply) => {
    const data = await run(() => options.accountData.exportData(requireAuth(request).userId));
    const day = data.exportedAt.slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="simulador-meus-dados-${day}.json"`)
      .send(data);
  });

  // SPEC-034: o código vai para o e-mail da conta; nada é apagado ainda.
  app.post(PROFILE_PATHS.deletionRequest, withPassword, async (request, reply) => {
    const { locale } = parseBody(accountDeletionRequestSchema, request.body);
    await run(() =>
      options.accountData.requestDeletion(requireAuth(request).userId, locale, request.log),
    );
    return reply.status(202).send();
  });

  // SPEC-034: código certo apaga a conta na hora (RB04).
  app.post(PROFILE_PATHS.deletionConfirm, withPassword, async (request, reply) => {
    const { code, locale } = parseBody(accountDeletionConfirmSchema, request.body);
    await run(() =>
      options.accountData.confirmDeletion(requireAuth(request).userId, code, locale, request.log),
    );
    return reply.status(204).send();
  });

  app.post(PROFILE_PATHS.consents, authenticated, async (request, reply) => {
    const input = parseBody(acceptConsentSchema, request.body);
    const consent = await run(() => profile.acceptConsent(requireAuth(request).userId, input));
    return reply.status(201).send({ consent });
  });
}
