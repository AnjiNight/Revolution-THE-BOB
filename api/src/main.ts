import { existsSync } from 'node:fs';
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
import { FundamentalsService } from './modules/market-data/application/fundamentals-service.js';
import { Investidor10Collection } from './modules/market-data/application/investidor10-collection.js';
import { CdiStatusService } from './modules/market-data/application/cdi-status-service.js';
import { HistoryIngestion } from './modules/market-data/application/history-ingestion.js';
import { IntradayCollection } from './modules/market-data/application/intraday-collection.js';
import { HistoryStatusService } from './modules/market-data/application/history-status-service.js';
import { B3CotahistSource } from './modules/market-data/infrastructure/b3-cotahist-source.js';
import { B3CompanyHttpSource } from './modules/market-data/infrastructure/b3-company-source.js';
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
import { PrismaIndexRateRepository } from './modules/market-data/infrastructure/prisma-index-rate-repository.js';
import { PrismaLogoRepository } from './modules/market-data/infrastructure/prisma-logo-repository.js';
import {
  PrismaQuoteRepository,
  PrismaTaskRunRepository,
} from './modules/market-data/infrastructure/prisma-quote-repository.js';
import { createPrismaClient } from './shared/infrastructure/database.js';
import { loggerOptions } from './shared/infrastructure/logger.js';
import { readVersion } from './version.js';
import { startWorker } from './worker.js';

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
  const intraday = new IntradayCollection({
    source: brapi,
    quotes: new PrismaIntradayQuoteRepository(prisma),
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
  // SPECs 041 e 042: Investidor10 (com autorização, só ligado com INVESTIDOR10_ENABLED) e eventos
  // corporativos da B3.
  const fundamentalsRepo = new PrismaFundamentalsRepository(prisma);
  const events = new PrismaEventRepository(prisma);
  const investidor10 = new Investidor10Collection({
    enabled: config.investidor10.enabled,
    source: new Investidor10HttpSource({ baseUrl: config.investidor10.baseUrl }),
    fundamentals: fundamentalsRepo,
    runs,
    // Os mais negociados primeiro: numa primeira coleta, o topo da lista Ativos sai logo.
    volumes: quotes,
  });
  const b3Events = new B3EventsCollection({
    source: new B3CompanyHttpSource({ baseUrl: config.b3ListedBaseUrl }),
    assets: fundamentalsRepo,
    trades,
    events,
    runs,
  });

  if (mode === 'server') {
    const accessTokens = new JwtAccessTokenService(config.jwtSecret, config.accessTokenTtlMinutes);
    // Sem SMTP (só fora de produção), a confirmação de e-mail e a recuperação de senha ficam
    // desligadas (503); o login com Google continua funcionando.
    const { auth, profile, passwordReset, accountData } = createIdentityServices({
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
      calendar: new CalendarService({ calendars }),
      catalog: new AssetCatalogService({
        assets: new PrismaAssetRepository(prisma),
        history: new HistoryStatusService({ quotes, calendars }),
        quotes: intraday,
        activity: quotes,
        logos,
        imports: catalogImport,
        prices: quotes,
        events,
      }),
      cdi: new CdiStatusService({ rates: indexRates, runs, calendars }),
      fundamentals: new FundamentalsService({
        enabled: config.investidor10.enabled,
        fundamentals: fundamentalsRepo,
        runs,
      }),
    });
    await app.listen({ host: config.host, port: config.port });
    shutdown = async () => {
      await app.close();
    };
  } else {
    const logger = pino(loggerOptions(config.logLevel));
    const users = new PrismaUserRepository(prisma);
    const worker = startWorker({
      logger,
      probe,
      heartbeatSeconds: config.workerHeartbeatSeconds,
      // SPEC-039 (RB23): uma vez por dia, apaga as contas nunca confirmadas há mais de 7 dias.
      dailyTasks: [
        {
          name: 'limpeza de contas não confirmadas',
          run: () => deleteExpiredPendingAccounts(users, new Date()),
        },
        // SPEC-009 (OPEN-40): cotações do pregão ficam 30 dias.
        { name: 'limpeza das cotações do pregão', run: () => intraday.cleanup() },
      ],
      // SPEC-008: histórico de ativo novo a cada 15 minutos; pregões que faltam às 08:00.
      scheduledTasks: [
        // SPEC-005 §10: anos fechados do calendário pelo arquivo da B3, antes do fechamento diário.
        {
          name: 'calendário pelos arquivos da B3',
          run: async () => (await calendarImport.run())?.records ?? 0,
          dailyAtHour: 7,
          dailyAtMinute: 30,
        },
        {
          name: 'histórico retroativo',
          run: async () => (await history.loadRetroactive())?.records ?? 0,
          everyMinutes: 15,
        },
        {
          name: 'fechamento diário',
          run: async () => (await history.updateDaily())?.records ?? 0,
          dailyAtHour: 8,
        },
        // SPEC-040: importação do catálogo às 08:30, depois do fechamento diário das 08:00.
        {
          name: 'importação do catálogo',
          run: async () => (await catalogImport.run())?.records ?? 0,
          dailyAtHour: 8,
          dailyAtMinute: 30,
        },
        // SPEC-007: CDI às 09:00 e às 18:00 (o do dia sai no dia útil seguinte). As duas rodam ao
        // iniciar; a segunda encontra a primeira em andamento e não faz nada.
        { name: 'CDI (manhã)', run: async () => (await cdi.run())?.records ?? 0, dailyAtHour: 9 },
        { name: 'CDI (tarde)', run: async () => (await cdi.run())?.records ?? 0, dailyAtHour: 18 },
        // SPEC-041: Investidor10 às 03:00 (todos no domingo; nos outros dias e ao iniciar, só os
        // nunca visitados). Desligado sem a autorização.
        {
          name: 'indicadores e proventos (Investidor10)',
          run: async () => (await investidor10.scheduled())?.records ?? 0,
          dailyAtHour: 3,
        },
        // SPEC-042: eventos corporativos da B3 às 04:00 (no domingo, ou se nunca rodou).
        {
          name: 'eventos corporativos (B3)',
          run: async () => (await b3Events.scheduled())?.records ?? 0,
          dailyAtHour: 4,
        },
        // SPEC-009: confere a cada 5 minutos se chegou a hora de uma coleta do pregão.
        {
          name: 'cotações do pregão',
          run: async () => (await intraday.collect())?.records ?? 0,
          everyMinutes: 5,
        },
      ],
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
