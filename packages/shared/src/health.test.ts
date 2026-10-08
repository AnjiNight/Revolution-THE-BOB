import { describe, expect, it } from 'vitest';
import { isHealthResponse } from './health.js';

describe('isHealthResponse', () => {
  const valid = {
    status: 'ok',
    version: '0.1.0',
    database: 'ok',
    timestamp: '2026-10-08T12:00:00.000Z',
  };

  it('aceita uma resposta válida', () => {
    expect(isHealthResponse(valid)).toBe(true);
    expect(isHealthResponse({ ...valid, status: 'degraded', database: 'unavailable' })).toBe(true);
  });

  it.each([
    null,
    'ok',
    {},
    { ...valid, status: 'broken' },
    { ...valid, database: 'down' },
    { ...valid, version: 1 },
    { ...valid, timestamp: undefined },
  ])('recusa %j', (value) => {
    expect(isHealthResponse(value)).toBe(false);
  });
});
