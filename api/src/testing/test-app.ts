import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { DatabaseProbe } from '../modules/health/application/get-health.js';
import { AuthService } from '../modules/identity/application/auth-service.js';
import type { Clock } from '../modules/identity/application/ports.js';
import { PasswordResetService } from '../modules/identity/application/password-reset-service.js';
import { ProfileService } from '../modules/identity/application/profile-service.js';
import { ResetCodeHasher } from '../modules/identity/application/reset-code.js';
import { JwtAccessTokenService } from '../modules/identity/infrastructure/jwt-access-token-service.js';
import {
  BackgroundTasks,
  FakeEmailSender,
  FakeGoogleVerifier,
  FakePasswordHasher,
  InMemoryPasswordResetRepository,
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
  /** false desliga a recuperação de senha, como um servidor sem SMTP (padrão: ligada). */
  passwordReset?: boolean;
}

/** Servidor completo com repositórios em memória, para testes HTTP sem banco. */
export async function buildTestApp(options: TestAppOptions = {}) {
  const users = new InMemoryUserRepository(options.clock);
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const hasher = new FakePasswordHasher();
  const accessTokens = new JwtAccessTokenService(TEST_JWT_SECRET, 15);
  const clock = options.clock ? { clock: options.clock } : {};
  const auth = new AuthService({
    users,
    refreshTokens,
    hasher,
    accessTokens,
    refreshTokenTtlDays: 30,
    ...clock,
    ...(options.google === false ? {} : { google: new FakeGoogleVerifier() }),
  });
  const profile = new ProfileService({ users, refreshTokens, hasher, sessions: auth, ...clock });
  const mailer = new FakeEmailSender();
  const resets = new InMemoryPasswordResetRepository();
  const background = new BackgroundTasks();
  const passwordReset = new PasswordResetService({
    users,
    resets,
    refreshTokens,
    hasher,
    codes: new ResetCodeHasher(TEST_JWT_SECRET),
    runInBackground: background.run,
    ...clock,
    ...(options.passwordReset === false ? {} : { mailer }),
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
    profile,
    passwordReset,
    accessTokens,
    logStream: logs,
  });
  return {
    app,
    logs,
    users,
    refreshTokens,
    hasher,
    accessTokens,
    auth,
    profile,
    passwordReset,
    resets,
    mailer,
    background,
  };
}
