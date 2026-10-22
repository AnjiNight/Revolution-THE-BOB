import { Writable } from 'node:stream';
import { AUTH_PATHS, type AuthSession } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
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
import { InMemoryCalendarRepository } from '../modules/market-data/testing/fakes.js';

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
  const services = createIdentityServices({
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
  const calendars = new InMemoryCalendarRepository();
  const calendar = new CalendarService({
    calendars,
    ...(options.clock ? { clock: options.clock } : {}),
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
    ...services,
  };
}
