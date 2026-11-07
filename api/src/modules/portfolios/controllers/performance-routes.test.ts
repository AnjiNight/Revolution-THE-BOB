import {
  PORTFOLIO_PATHS,
  portfolioSubPath,
  type AuthSession,
  type PortfolioPerformance,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MGLU3 = '22222222-2222-4222-8222-222222222222';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-06T15:00:00Z');

describe('rentabilidade e evolução patrimonial (SPEC-019)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let historical: string;

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (let year = 2019; year <= 2026; year += 1) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    ana = await t.registerConfirmed();
    for (const [id, ticker] of [
      [PETR4, 'PETR4'],
      [MGLU3, 'MGLU3'],
    ] as const) {
      t.market.assets.set(id, { id, ticker, name: ticker, assetClass: 'stock', active: true });
    }
    t.market.dailyCloses.set(
      PETR4,
      new Map([
        ['2019-03-15', '25.30'],
        ['2019-03-18', '26.00'],
        ['2026-11-05', '31.00'],
      ]),
    );
    t.market.dailyCloses.set(
      MGLU3,
      new Map([
        ['2019-08-02', '276.00'],
        ['2019-08-05', '276.00'],
        ['2019-08-06', '36.60'],
      ]),
    );
    t.market.quotes.set(PETR4, {
      price: '31.20',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    historical = await newPortfolio({
      name: 'E se em 2019',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '10000',
    });
    await trade({ type: 'buy', assetId: PETR4, quantity: 100, date: '2019-03-15' });
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    t.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${ana.accessToken}` },
      ...(payload ? { payload } : {}),
    });

  const newPortfolio = async (payload: Record<string, unknown>) =>
    (await call('POST', PORTFOLIO_PATHS.list, payload)).json<{ portfolio: { id: string } }>()
      .portfolio.id;

  const trade = (payload: Record<string, unknown>, id = historical) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, id), payload);
  };

  const performance = (query = '', id = historical) =>
    call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.performance, id)}${query}`);

  it('desde o início: cota, resultado e patrimônio de hoje com a cotação do pregão (CA01–CA03)', async () => {
    const res = await performance();
    expect(res.statusCode).toBe(200);
    const body = res.json<PortfolioPerformance>();
    // 7.470,00 em caixa + 100 × 31,20.
    expect(body).toMatchObject({
      from: '2019-01-02',
      to: '2026-11-06',
      startValue: '0.00',
      endValue: '10590.00',
      netFlows: '10000.00',
      result: '590.00',
      return: '5.90',
      weekly: true,
      empty: false,
      warnings: [],
    });
    expect(body.series.at(-1)).toEqual({
      date: '2026-11-06',
      equity: '10590.00',
      invested: '10000.00',
      return: '5.90',
    });
    // Um ponto por semana: nenhuma semana repetida.
    expect(body.series.length).toBeLessThan(420);
  });

  it('período personalizado: o patrimônio inicial é o do pregão anterior (CA04)', async () => {
    const body = (await performance('?from=2019-03-18&to=2019-03-18')).json<PortfolioPerformance>();
    expect(body).toMatchObject({
      from: '2019-03-18',
      startValue: '10000.00',
      endValue: '10070.00',
      result: '70.00',
      return: '0.70',
      weekly: false,
    });
    expect(body.series).toEqual([
      { date: '2019-03-18', equity: '10070.00', invested: '10000.00', return: '0.70' },
    ]);
  });

  it('1 mês: só o último mês; a conta antes forma o patrimônio inicial', async () => {
    const body = (await performance('?period=1m')).json<PortfolioPerformance>();
    // Até 04/11 vale o último fechamento guardado (R$ 26,00); em 05/11, R$ 31,00; hoje, R$ 31,20.
    expect(body).toMatchObject({
      from: '2026-10-06',
      startValue: '10070.00',
      endValue: '10590.00',
      result: '520.00',
    });
    expect(body.series.length).toBeGreaterThan(20);
  });

  it('validação do período (CA04)', async () => {
    const fields = async (query: string) =>
      (await performance(query)).json<{ fields?: Record<string, string> }>().fields;
    expect(await fields('?period=2y')).toEqual({ period: 'invalid_option' });
    expect(await fields('?from=2020-02-01&to=2020-01-01')).toEqual({ from: 'after_end' });
    expect(await fields('?from=2020-02-30&to=2020-03-01')).toEqual({ from: 'invalid_date' });
    expect(await fields('?from=2026-11-01&to=2026-11-09')).toEqual({ to: 'future' });
  });

  it('salto sem evento conhecido com o ativo em posição vira aviso (CA06)', async () => {
    await trade({ type: 'buy', assetId: MGLU3, quantity: 10, date: '2019-08-02' });
    const body = (await performance('?from=2019-08-01&to=2019-08-30')).json<PortfolioPerformance>();
    expect(body.warnings).toEqual([
      { kind: 'unexplained_jump', assetId: MGLU3, ticker: 'MGLU3', date: '2019-08-06' },
    ]);
  });

  it('carteira sem lançamentos e carteira de outra pessoa (CA07)', async () => {
    const empty = await newPortfolio({ name: 'Vazia', type: 'live' });
    expect((await performance('', empty)).json<PortfolioPerformance>()).toMatchObject({
      empty: true,
      series: [],
    });
    const bia = await t.registerConfirmed({ email: 'bia@exemplo.com' });
    const res = await t.app.inject({
      method: 'GET',
      url: portfolioSubPath(PORTFOLIO_PATHS.performance, historical),
      headers: { authorization: `Bearer ${bia.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
