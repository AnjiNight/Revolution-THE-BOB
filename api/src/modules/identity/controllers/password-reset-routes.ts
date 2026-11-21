import {
  AUTH_PATHS,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { parseBody } from '../../../shared/http/validation.js';
import type { PasswordResetService } from '../application/password-reset-service.js';
import { run } from './auth-routes.js';

export interface PasswordResetRoutesOptions {
  passwordReset: PasswordResetService;
  /** Mesmo limite por minuto e por IP das outras rotas de /api/auth (RNF10). */
  rateLimitPerMinute: number;
}

/** Recuperação de senha por e-mail (SPEC-004 §5.1). */
export function registerPasswordResetRoutes(
  app: FastifyInstance,
  options: PasswordResetRoutesOptions,
): void {
  const { passwordReset } = options;
  const limited = {
    config: { rateLimit: { max: options.rateLimitPerMinute, timeWindow: '1 minute' } },
  };

  // Sem SMTP, 503 antes de qualquer validação: o app mostra que a recuperação está desligada.
  const ensureEnabled = () => run(async () => passwordReset.assertEnabled());

  // Sempre 202 e sem corpo: a resposta não diz se o e-mail tem conta.
  app.post(AUTH_PATHS.passwordResetRequest, limited, async (request, reply) => {
    await ensureEnabled();
    const input = parseBody(passwordResetRequestSchema, request.body);
    await run(() => passwordReset.request(input, request.log));
    return reply.status(202).send();
  });

  app.post(AUTH_PATHS.passwordResetConfirm, limited, async (request, reply) => {
    await ensureEnabled();
    const input = parseBody(passwordResetConfirmSchema, request.body);
    await run(() => passwordReset.confirm(input, request.log));
    return reply.status(204).send();
  });
}
