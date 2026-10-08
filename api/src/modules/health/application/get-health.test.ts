import { describe, expect, it } from 'vitest';
import { getHealth, type DatabaseProbe } from './get-health.js';

const fixedNow = () => new Date('2026-10-08T12:00:00.000Z');
const probe = (result: boolean | Error): DatabaseProbe => ({
  isAvailable: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
});

describe('getHealth', () => {
  it('informa ok quando o banco responde', async () => {
    await expect(getHealth(probe(true), '1.2.3', fixedNow)).resolves.toEqual({
      status: 'ok',
      version: '1.2.3',
      database: 'ok',
      timestamp: '2026-10-08T12:00:00.000Z',
    });
  });

  it('informa degraded quando o banco não responde', async () => {
    const health = await getHealth(probe(false), '1.2.3', fixedNow);
    expect(health.status).toBe('degraded');
    expect(health.database).toBe('unavailable');
  });

  it('trata exceção da verificação como banco indisponível', async () => {
    const health = await getHealth(probe(new Error('ECONNREFUSED 10.0.0.5')), '1.2.3', fixedNow);
    expect(health.database).toBe('unavailable');
  });
});
