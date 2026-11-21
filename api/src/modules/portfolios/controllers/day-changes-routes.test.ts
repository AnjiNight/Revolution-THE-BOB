import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioSubPath,
  type AuthSession,
  type DayChanges,
  type TradeQuote,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '22222222-2222-4222-8222-222222222222';
const VALE3 = '33333333-3333-4333-8333-333333333333';

/** Quinta-feira, 05/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-05T15:00:00Z');

describe('variação do dia dos ativos das carteiras (SPEC-033)', () => {
  let t: TestApp;
  let ana: AuthSession;

  beforeEach(async () => {
    now = new Date('2026-11-05T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2026, 2027]) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    ana = await t.registerConfirmed();
    const asset = (id: string, ticker: string, name: string, assetClass: 'stock' | 'fii') =>
      t.market.assets.set(id, { id, ticker, name, assetClass, active: true });
    asset(PETR4, 'PETR4', 'Petrobras PN', 'stock');
    asset(MXRF11, 'MXRF11', 'Maxi Renda', 'fii');
    asset(VALE3, 'VALE3', 'Vale ON', 'stock');
    t.market.dailyCloses.set(PETR4, new Map([['2019-03-15', '25.30']]));
    t.market.dailyCloses.set(MXRF11, new Map([['2019-03-15', '10.10']]));
    // Hoje: PETR4 +5,21% e VALE3 −1,10%; o MXRF11 só tem a cotação de ontem.
    quote(PETR4, '32.88', '2026-11-05T14:30:00Z', '5.21');
    quote(VALE3, '61.20', '2026-11-05T14:30:00Z', '-1.10');
    quote(MXRF11, '10.05', '2026-11-04T20:30:00Z', '-6.00');
  });

  afterEach(async () => {
    await t.app.close();
  });

  const quote = (assetId: string, price: string, at: string, change: string | null) =>
    t.market.quotes.set(assetId, {
      price,
      at: new Date(at),
      level: 'free',
      source: 'brapi',
      change,
    });

  const call = (
    url: string,
    session: AuthSession | null = ana,
    method: 'GET' | 'POST' = 'GET',
    payload?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) =>
    t.app.inject({
      method,
      url,
      headers: {
        ...headers,
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      ...(payload ? { payload } : {}),
    });

  const newPortfolio = async (payload: Record<string, unknown>) =>
    (await call(PORTFOLIO_PATHS.list, ana, 'POST', payload)).json<{ portfolio: { id: string } }>()
      .portfolio.id;

  /** Cada negociação um segundo depois da anterior; na ao vivo, com a cotação que a tela veria. */
  const buy = async (id: string, assetId: string, quantity: number, date?: string) => {
    now = new Date(now.getTime() + 1000);
    const extra: Record<string, unknown> = date ? { date } : {};
    if (!date) {
      const seen = (
        await call(`${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, id)}?assetId=${assetId}`)
      ).json<TradeQuote>();
      if (!seen.tradable) throw new Error(`não dá para negociar: ${seen.reason}`);
      extra.quotedAt = seen.quotedAt;
    }
    const result = await call(portfolioSubPath(PORTFOLIO_PATHS.trades, id), ana, 'POST', {
      type: 'buy',
      assetId,
      quantity,
      ...extra,
    });
    expect(result.statusCode, result.body).toBe(201);
  };

  it('os ativos em posição, ao vivo e na histórica, com a cotação de hoje e as carteiras (CA01)', async () => {
    const live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '10000' });
    await buy(live, PETR4, 100);
    await buy(live, VALE3, 10);
    const historical = await newPortfolio({
      name: 'E se em 2019',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '10000',
    });
    await buy(historical, PETR4, 50, '2019-03-15');
    await buy(historical, MXRF11, 100, '2019-03-15');
    // Uma carteira sem posição não aparece em nenhum ativo.
    await newPortfolio({ name: 'Vazia', type: 'live', initialAmount: '100' });

    const res = await call(PORTFOLIO_PATHS.dayChanges);
    expect(res.statusCode).toBe(200);
    // O MXRF11 só tem a cotação de ontem: não entra. As carteiras na ordem da lista (a mais nova
    // primeiro).
    expect(res.json<DayChanges>()).toEqual({
      assets: [
        {
          assetId: PETR4,
          ticker: 'PETR4',
          name: 'Petrobras PN',
          price: '32.88',
          change: '5.21',
          at: '2026-11-05T14:30:00.000Z',
          portfolios: [
            { id: historical, name: 'E se em 2019' },
            { id: live, name: 'Ao vivo' },
          ],
        },
        {
          assetId: VALE3,
          ticker: 'VALE3',
          name: 'Vale ON',
          price: '61.20',
          change: '-1.10',
          at: '2026-11-05T14:30:00.000Z',
          portfolios: [{ id: live, name: 'Ao vivo' }],
        },
      ],
    });

    // Nada mudou: 304, sem corpo (o app confere a cada 5 minutos).
    const etag = res.headers.etag as string;
    const again = await call(PORTFOLIO_PATHS.dayChanges, ana, 'GET', undefined, {
      'if-none-match': etag,
    });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
  });

  it('sem cotação de hoje (de manhã cedo, feriado), a lista vem vazia', async () => {
    const live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '10000' });
    await buy(live, PETR4, 100);
    // Sexta, 08:00 em Brasília: a última cotação é a de quinta.
    now = new Date('2026-11-06T11:00:00Z');
    expect((await call(PORTFOLIO_PATHS.dayChanges)).json<DayChanges>()).toEqual({ assets: [] });
  });

  it('a variação sem o fechamento anterior vem nula; sem carteira, nada', async () => {
    expect((await call(PORTFOLIO_PATHS.dayChanges)).json<DayChanges>()).toEqual({ assets: [] });
    quote(PETR4, '32.88', '2026-11-05T14:30:00Z', null);
    const live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '10000' });
    await buy(live, PETR4, 1);
    const [only] = (await call(PORTFOLIO_PATHS.dayChanges)).json<DayChanges>().assets;
    expect(only).toMatchObject({ ticker: 'PETR4', change: null });
  });

  it('só a conta de usuário: colaborador 403, sem sessão 401 (CA01)', async () => {
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'André Martins', email: 'andre@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const collaborator = (
      await t.app.inject({
        method: 'POST',
        url: AUTH_PATHS.collaboratorLogin,
        payload: { email: 'andre@equipe.com', password: 'senha-do-colaborador' },
      })
    ).json<AuthSession>();
    expect((await call(PORTFOLIO_PATHS.dayChanges, collaborator)).statusCode).toBe(403);
    expect((await call(PORTFOLIO_PATHS.dayChanges, null)).statusCode).toBe(401);
  });
});
