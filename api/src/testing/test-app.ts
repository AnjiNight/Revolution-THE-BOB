import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { DatabaseProbe } from '../modules/health/application/get-health.js';
import { AuthService } from '../modules/identity/application/auth-service.js';
import type { Clock } from '../modules/identity/application/ports.js';
import { JwtAccessTokenService } from '../modules/identity/infrastructure/jwt-access-token-service.js';
import {
  FakeGoogleVerifier,
  FakePasswordHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../modules/identity/testing/fakes.js';

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
}

/** Servidor completo com repositórios em memória, para testes HTTP sem banco. */
export async function buildTestApp(options: TestAppOptions = {}) {
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const hasher = new FakePasswordHasher();
  const accessTokens = new JwtAccessTokenService(TEST_JWT_SECRET, 15);
  const auth = new AuthService({
    users,
    refreshTokens,
    hasher,
    accessTokens,
    refreshTokenTtlDays: 30,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.google === false ? {} : { google: new FakeGoogleVerifier() }),
  });
  const probe: DatabaseProbe = {
    isAvailable: () => Promise.resolve(options.databaseAvailable ?? true),
  };
  const logs = new LogCapture();
  const app: FastifyInstance = await buildApp({
    config: {
      env: 'test',
      logLevel: 'info',
      authRateLimitPerMinute: options.rateLimitPerMinute ?? 1000,
    },
    probe,
    version: '9.9.9',
    auth,
    accessTokens,
    logStream: logs,
  });
  return { app, logs, users, refreshTokens, hasher, accessTokens, auth };
}
