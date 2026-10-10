import { describe, expect, it, vi } from 'vitest';
import { checkServerHealth, validateServerUrl } from './server-health.js';

describe('validateServerUrl (CA12)', () => {
  it.each([
    ['https://api.exemplo.com', true],
    ['https://api.exemplo.com', false],
    ['http://localhost:3333', true],
    ['http://127.0.0.1:3333', true],
  ])('aceita %s (dev=%s)', (url, dev) => {
    expect(validateServerUrl(url, dev)).not.toBeNull();
  });

  it.each([
    ['http://api.exemplo.com', true],
    ['http://localhost:3333', false],
    ['ftp://api.exemplo.com', true],
    ['https://usuario:senha@api.exemplo.com', true],
    ['não é url', true],
    ['', true],
  ])('recusa %s (dev=%s)', (url, dev) => {
    expect(validateServerUrl(url, dev)).toBeNull();
  });
});

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch;
}

const health = (status: string, database: string) => ({
  status,
  version: '0.1.0',
  database,
  timestamp: '2026-10-08T12:00:00.000Z',
});

describe('checkServerHealth', () => {
  const dev = { allowInsecureLocalhost: true };

  it('servidor e banco ok → connected', async () => {
    const fetchFn = fakeFetch(200, health('ok', 'ok'));
    await expect(checkServerHealth('http://localhost:3333', { ...dev, fetchFn })).resolves.toEqual({
      kind: 'connected',
      version: '0.1.0',
    });
    expect(vi.mocked(fetchFn).mock.calls[0]?.[0]?.toString()).toBe(
      'http://localhost:3333/api/health',
    );
  });

  it('banco fora → degraded', async () => {
    const fetchFn = fakeFetch(503, health('degraded', 'unavailable'));
    await expect(checkServerHealth('http://localhost:3333', { ...dev, fetchFn })).resolves.toEqual({
      kind: 'degraded',
      version: '0.1.0',
    });
  });

  it('resposta em formato inesperado → unavailable', async () => {
    const fetchFn = fakeFetch(200, { hello: 'world' });
    await expect(checkServerHealth('http://localhost:3333', { ...dev, fetchFn })).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('erro de rede → unavailable', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    await expect(
      checkServerHealth('http://localhost:3333', {
        ...dev,
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('tempo esgotado → unavailable', async () => {
    const fetchFn = ((_url: URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
      })) as unknown as typeof fetch;
    await expect(
      checkServerHealth('http://localhost:3333', { ...dev, fetchFn, timeoutMs: 20 }),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('endereço HTTP remoto → invalid-url, sem chamar a rede', async () => {
    const fetchFn = fakeFetch(200, health('ok', 'ok'));
    await expect(checkServerHealth('http://api.exemplo.com', { ...dev, fetchFn })).resolves.toEqual(
      { kind: 'invalid-url' },
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
