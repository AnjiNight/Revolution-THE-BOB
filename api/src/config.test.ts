import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

describe('loadConfig (CA08)', () => {
  it('usa valores padrão quando só DATABASE_URL e JWT_SECRET são informados', () => {
    const config = loadConfig(base);
    expect(config).toEqual({
      env: 'development',
      host: '127.0.0.1',
      port: 3333,
      logLevel: 'info',
      databaseUrl: base.DATABASE_URL,
      jwtSecret: base.JWT_SECRET,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 30,
      authRateLimitPerMinute: 10,
      googleClientId: null,
      workerHeartbeatSeconds: 60,
    });
  });

  it('converte números vindos de texto', () => {
    const config = loadConfig({ ...base, PORT: '8080', WORKER_HEARTBEAT_SECONDS: '5' });
    expect(config.port).toBe(8080);
    expect(config.workerHeartbeatSeconds).toBe(5);
  });

  it('recusa configuração sem DATABASE_URL, explicando o motivo', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('lista todos os problemas de uma vez', () => {
    try {
      loadConfig({ DATABASE_URL: 'mysql://x', PORT: '99999', NODE_ENV: 'staging' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join('\n');
      expect(problems).toMatch(/DATABASE_URL/);
      expect(problems).toMatch(/PORT/);
      expect(problems).toMatch(/NODE_ENV/);
      expect(problems).not.toMatch(/Invalid input/);
    }
  });

  it('exige JWT_SECRET com pelo menos 32 caracteres', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('liga o login com Google só quando GOOGLE_CLIENT_ID é informado', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: '' }).googleClientId).toBeNull();
    expect(
      loadConfig({ ...base, GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com' }).googleClientId,
    ).toBe('abc.apps.googleusercontent.com');
  });

  it('recusa o segredo de exemplo em produção', () => {
    const exemplo = 'desenvolvimento-troque-este-segredo-em-producao';
    expect(() => loadConfig({ ...base, JWT_SECRET: exemplo })).not.toThrow();
    expect(() => loadConfig({ ...base, JWT_SECRET: exemplo, NODE_ENV: 'production' })).toThrow(
      /produção/,
    );
  });
});
