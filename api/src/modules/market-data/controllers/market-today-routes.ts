import { MARKET_TODAY_PATHS } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenService } from '../../identity/application/ports.js';
import { makeAuthenticate } from '../../identity/controllers/authenticate.js';
import type { MarketTodayCollection } from '../application/market-today.js';

export interface MarketTodayRoutesOptions {
  marketToday: Pick<MarketTodayCollection, 'today'>;
  accessTokens: AccessTokenService;
}

/** SPEC-048: o Ibovespa e o dólar do dia (Yahoo Finance), para qualquer pessoa conectada. */
export function registerMarketTodayRoutes(
  app: FastifyInstance,
  options: MarketTodayRoutesOptions,
): void {
  app.get(
    MARKET_TODAY_PATHS.today,
    { preHandler: [makeAuthenticate(options.accessTokens)] },
    async (_request, reply) => reply.send(await options.marketToday.today()),
  );
}
