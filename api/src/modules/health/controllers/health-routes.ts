import { HEALTH_PATH } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { getHealth, type DatabaseProbe } from '../application/get-health.js';

export interface HealthRoutesOptions {
  probe: DatabaseProbe;
  version: string;
}

export function registerHealthRoutes(app: FastifyInstance, options: HealthRoutesOptions): void {
  app.get(HEALTH_PATH, async (_request, reply) => {
    const health = await getHealth(options.probe, options.version);
    return reply.status(health.status === 'ok' ? 200 : 503).send(health);
  });
}
