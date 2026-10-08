import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('loadConfig (CA08)', () => {
  it('usa valores padrão quando só DATABASE_URL é informada', () => {
    const config = loadConfig(base);
    expect(config).toEqual({
      env: 'development',
      host: '127.0.0.1',
      port: 3333,
      logLevel: 'info',
      databaseUrl: base.DATABASE_URL,
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
});
