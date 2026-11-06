import { Writable } from 'node:stream';
import { AUTH_PATHS, type AuthSession } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { AssetCatalogService } from '../modules/asset-catalog/application/asset-catalog-service.js';
import { InMemoryAssetRepository } from '../modules/asset-catalog/testing/fakes.js';
import { InMemoryAuditTrail } from '../modules/audit/testing/fakes.js';
import type { DatabaseProbe } from '../modules/health/application/get-health.js';
import { EmailCodeHasher } from '../modules/identity/application/email-code.js';
import type { Clock } from '../modules/identity/application/ports.js';
import { createIdentityServices } from '../modules/identity/identity-services.js';
import { JwtAccessTokenService } from '../modules/identity/infrastructure/jwt-access-token-service.js';
import {
  BackgroundTasks,
  FakeEmailSender,
  FakeGoogleVerifier,
  FakePasswordHasher,
  InMemoryEmailCodeRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../modules/identity/testing/fakes.js';
import { CalendarService } from '../modules/market-data/application/calendar-service.js';
import { CatalogImport } from '../modules/market-data/application/catalog-import.js';
import { CdiStatusService } from '../modules/market-data/application/cdi-status-service.js';
import { FundamentalsService } from '../modules/market-data/application/fundamentals-service.js';
import { PortfolioService } from '../modules/portfolios/application/portfolio-service.js';
import { TradingService } from '../modules/portfolios/application/trading-service.js';
import {
  FakePortfolioMarket,
  InMemoryPortfolioRepository,
} from '../modules/portfolios/testing/fakes.js';
import { HistoryStatusService } from '../modules/market-data/application/history-status-service.js';
import { IntradayCollection } from '../modules/market-data/application/intraday-collection.js';
import {
  FakeListSource,
  FakeLogoSource,
  FakeTradeScanner,
  InMemoryB3Trades,
  InMemoryCalendarRepository,
  InMemoryCatalogImport,
  InMemoryEvents,
  InMemoryFundamentals,
  InMemoryIndexRates,
  InMemoryIntradayQuoteRepository,
  InMemoryLogoRepository,
  InMemoryQuoteRepository,
  InMemoryTaskRuns,
} from '../modules/market-data/testing/fakes.js';

export const TEST_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

export class LogCapture extends Writable {
  lines: string[] = [];
  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.lines.push(...chunk.toString().split('\n').filter(Boolean));
    callback();
  }
  get text(): string {
    return this.lines.join('\n');
  }
}

export interface TestAppOptions {
  databaseAvailable?: boolean;
  rateLimitPerMinute?: number;
  clock?: Clock;
  /** false desliga o login com Google (padrão: ligado, com verificador falso). */
  google?: boolean;
  /** false simula um servidor sem SMTP: sem confirmação de e-mail nem recuperação de senha. */
  email?: boolean;
  /** false desliga o Investidor10 (fim da autorização, SPEC-041 §4.1). Padrão: ligado. */
  investidor10?: boolean;
}

/** Servidor completo com repositórios em memória, para testes HTTP sem banco. */
export async function buildTestApp(options: TestAppOptions = {}) {
  const users = new InMemoryUserRepository(options.clock);
  const refreshTokens = new InMemoryRefreshTokenRepository(options.clock);
  const emailCodes = new InMemoryEmailCodeRepository();
  const hasher = new FakePasswordHasher();
  const accessTokens = new JwtAccessTokenService(TEST_JWT_SECRET, 15);
  const mailer = new FakeEmailSender();
  const background = new BackgroundTasks();
  // Carteiras (SPEC-012), o livro delas (SPECs 013 e 014) e o catálogo com cotações que a compra
  // e venda usa, em memória; o calendário é o mesmo das rotas (definido mais abaixo).
  const portfolioRepo = new InMemoryPortfolioRepository();
  const market = new FakePortfolioMarket();
  const portfolioCalendar = {
    tradingCalendar: (from: number, to: number) => calendar.tradingCalendar(from, to),
  };
  const portfolios = new PortfolioService({
    portfolios: portfolioRepo,
    ledger: portfolioRepo.ledger,
    calendar: portfolioCalendar,
    market,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const trading = new TradingService({
    portfolios: portfolioRepo,
    ledger: portfolioRepo.ledger,
    calendar: portfolioCalendar,
    market,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const services = createIdentityServices({
    portfolios,
    users,
    refreshTokens,
    emailCodes,
    hasher,
    codeHasher: new EmailCodeHasher(TEST_JWT_SECRET),
    accessTokens,
    refreshTokenTtlDays: 30,
    mailer: options.email === false ? undefined : mailer,
    google: options.google === false ? undefined : new FakeGoogleVerifier(),
    clock: options.clock,
    runInBackground: background.run,
  });
  const probe: DatabaseProbe = {
    isAvailable: () => Promise.resolve(options.databaseAvailable ?? true),
  };
  // Um registro de auditoria só, como no banco: o calendário e o catálogo gravam nele.
  const audit = new InMemoryAuditTrail();
  const calendars = new InMemoryCalendarRepository(audit);
  const assets = new InMemoryAssetRepository(audit);
  // Histórico de cotações (SPEC-008) sobre o mesmo catálogo em memória.
  const quotes = new InMemoryQuoteRepository(() =>
    assets.assets.map((asset) => ({ id: asset.id, ticker: asset.ticker })),
  );
  // Cotações do pregão (SPEC-009 e 040) com a lista de uma "brapi" em memória.
  const clock = options.clock ?? (() => new Date());
  const quoteSource = new FakeListSource();
  const intradayQuotes = new InMemoryIntradayQuoteRepository(
    () =>
      assets.assets.map((asset) => ({
        id: asset.id,
        ticker: asset.ticker,
        active: asset.deactivatedAt === null,
      })),
    quotes,
  );
  const runs = new InMemoryTaskRuns();
  const intraday = new IntradayCollection({
    source: quoteSource,
    quotes: intradayQuotes,
    runs,
    calendars,
    monthlyQuota: 15_000,
    clock,
    sleep: () => Promise.resolve(),
  });
  // Importação do catálogo (SPEC-040) sobre o mesmo catálogo em memória.
  const trades = new InMemoryB3Trades();
  const tradeScanner = new FakeTradeScanner(trades);
  const logos = new InMemoryLogoRepository();
  const logoSource = new FakeLogoSource();
  const catalogImport = new CatalogImport({
    source: quoteSource,
    trades,
    scanner: tradeScanner,
    catalog: new InMemoryCatalogImport(assets.assets, audit),
    logos,
    logoSource,
    runs,
    calendars,
    clock,
    sleep: () => Promise.resolve(),
  });
  // Eventos corporativos (SPEC-042) em memória, para o gráfico ajustado.
  const events = new InMemoryEvents();
  const catalog = new AssetCatalogService({
    events,
    assets,
    history: new HistoryStatusService({
      quotes,
      calendars,
      ...(options.clock ? { clock: options.clock } : {}),
    }),
    quotes: intraday,
    activity: quotes,
    logos,
    imports: catalogImport,
    prices: quotes,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const calendar = new CalendarService({
    calendars,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  // Série do CDI (SPEC-007) em memória.
  const indexRates = new InMemoryIndexRates();
  const cdi = new CdiStatusService({ rates: indexRates, runs, calendars, clock });
  // Indicadores e proventos (SPECs 041 e 042) sobre o mesmo catálogo em memória.
  const fundamentalsRepo = new InMemoryFundamentals();
  const syncFundamentalAssets = () => {
    fundamentalsRepo.assets.splice(
      0,
      fundamentalsRepo.assets.length,
      ...assets.assets
        .filter((asset) => asset.deactivatedAt === null)
        .map((asset) => ({ id: asset.id, ticker: asset.ticker, assetClass: asset.assetClass })),
    );
  };
  const fundamentals = new FundamentalsService({
    enabled: options.investidor10 !== false,
    fundamentals: fundamentalsRepo,
    runs,
    clock,
  });
  const logs = new LogCapture();
  const app: FastifyInstance = await buildApp({
    config: {
      env: 'test',
      logLevel: 'info',
      authRateLimitPerMinute: options.rateLimitPerMinute ?? 1000,
    },
    probe,
    version: '9.9.9',
    auth: services.auth,
    profile: services.profile,
    passwordReset: services.passwordReset,
    accountData: services.accountData,
    accessTokens,
    calendar,
    catalog,
    cdi,
    fundamentals,
    portfolios,
    trading,
    logStream: logs,
  });

  /**
   * Cadastro completo pela API (SPEC-039): cadastra, pega o código no e-mail falso e confirma.
   * Devolve a sessão, como o cadastro devolvia antes da confirmação de e-mail.
   */
  const registerConfirmed = async (
    fields: { name?: string; email?: string; password?: string } = {},
  ): Promise<AuthSession> => {
    const email = fields.email ?? 'ana@exemplo.com';
    const registered = await app.inject({
      method: 'POST',
      url: AUTH_PATHS.register,
      payload: {
        name: fields.name ?? 'Ana Souza',
        email,
        password: fields.password ?? 'senha-bem-longa',
        acceptedTerms: true,
      },
    });
    if (registered.statusCode !== 202) throw new Error(`cadastro falhou: ${registered.body}`);
    await background.settle();
    const confirmed = await app.inject({
      method: 'POST',
      url: AUTH_PATHS.emailConfirmationConfirm,
      payload: { email, code: mailer.lastCode(email) },
    });
    if (confirmed.statusCode !== 200) throw new Error(`confirmação falhou: ${confirmed.body}`);
    return confirmed.json<AuthSession>();
  };

  return {
    app,
    logs,
    users,
    refreshTokens,
    emailCodes,
    hasher,
    accessTokens,
    mailer,
    background,
    registerConfirmed,
    calendars,
    calendar,
    audit,
    assets,
    quotes,
    catalog,
    quoteSource,
    intradayQuotes,
    runs,
    intraday,
    trades,
    tradeScanner,
    logos,
    logoSource,
    catalogImport,
    indexRates,
    cdi,
    portfolioRepo,
    portfolios,
    trading,
    market,
    fundamentalsRepo,
    syncFundamentalAssets,
    fundamentals,
    events,
    ...services,
  };
}
