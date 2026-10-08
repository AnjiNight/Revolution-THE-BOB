import { Writable } from 'node:stream';
import { HEALTH_PATH, isHealthResponse } from '@simulador/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { DatabaseProbe } from './modules/health/application/get-health.js';

class LogCapture extends Writable {
  lines: string[] = [];
  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.lines.push(...chunk.toString().split('\n').filter(Boolean));
    callback();
  }
  get text(): string {
    return this.lines.join('\n');
  }
}

const probe = (available: boolean): DatabaseProbe => ({
  isAvailable: () => Promise.resolve(available),
});

let app: FastifyInstance;
let logs: LogCapture;

async function start(available = true): Promise<FastifyInstance> {
  logs = new LogCapture();
  app = await buildApp({
    config: { env: 'test', logLevel: 'info' },
    probe: probe(available),
    version: '9.9.9',
    logStream: logs,
  });
  return app;
}

afterEach(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('responde 200 com banco ok (CA04)', async () => {
    await start(true);
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH });
    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(isHealthResponse(body)).toBe(true);
    expect(body).toMatchObject({ status: 'ok', database: 'ok', version: '9.9.9' });
  });

  it('responde 503 sem detalhes quando o banco está fora (CA05)', async () => {
    await start(false);
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH });
    expect(res.statusCode).toBe(503);
    expect(Object.keys(res.json<object>()).sort()).toEqual([
      'database',
      'status',
      'timestamp',
      'version',
    ]);
    expect(res.json()).toMatchObject({ status: 'degraded', database: 'unavailable' });
  });

  it('envia cabeçalhos de segurança', async () => {
    await start();
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});

describe('tratamento de erros (CA06)', () => {
  it('erro inesperado vira 500 genérico e o detalhe vai só para o log', async () => {
    await start();
    app.get('/test/boom', () => {
      throw new Error('falha secreta em 10.0.0.5:5432');
    });
    const res = await app.inject({ method: 'GET', url: '/test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error', message: 'Erro interno do servidor.' });
    expect(res.body).not.toContain('secreta');
    expect(logs.text).toContain('falha secreta');
  });

  it('rota inexistente responde 404 padronizado', async () => {
    await start();
    const res = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Recurso não encontrado.' });
  });
});

describe('logs estruturados (CA07)', () => {
  it('são JSON e ocultam senhas, tokens e autorização', async () => {
    await start();
    await app.inject({
      method: 'GET',
      url: HEALTH_PATH,
      headers: { authorization: 'Bearer token-super-secreto' },
    });
    app.log.info(
      { password: 'senha123', token: 'abc', user: { password: 'x', token: 'y' } },
      'teste',
    );

    expect(logs.lines.length).toBeGreaterThan(0);
    for (const line of logs.lines) expect(() => JSON.parse(line) as unknown).not.toThrow();
    expect(logs.text).not.toMatch(/token-super-secreto|senha123/);
    const entry = logs.lines.map((l) => JSON.parse(l) as Record<string, unknown>).at(-1);
    expect(entry).toMatchObject({
      password: '[oculto]',
      token: '[oculto]',
      user: { password: '[oculto]', token: '[oculto]' },
    });
  });
});
