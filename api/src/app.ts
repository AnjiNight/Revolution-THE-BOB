import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import type { AssetCatalogService } from './modules/asset-catalog/application/asset-catalog-service.js';
import { registerAssetRoutes } from './modules/asset-catalog/controllers/asset-routes.js';
import type { AppConfig } from './config.js';
import type { DatabaseProbe } from './modules/health/application/get-health.js';
import { registerHealthRoutes } from './modules/health/controllers/health-routes.js';
import type { AccountDataService } from './modules/identity/application/account-data-service.js';
import type { AuthService } from './modules/identity/application/auth-service.js';
import type { PasswordResetService } from './modules/identity/application/password-reset-service.js';
import type { AccessTokenService } from './modules/identity/application/ports.js';
import type { ProfileService } from './modules/identity/application/profile-service.js';
import { registerAuthRoutes } from './modules/identity/controllers/auth-routes.js';
import { registerPasswordResetRoutes } from './modules/identity/controllers/password-reset-routes.js';
import { registerProfileRoutes } from './modules/identity/controllers/profile-routes.js';
import type { CalendarService } from './modules/market-data/application/calendar-service.js';
import type { CdiStatusService } from './modules/market-data/application/cdi-status-service.js';
import type { MarketIndexStatusService } from './modules/market-data/application/market-index-status-service.js';
import type { MarketTodayCollection } from './modules/market-data/application/market-today.js';
import type { FundamentalsService } from './modules/market-data/application/fundamentals-service.js';
import { registerCalendarRoutes } from './modules/market-data/controllers/calendar-routes.js';
import { registerFundamentalsRoutes } from './modules/market-data/controllers/fundamentals-routes.js';
import { registerIndexRoutes } from './modules/market-data/controllers/index-routes.js';
import { registerMarketTodayRoutes } from './modules/market-data/controllers/market-today-routes.js';
import type { TaskMonitorService } from './modules/market-data/application/task-monitor-service.js';
import { registerTaskRoutes } from './modules/market-data/controllers/task-routes.js';
import type { PortfolioService } from './modules/portfolios/application/portfolio-service.js';
import type { TradingService } from './modules/portfolios/application/trading-service.js';
import { registerPortfolioRoutes } from './modules/portfolios/controllers/portfolio-routes.js';
import type { AssetNewsService } from './modules/news/application/asset-news-service.js';
import type { NewsSourcesService } from './modules/news/application/news-sources-service.js';
import type { SentimentService } from './modules/news/application/sentiment-service.js';
import { registerNewsRoutes } from './modules/news/controllers/news-routes.js';
import type { SubscriptionService } from './modules/subscriptions/application/subscription-service.js';
import {
  makeRequirePremium,
  registerSubscriptionRoutes,
} from './modules/subscriptions/controllers/subscription-routes.js';
import { registerErrorHandling } from './shared/http/error-handler.js';
import { registerEtag } from './shared/http/etag.js';
import { HttpError } from './shared/http/http-error.js';
import { loggerOptions } from './shared/infrastructure/logger.js';

export interface AppDependencies {
  config: Pick<AppConfig, 'env' | 'logLevel' | 'authRateLimitPerMinute'>;
  probe: DatabaseProbe;
  version: string;
  auth: AuthService;
  profile: ProfileService;
  passwordReset: PasswordResetService;
  accountData: AccountDataService;
  accessTokens: AccessTokenService;
  /** SPEC-005: calendário de pregão (módulo Dados de Mercado). */
  calendar: CalendarService;
  /** SPEC-006: catálogo de ativos. */
  catalog: AssetCatalogService;
  /** SPEC-007: situação da série do CDI. */
  cdi: CdiStatusService;
  /** SPEC-020: situação do Ibovespa e do IFIX para o colaborador. */
  marketIndexes: MarketIndexStatusService;
  /** SPECs 041 e 042: indicadores e proventos (Investidor10). */
  fundamentals: FundamentalsService;
  /** SPEC-012: carteiras de simulação. */
  portfolios: PortfolioService;
  /** SPEC-014: compra e venda na carteira ao vivo. */
  trading: TradingService;
  /** SPEC-025: planos, assinatura e a verificação dos recursos premium. */
  subscriptions: SubscriptionService;
  /** SPEC-011: tarefas de ingestão (monitoramento e "Executar agora"). */
  tasks: TaskMonitorService;
  /** SPEC-027: fontes de notícias (colaborador). Sem ele, as rotas de notícias não existem. */
  newsSources?: NewsSourcesService;
  /** SPEC-029: notícias do ativo na ficha; vem junto com `newsSources`. */
  assetNews?: AssetNewsService;
  /** SPEC-044: amostra rotulada e avaliação do sentimento; vem junto com `newsSources`. */
  sentiment?: SentimentService;
  /** SPEC-048: o Ibovespa e o dólar do dia. Sem ele, a rota não existe. */
  marketToday?: Pick<MarketTodayCollection, 'today'>;
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
  // SPEC-032: ETag e 304 em todas as leituras (antes das rotas, para valer em todas).
  registerEtag(app);

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
    accountData: deps.accountData,
    accessTokens: deps.accessTokens,
    rateLimitPerMinute: deps.config.authRateLimitPerMinute,
  });
  registerCalendarRoutes(app, { calendar: deps.calendar, accessTokens: deps.accessTokens });
  registerAssetRoutes(app, { catalog: deps.catalog, accessTokens: deps.accessTokens });
  registerIndexRoutes(app, {
    cdi: deps.cdi,
    marketIndexes: deps.marketIndexes,
    accessTokens: deps.accessTokens,
  });
  registerFundamentalsRoutes(app, {
    fundamentals: deps.fundamentals,
    accessTokens: deps.accessTokens,
  });
  registerPortfolioRoutes(app, {
    portfolios: deps.portfolios,
    trading: deps.trading,
    accessTokens: deps.accessTokens,
    requirePremium: makeRequirePremium(deps.subscriptions),
  });
  registerSubscriptionRoutes(app, {
    subscriptions: deps.subscriptions,
    accessTokens: deps.accessTokens,
  });
  registerTaskRoutes(app, { tasks: deps.tasks, accessTokens: deps.accessTokens });
  if (deps.marketToday) {
    registerMarketTodayRoutes(app, {
      marketToday: deps.marketToday,
      accessTokens: deps.accessTokens,
    });
  }
  if (deps.newsSources && deps.assetNews && deps.sentiment) {
    registerNewsRoutes(app, {
      sources: deps.newsSources,
      assetNews: deps.assetNews,
      sentiment: deps.sentiment,
      accessTokens: deps.accessTokens,
    });
  }

  return app;
}
