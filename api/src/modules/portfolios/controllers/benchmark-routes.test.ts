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
const MXRF11 = '55555555-5555-4555-8555-555555555555';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília: o Ibovespa de hoje ainda não saiu. */
let now = new Date('2026-11-06T15:00:00Z');

describe('referências na rentabilidade (SPEC-020)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let historical: string;

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    await t.calendar.publish(2026, { nonTradingDays: suggestNonTradingDays(2026) }, 'colab');
    ana = await t.registerConfirmed();
    t.market.assets.set(PETR4, {
      id: PETR4,
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetClass: 'stock',
      active: true,
    });
    t.market.assets.set(MXRF11, {
      id: MXRF11,
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      assetClass: 'fii',
      active: true,
    });
    t.market.dailyCloses.set(
      PETR4,
      new Map([
        ['2026-11-04', '25.00'],
        ['2026-11-05', '26.00'],
      ]),
    );
    t.market.dailyCloses.set(MXRF11, new Map([['2026-11-05', '10.00']]));
    t.market.quotes.set(PETR4, {
      price: '26.50',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    t.market.quotes.set(MXRF11, {
      price: '10.00',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    // O CDI de 06/11 só sai na segunda; o ponto de 06/11 não precisa dele.
    for (const day of ['2026-11-03', '2026-11-04', '2026-11-05']) t.market.cdi.set(day, '0.050000');
    t.market.indexes.set(
      'IBOV',
      new Map([
        ['2026-10-30', '149000.00'],
        ['2026-11-03', '150000.00'],
        ['2026-11-04', '151500.00'],
        ['2026-11-05', '153000.00'],
      ]),
    );
    t.market.indexes.set(
      'IFIX',
      new Map([
        ['2026-11-03', '3500.00'],
        ['2026-11-04', '3510.00'],
        ['2026-11-05', '3535.00'],
      ]),
    );
    // 02/11 é Finados: a carteira começa na terça, 03/11, e compra PETR4 na quarta.
    historical = await newPortfolio({
      name: 'Novembro',
      type: 'historical',
      startDate: '2026-11-03',
      initialAmount: '10000',
    });
    await trade({ type: 'buy', assetId: PETR4, quantity: 100, date: '2026-11-04' });
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

  const trade = (payload: Record<string, unknown>) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, historical), payload);
  };

  const performance = async (query = '') =>
    (
      await call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.performance, historical)}${query}`)
    ).json<PortfolioPerformance>();

  it('carteira nova: tudo começa no dia do primeiro aporte; o Ibovespa vai até ontem (CA03, CA04, CA06)', async () => {
    const body = await performance();
    // Carteira: 10.000 → 10.100 (05/11) → 10.150 (hoje, PETR4 a R$ 26,50).
    expect(body).toMatchObject({
      baseDate: '2026-11-03',
      return: '1.50',
      benchmarks: [
        { code: 'cdi', return: '0.15', until: '2026-11-06', endValue: '10015.01', source: 'bcb' },
        { code: 'ibov', return: '2.00', until: '2026-11-05', endValue: '10200.00', source: 'b3' },
      ],
      // 1,50 ÷ 0,15.
      cdiShare: '1000',
    });
    expect(body.series.map((point) => [point.date, point.return, point.benchmarks])).toEqual([
      ['2026-11-03', '0.00', { cdi: '0.00', ibov: '0.00', ifix: null }],
      ['2026-11-04', '0.00', { cdi: '0.05', ibov: '1.00', ifix: null }],
      ['2026-11-05', '1.00', { cdi: '0.10', ibov: '2.00', ifix: null }],
      ['2026-11-06', '1.50', { cdi: '0.15', ibov: null, ifix: null }],
    ]);
    // O mesmo dinheiro: os R$ 10.000,00 do primeiro aporte no CDI e no Ibovespa.
    expect(body.series.map((point) => point.benchmarkValues)).toEqual([
      { cdi: '10000.00', ibov: '10000.00', ifix: null },
      { cdi: '10005.00', ibov: '10100.00', ifix: null },
      { cdi: '10010.00', ibov: '10200.00', ifix: null },
      { cdi: '10015.01', ibov: null, ifix: null },
    ]);
  });

  it('com patrimônio antes do período: o dia-base é o pregão anterior (§4.2)', async () => {
    const body = await performance('?from=2026-11-05&to=2026-11-05');
    expect(body).toMatchObject({
      baseDate: '2026-11-04',
      return: '1.00',
      benchmarks: [
        // O mesmo dinheiro parte do patrimônio do dia-base (R$ 10.000,00 em 04/11).
        { code: 'cdi', return: '0.05', until: '2026-11-05', endValue: '10005.00' },
        // 153.000 ÷ 151.500 − 1.
        { code: 'ibov', return: '0.99', until: '2026-11-05', endValue: '10099.01' },
      ],
      cdiShare: '2000',
    });
  });

  it('IFIX só se a carteira teve FII no período (CA05)', async () => {
    await trade({ type: 'buy', assetId: MXRF11, quantity: 10, date: '2026-11-05' });
    const all = await performance();
    expect(all.benchmarks.map((benchmark) => [benchmark.code, benchmark.return])).toEqual([
      ['cdi', '0.15'],
      ['ibov', '2.00'],
      ['ifix', '1.00'],
    ]);
    expect(all.series.at(-1)?.benchmarks.ifix).toBeNull();

    // Antes da compra do MXRF11: sem IFIX.
    const before = await performance('?from=2026-11-03&to=2026-11-04');
    expect(before.benchmarks.map((benchmark) => benchmark.code)).toEqual(['cdi', 'ibov']);
  });

  it('carteira negativa: sem "% do CDI" (CA05)', async () => {
    t.market.quotes.set(PETR4, {
      price: '20.00',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    const body = await performance();
    expect(body.return).toBe('-5.00');
    expect(body.cdiShare).toBeNull();
  });

  it('índices e CDI ainda não carregados: referências sem dado, o painel não quebra (CA06)', async () => {
    t.market.cdi.clear();
    t.market.indexes.clear();
    const body = await performance();
    expect(body.benchmarks).toEqual([
      { code: 'cdi', return: null, until: null, endValue: null, source: 'bcb' },
      { code: 'ibov', return: null, until: null, endValue: null, source: 'b3' },
    ]);
    expect(body.cdiShare).toBeNull();
    expect(body.series.at(-1)?.benchmarks).toEqual({ cdi: null, ibov: null, ifix: null });
    expect(body.series.at(-1)?.benchmarkValues).toEqual({ cdi: null, ibov: null, ifix: null });
  });
});
