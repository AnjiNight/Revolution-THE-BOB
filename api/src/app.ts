import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import type { AppConfig } from './config.js';
import type { DatabaseProbe } from './modules/health/application/get-health.js';
import { registerHealthRoutes } from './modules/health/controllers/health-routes.js';
import type { AuthService } from './modules/identity/application/auth-service.js';
import type { PasswordResetService } from './modules/identity/application/password-reset-service.js';
import type { AccessTokenService } from './modules/identity/application/ports.js';
import type { ProfileService } from './modules/identity/application/profile-service.js';
import { registerAuthRoutes } from './modules/identity/controllers/auth-routes.js';
import { registerPasswordResetRoutes } from './modules/identity/controllers/password-reset-routes.js';
import { registerProfileRoutes } from './modules/identity/controllers/profile-routes.js';
import { registerErrorHandling } from './shared/http/error-handler.js';
import { HttpError } from './shared/http/http-error.js';
import { loggerOptions } from './shared/infrastructure/logger.js';

export interface AppDependencies {
  config: Pick<AppConfig, 'env' | 'logLevel' | 'authRateLimitPerMinute'>;
  probe: DatabaseProbe;
  version: string;
  auth: AuthService;
  profile: ProfileService;
  passwordReset: PasswordResetService;
  accessTokens: AccessTokenService;
  /** Destino alternativo dos logs (usado nos testes). */
  logStream?: DestinationStream;
}

/** Monta o servidor HTTP com todos os módulos (DA01, DA02). */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const logger = deps.logStream
    ? { ...loggerOptions(deps.config.logLevel), stream: deps.logStream }
    : loggerOptions(deps.config.logLevel);

  const app = Fastify({
    logger,
    // Em produção o servidor fica atrás de um proxy com TLS (RNF09, SPEC-001 §4).
    trustProxy: deps.config.env === 'production',
  });

  await app.register(helmet);
  // Limite aplicado só nas rotas que pedirem (RNF10).
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () =>
      new HttpError(429, 'rate_limited', 'Muitas tentativas. Tente novamente em instantes.'),
  });
  registerErrorHandling(app);

  registerHealthRoutes(app, { probe: deps.probe, version: deps.version });
  registerAuthRoutes(app, {
    auth: deps.auth,
    rateLimitPerMinute: deps.config.authRateLimitPerMinute,
  });
  registerPasswordResetRoutes(app, {
    passwordReset: deps.passwordReset,
    rateLimitPerMinute: deps.config.authRateLimitPerMinute,
  });
  registerProfileRoutes(app, {
    profile: deps.profile,
    accessTokens: deps.accessTokens,
    rateLimitPerMinute: deps.config.authRateLimitPerMinute,
  });

  return app;
}
