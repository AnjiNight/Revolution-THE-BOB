import { existsSync } from 'node:fs';
import { pino } from 'pino';
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { PrismaDatabaseProbe } from './modules/health/infrastructure/prisma-database-probe.js';
import { AuthService } from './modules/identity/application/auth-service.js';
import { ProfileService } from './modules/identity/application/profile-service.js';
import { Argon2PasswordHasher } from './modules/identity/infrastructure/argon2-password-hasher.js';
import { JoseGoogleIdentityVerifier } from './modules/identity/infrastructure/jose-google-identity-verifier.js';
import { JwtAccessTokenService } from './modules/identity/infrastructure/jwt-access-token-service.js';
import { PrismaRefreshTokenRepository } from './modules/identity/infrastructure/prisma-refresh-token-repository.js';
import { PrismaUserRepository } from './modules/identity/infrastructure/prisma-user-repository.js';
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
    const users = new PrismaUserRepository(prisma);
    const refreshTokens = new PrismaRefreshTokenRepository(prisma);
    const hasher = new Argon2PasswordHasher();
    const auth = new AuthService({
      users,
      refreshTokens,
      hasher,
      accessTokens,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
      ...(config.googleClientId
        ? { google: new JoseGoogleIdentityVerifier(config.googleClientId) }
        : {}),
    });
    const profile = new ProfileService({ users, refreshTokens, hasher, sessions: auth });
    const app = await buildApp({ config, probe, version, auth, profile, accessTokens });
    await app.listen({ host: config.host, port: config.port });
    shutdown = async () => {
      await app.close();
    };
  } else {
    const logger = pino(loggerOptions(config.logLevel));
    const worker = startWorker({ logger, probe, heartbeatSeconds: config.workerHeartbeatSeconds });
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
