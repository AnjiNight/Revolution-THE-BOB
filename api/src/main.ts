import { existsSync } from 'node:fs';
import { INGESTION_TASKS, type IngestionTaskCode } from '@simulador/shared';
import { pino } from 'pino';
import { buildApp } from './app.js';
import { AssetCatalogService } from './modules/asset-catalog/application/asset-catalog-service.js';
import { PrismaAssetRepository } from './modules/asset-catalog/infrastructure/prisma-asset-repository.js';
import { ConfigError, loadConfig } from './config.js';
import { PrismaDatabaseProbe } from './modules/health/infrastructure/prisma-database-probe.js';
import { EmailCodeHasher } from './modules/identity/application/email-code.js';
import { deleteExpiredPendingAccounts } from './modules/identity/application/email-confirmation-service.js';
import { createIdentityServices } from './modules/identity/identity-services.js';
import { Argon2PasswordHasher } from './modules/identity/infrastructure/argon2-password-hasher.js';
import { JoseGoogleIdentityVerifier } from './modules/identity/infrastructure/jose-google-identity-verifier.js';
import { JwtAccessTokenService } from './modules/identity/infrastructure/jwt-access-token-service.js';
import { PrismaEmailCodeRepository } from './modules/identity/infrastructure/prisma-email-code-repository.js';
import { PrismaRefreshTokenRepository } from './modules/identity/infrastructure/prisma-refresh-token-repository.js';
import { PrismaUserRepository } from './modules/identity/infrastructure/prisma-user-repository.js';
import { SmtpEmailSender } from './modules/identity/infrastructure/smtp-email-sender.js';
import { B3CalendarImport } from './modules/market-data/application/b3-calendar-import.js';
import { CalendarService } from './modules/market-data/application/calendar-service.js';
import { CatalogImport } from './modules/market-data/application/catalog-import.js';
import { B3EventsCollection } from './modules/market-data/application/b3-events-collection.js';
import { CdiIngestion } from './modules/market-data/application/cdi-ingestion.js';
import { ClassificationSuggestions } from './modules/market-data/application/classification-suggestions.js';
import { FundamentalsService } from './modules/market-data/application/fundamentals-service.js';
import { Investidor10Collection } from './modules/market-data/application/investidor10-collection.js';
import { CdiStatusService } from './modules/market-data/application/cdi-status-service.js';
import { MarketIndexIngestion } from './modules/market-data/application/market-index-ingestion.js';
import { MarketIndexStatusService } from './modules/market-data/application/market-index-status-service.js';
import { HistoryIngestion } from './modules/market-data/application/history-ingestion.js';
import { IntradayCollection } from './modules/market-data/application/intraday-collection.js';
import { HistoryStatusService } from './modules/market-data/application/history-status-service.js';
import type { RunResult } from './modules/market-data/application/ports.js';
import {
  RUN_RETENTION_DAYS,
  TaskMonitorService,
} from './modules/market-data/application/task-monitor-service.js';
import { INGESTION_SCHEDULE, workerTiming } from './modules/market-data/domain/task-schedule.js';
import { B3CotahistSource } from './modules/market-data/infrastructure/b3-cotahist-source.js';
import { B3CompanyHttpSource } from './modules/market-data/infrastructure/b3-company-source.js';
import { B3IndexHttpSource } from './modules/market-data/infrastructure/b3-index-source.js';
import { BcbSgsSource } from './modules/market-data/infrastructure/bcb-sgs-source.js';
import { Investidor10HttpSource } from './modules/market-data/infrastructure/investidor10-source.js';
import { PrismaEventRepository } from './modules/market-data/infrastructure/prisma-event-repository.js';
import { PrismaFundamentalsRepository } from './modules/market-data/infrastructure/prisma-fundamentals-repository.js';
import { BrapiLogoSource } from './modules/market-data/infrastructure/brapi-logo-source.js';
import { BrapiQuoteSource } from './modules/market-data/infrastructure/brapi-quote-source.js';
import { PrismaIntradayQuoteRepository } from './modules/market-data/infrastructure/prisma-intraday-quote-repository.js';
import { PrismaB3TradeRepository } from './modules/market-data/infrastructure/prisma-b3-trade-repository.js';
import { PrismaCalendarRepository } from './modules/market-data/infrastructure/prisma-calendar-repository.js';
import { PrismaCatalogImportRepository } from './modules/market-data/infrastructure/prisma-catalog-import-repository.js';
import { PrismaClassificationRepository } from './modules/market-data/infrastructure/prisma-classification-repository.js';
import { PrismaIndexRateRepository } from './modules/market-data/infrastructure/prisma-index-rate-repository.js';
import { PrismaLogoRepository } from './modules/market-data/infrastructure/prisma-logo-repository.js';
import { PrismaMarketIndexRepository } from './modules/market-data/infrastructure/prisma-market-index-repository.js';
import { PrismaTaskMonitorRepository } from './modules/market-data/infrastructure/prisma-task-monitor-repository.js';
import {
  PrismaQuoteRepository,
  PrismaTaskRunRepository,
} from './modules/market-data/infrastructure/prisma-quote-repository.js';
import { PortfolioService } from './modules/portfolios/application/portfolio-service.js';
import { TradingService } from './modules/portfolios/application/trading-service.js';
import { PrismaLedgerRepository } from './modules/portfolios/infrastructure/prisma-ledger-repository.js';
import { PrismaPortfolioRepository } from './modules/portfolios/infrastructure/prisma-portfolio-repository.js';
import { createPrismaClient } from './shared/infrastructure/database.js';
import { loggerOptions } from './shared/infrastructure/logger.js';
import { readVersion } from './version.js';
import { startWorker } from './worker.js';
import { portfolioMarket } from './portfolio-market.js';

type Mode = 'server' | 'worker';

function parseMode(arg: string | undefined): Mode {
  if (arg === undefined || arg === 'server') return 'server';
  if (arg === 'worker') return 'worker';
  throw new ConfigError([`modo: "${arg}" é desconhecido; use "server" ou "worker"`]);
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const mode = parseMode(process.argv[2]);
  const config = loadConfig();
  const version = readVersion();
  const prisma = createPrismaClient(config.databaseUrl);
  const probe = new PrismaDatabaseProbe(prisma);
  const calendars = new PrismaCalendarRepository(prisma);

  let shutdown: () => Promise<void>;

  // Dados de mercado: o servidor só lê; o processador coleta e importa.
  const brapi = new BrapiQuoteSource({ token: config.brapi.token, baseUrl: config.brapi.baseUrl });
  const quotes = new PrismaQuoteRepository(prisma);
  const runs = new PrismaTaskRunRepository(prisma);
  const trades = new PrismaB3TradeRepository(prisma);
  const logos = new PrismaLogoRepository(prisma);
  const cotahist = new B3CotahistSource({ cacheDir: config.b3CacheDir });
  // SPEC-008: histórico pelos arquivos da B3, que também dizem quem negociou (SPEC-040).
  const history = new HistoryIngestion({
    source: cotahist,
    quotes,
    runs,
    calendars,
    trades,
  });
  // SPEC-009 e 040: cotações do pregão pela lista da brapi.
  const intradayQuotes = new PrismaIntradayQuoteRepository(prisma);
  const intraday = new IntradayCollection({
    source: brapi,
    quotes: intradayQuotes,
    runs,
    calendars,
    monthlyQuota: config.brapi.monthlyQuota,
  });
  // SPEC-040: o catálogo com as ações e os FIIs negociados na B3, com logos.
  const catalogImport = new CatalogImport({
    source: brapi,
    trades,
    scanner: history,
    catalog: new PrismaCatalogImportRepository(prisma),
    logos,
    logoSource: new BrapiLogoSource(),
    runs,
    calendars,
  });
  // SPEC-005 §10: os anos fechados do calendário pelos mesmos arquivos anuais da B3.
  const calendarImport = new B3CalendarImport({ source: cotahist, calendars, runs });
  // SPEC-007: série do CDI pela API SGS do Banco Central.
  const indexRates = new PrismaIndexRateRepository(prisma);
  const cdi = new CdiIngestion({
    source: new BcbSgsSource({ baseUrl: config.bcbSgsBaseUrl }),
    rates: indexRates,
    runs,
    calendars,
  });
  // SPEC-020: Ibovespa e IFIX pelas estatísticas históricas da B3.
  const marketIndexRepo = new PrismaMarketIndexRepository(prisma);
  const marketIndexIngestion = new MarketIndexIngestion({
    source: new B3IndexHttpSource({ baseUrl: config.b3ListedBaseUrl }),
    indexes: marketIndexRepo,
    runs,
    calendars,
  });
  // SPECs 041 e 042: Investidor10 (com autorização, só ligado com INVESTIDOR10_ENABLED) e eventos
  // corporativos da B3.
  const fundamentalsRepo = new PrismaFundamentalsRepository(prisma);
  const events = new PrismaEventRepository(prisma);
  // SPEC-021: classificação setorial da B3 e sugestão melhor para os ativos a revisar.
  const classifications = new PrismaClassificationRepository(prisma);
  const suggestions = new ClassificationSuggestions({
    classifications,
    investidor10Enabled: config.investidor10.enabled,
  });
  const investidor10 = new Investidor10Collection({
    enabled: config.investidor10.enabled,
    source: new Investidor10HttpSource({ baseUrl: config.investidor10.baseUrl }),
    fundamentals: fundamentalsRepo,
    runs,
    // Os mais negociados primeiro: numa primeira coleta, o topo da lista Ativos sai logo.
    volumes: quotes,
    suggestions,
  });
  const b3Events = new B3EventsCollection({
    source: new B3CompanyHttpSource({ baseUrl: config.b3ListedBaseUrl }),
    assets: fundamentalsRepo,
    trades,
    events,
    runs,
    classifications,
    suggestions,
  });

  // SPEC-011: o registro das execuções, os pedidos de "Executar agora" e o sinal de vida.
  const taskMonitor = new PrismaTaskMonitorRepository(prisma);

  if (mode === 'server') {
    const accessTokens = new JwtAccessTokenService(config.jwtSecret, config.accessTokenTtlMinutes);
    // Sem SMTP (só fora de produção), a confirmação de e-mail e a recuperação de senha ficam
    // desligadas (503); o login com Google continua funcionando.
    // SPEC-012: carteiras; o calendário confere a data de início da histórica e, na SPEC-013, a
    // data dos aportes e retiradas da histórica.
    const calendar = new CalendarService({ calendars });
    // SPECs 013 e 014: o livro-razão da carteira; a compra e venda usa o catálogo e as cotações.
    const assetRepository = new PrismaAssetRepository(prisma);
    const portfolioRepository = new PrismaPortfolioRepository(prisma);
    const ledger = new PrismaLedgerRepository(prisma);
    const market = portfolioMarket({
      assets: assetRepository,
      intraday: intradayQuotes,
      history: quotes,
      // SPEC-016: desdobramentos, grupamentos e bonificações (SPEC-042).
      events,
      // SPEC-020: o CDI e os índices da B3 para as referências da rentabilidade.
      benchmarks: {
        cdiRates: (from, to) => indexRates.ratesBetween('CDI', from, to),
        indexCloses: (code, from, to) => marketIndexRepo.closesBetween(code, from, to),
      },
      // SPEC-043: proventos do Investidor10, só com o interruptor ligado.
      income: {
        enabled: config.investidor10.enabled,
        dividends: (assetId, since) => fundamentalsRepo.dividends(assetId, since),
        visitedAssets: () => fundamentalsRepo.visitedAssets(),
      },
    });
    const portfolios = new PortfolioService({
      portfolios: portfolioRepository,
      ledger,
      calendar,
      market,
    });
    const trading = new TradingService({
      portfolios: portfolioRepository,
      ledger,
      calendar,
      market,
    });
    const { auth, profile, passwordReset, accountData } = createIdentityServices({
      portfolios,
      users: new PrismaUserRepository(prisma),
      refreshTokens: new PrismaRefreshTokenRepository(prisma),
      emailCodes: new PrismaEmailCodeRepository(prisma),
      hasher: new Argon2PasswordHasher(),
      codeHasher: new EmailCodeHasher(config.jwtSecret),
      accessTokens,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
      mailer: config.smtp ? new SmtpEmailSender(config.smtp, config.env) : undefined,
      google: config.googleClientId
        ? new JoseGoogleIdentityVerifier(config.googleClientId)
        : undefined,
    });
    const app = await buildApp({
      config,
      probe,
      version,
      auth,
      profile,
      passwordReset,
      accountData,
      accessTokens,
      calendar,
      portfolios,
      trading,
      catalog: new AssetCatalogService({
        assets: assetRepository,
        history: new HistoryStatusService({ quotes, calendars }),
        quotes: intraday,
        activity: quotes,
        logos,
        imports: catalogImport,
        prices: quotes,
        events,
      }),
      cdi: new CdiStatusService({ rates: indexRates, runs, calendars }),
      marketIndexes: new MarketIndexStatusService({ indexes: marketIndexRepo, runs, calendars }),
      fundamentals: new FundamentalsService({
        enabled: config.investidor10.enabled,
        fundamentals: fundamentalsRepo,
        runs,
      }),
      tasks: new TaskMonitorService({
        monitor: taskMonitor,
        investidor10Enabled: config.investidor10.enabled,
      }),
    });
    await app.listen({ host: config.host, port: config.port });
    shutdown = async () => {
      await app.close();
    };
  } else {
    const logger = pino(loggerOptions(config.logLevel));
    const users = new PrismaUserRepository(prisma);
    // SPEC-011: a execução que ficou sem fim (o processador parou no meio) vira falha, antes de as
    // tarefas rodarem de novo ao iniciar.
    const interrupted = await taskMonitor.closeInterrupted(new Date());
    if (interrupted > 0)
      logger.warn({ interrupted }, 'execuções interrompidas fechadas como falha');

    // Cada tarefa de ingestão: o que roda no horário e o que o "Executar agora" faz (SPEC-011 §4.2).
    const ingestion: Record<
      IngestionTaskCode,
      {
        name: string;
        run: () => Promise<RunResult | null>;
        runNow?: () => Promise<RunResult | null>;
      }
    > = {
      calendario_b3: { name: 'calendário pelos arquivos da B3', run: () => calendarImport.run() },
      historico_retroativo: { name: 'histórico retroativo', run: () => history.loadRetroactive() },
      fechamento_diario: { name: 'fechamento diário', run: () => history.updateDaily() },
      importacao_catalogo: { name: 'importação do catálogo', run: () => catalogImport.run() },
      cdi_diario: { name: 'CDI', run: () => cdi.run() },
      indices_b3: { name: 'índices da B3', run: () => marketIndexIngestion.run() },
      // SPEC-041: no domingo, todos; nos outros dias, só os nunca visitados. Desligado sem a
      // autorização. "Executar agora": os nunca visitados e os que deram erro.
      investidor10: {
        name: 'indicadores e proventos (Investidor10)',
        run: () => investidor10.scheduled(),
        runNow: () => investidor10.run('retry'),
      },
      // SPEC-042: no domingo, ou se nunca rodou. "Executar agora": roda já.
      eventos_b3: {
        name: 'eventos corporativos (B3)',
        run: () => b3Events.scheduled(),
        runNow: () => b3Events.run(),
      },
      // SPEC-009: confere a cada 5 minutos se chegou a vez da coleta. "Executar agora": coleta já,
      // só no horário do pregão e com a regra da cota.
      cotacao_pregao: {
        name: 'cotações do pregão',
        run: () => intraday.collect(),
        runNow: () => intraday.collect({ force: true }),
      },
    };
    const worker = startWorker({
      logger,
      probe,
      heartbeatSeconds: config.workerHeartbeatSeconds,
      // SPEC-011: o sinal de vida e os pedidos de "Executar agora" (a cada 15 segundos).
      heartbeat: (at, intervalSeconds) => taskMonitor.beat(at, intervalSeconds),
      requests: taskMonitor,
      // SPEC-039 (RB23): uma vez por dia, apaga as contas nunca confirmadas há mais de 7 dias.
      dailyTasks: [
        {
          name: 'limpeza de contas não confirmadas',
          run: () => deleteExpiredPendingAccounts(users, new Date()),
        },
        // SPEC-009 (OPEN-40): cotações do pregão ficam 30 dias.
        { name: 'limpeza das cotações do pregão', run: () => intraday.cleanup() },
        // SPEC-011 (OPEN-40): execuções por 90 dias, sempre com a última de cada tarefa.
        {
          name: 'limpeza das execuções antigas',
          run: () =>
            taskMonitor.deleteBefore(
              new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000),
            ),
        },
      ],
      scheduledTasks: INGESTION_TASKS.map((task) => {
        const entry = ingestion[task];
        return {
          key: task,
          name: entry.name,
          run: async () => (await entry.run())?.records ?? 0,
          runNow: async () => (await (entry.runNow ?? entry.run)())?.records ?? 0,
          ...workerTiming(INGESTION_SCHEDULE[task].schedule),
        };
      }),
    });
    shutdown = async () => {
      worker.stop();
    };
  }

  const onSignal = (signal: NodeJS.Signals): void => {
    void (async () => {
      await shutdown();
      await prisma.$disconnect();
      process.exit(signal === 'SIGINT' ? 130 : 0);
    })();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
