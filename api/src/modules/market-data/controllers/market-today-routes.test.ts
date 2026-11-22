import { MARKET_TODAY_PATHS, type MarketToday } from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Segunda, 23/11/2026, 14:20 em Brasília. */
const NOW = new Date('2026-11-23T17:20:00Z');

describe('rota do "Mercado hoje" (SPEC-048 §4.2, CA02)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (token?: string) =>
    t.app.inject({
      method: 'GET',
      url: MARKET_TODAY_PATHS.today,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });

  it('401 sem sessão', async () => {
    expect((await get()).statusCode).toBe(401);
  });

  it('o usuário conectado: null antes da primeira leitura, depois os dois', async () => {
    const session = await t.registerConfirmed();
    expect((await get(session.accessToken)).json<MarketToday>()).toEqual({
      ibovespa: null,
      dollar: null,
    });

    t.marketSource.answers.set('ibovespa', {
      at: new Date('2026-11-23T17:05:00Z'),
      value: '166376.44',
      previousClose: '167538',
    });
    await t.marketToday.collect({ force: true });
    const res = await get(session.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json<MarketToday>()).toEqual({
      ibovespa: {
        value: '166376.44',
        previousClose: '167538',
        change: '-0.69',
        at: '2026-11-23T17:05:00.000Z',
        stale: false,
      },
      dollar: null,
    });
  });
});
