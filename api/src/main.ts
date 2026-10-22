import { existsSync } from 'node:fs';
import { pino } from 'pino';
import { buildApp } from './app.js';
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
import { CalendarService } from './modules/market-data/application/calendar-service.js';
import { PrismaCalendarRepository } from './modules/market-data/infrastructure/prisma-calendar-repository.js';
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

  let shutdown: () => Promise<void>;

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
      calendar: new CalendarService({ calendars: new PrismaCalendarRepository(prisma) }),
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
