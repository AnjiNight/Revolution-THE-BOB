import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import type { AppConfig } from './config.js';
import type { DatabaseProbe } from './modules/health/application/get-health.js';
import { registerHealthRoutes } from './modules/health/controllers/health-routes.js';
import { registerErrorHandling } from './shared/http/error-handler.js';
import { loggerOptions } from './shared/infrastructure/logger.js';

export interface AppDependencies {
  config: Pick<AppConfig, 'env' | 'logLevel'>;
  probe: DatabaseProbe;
  version: string;
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
  registerErrorHandling(app);
  registerHealthRoutes(app, { probe: deps.probe, version: deps.version });

  return app;
}
