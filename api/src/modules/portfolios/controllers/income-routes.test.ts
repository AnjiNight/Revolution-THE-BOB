import {
  PORTFOLIO_PATHS,
  portfolioSubPath,
  type AuthSession,
  type CashStatement,
  type PortfolioPositions,
  type TradeQuote,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '55555555-5555-4555-8555-555555555555';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-06T15:00:00Z');

describe('proventos e eventos na carteira (SPEC-043)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let historical: string;

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2026]) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
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
        ['2019-03-15', '25.30'],
        ['2019-05-20', '28.00'],
      ]),
    );
    t.market.quotes.set(PETR4, {
      price: '31.20',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    t.market.quotes.set(MXRF11, {
      price: '9.80',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    t.market.dividends.set(PETR4, [
      { kind: 'dividendo', exDate: '2019-04-01', paymentDate: '2019-05-02', value: '0.5' },
      { kind: 'jcp', exDate: '2019-04-01', paymentDate: '2019-06-03', value: '0.1' },
      { kind: 'dividendo', exDate: '2026-08-21', paymentDate: '2026-12-21', value: '0.47156696' },
    ]);
    t.market.dividends.set(MXRF11, [
      { kind: 'rendimento', exDate: '2026-10-30', paymentDate: '2026-11-16', value: '0.095' },
      { kind: 'rendimento', exDate: '2026-11-06', paymentDate: '2026-11-20', value: '0.1' },
    ]);
    t.market.visited.add(PETR4);
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

  /** Cada pedido um segundo depois do anterior: a ordem do livro não fica no empate. */
  const trade = (payload: Record<string, unknown>, id = historical) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, id), payload);
  };

  const cash = (payload: Record<string, unknown>, id = historical) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.cash, id), payload);
  };

  const positions = async (id = historical) =>
    (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, id))).json<PortfolioPositions>();

  const statement = async (id = historical) =>
    (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.cash, id))).json<CashStatement>();

  it('proventos pagos no caixa, JCP líquido e o a receber (CA01, CA02, CA03)', async () => {
    const result = await positions();
    // 10.000,00 − 2.530,00 + 50,00 (dividendo) + 8,50 (JCP de 10,00 menos 15%).
    expect(result).toMatchObject({
      cash: '7528.50',
      income: '58.50',
      pendingIncome: '47.15',
      nextPayment: { date: '2026-12-21', amount: '47.15' },
      incomeEnabled: true,
    });
    expect(result.positions[0]).toMatchObject({
      ticker: 'PETR4',
      income: '58.50',
      incomeLoaded: true,
    });

    const book = await statement();
    expect(book.balance).toBe('7528.50');
    expect(book.entries.map((entry) => [entry.type, entry.date, entry.amount])).toEqual([
      ['income', '2019-06-03', '8.50'],
      ['income', '2019-05-02', '50.00'],
      ['buy', '2019-03-15', '2530.00'],
      ['deposit', '2019-01-02', '10000.00'],
    ]);
    expect(book.entries[0]).toMatchObject({
      balanceAfter: '7528.50',
      reversible: false,
      income: {
        ticker: 'PETR4',
        kind: 'jcp',
        quantity: 100,
        gross: '10.00',
        tax: '1.50',
        net: '8.50',
        exDate: '2019-04-01',
        source: 'investidor10',
      },
    });
    expect(book.pendingIncome).toMatchObject([
      { ticker: 'PETR4', kind: 'dividendo', net: '47.15', paymentDate: '2026-12-21' },
    ]);
  });

  it('histórica: o caixa da data conta só os proventos pagos até ela (CA08)', async () => {
    const quote = (
      await call(
        'GET',
        `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, historical)}?assetId=${PETR4}&date=2019-05-20`,
      )
    ).json<TradeQuote>();
    // O dividendo de 02/05 já entrou; o JCP de 03/06, ainda não.
    expect(quote).toMatchObject({ tradable: true, cash: '7520.00', held: 100 });
  });

  it('o provento pago pode ser gasto; sem a fonte, o caixa fica negativo e só aceita aporte (CA06, CA07)', async () => {
    expect(
      (await cash({ type: 'withdrawal', amount: '7528.50', date: '2019-06-10' })).statusCode,
    ).toBe(201);
    t.market.incomeEnabled = false;
    const result = await positions();
    expect(result).toMatchObject({ cash: '-58.50', income: '0.00', incomeEnabled: false });
    expect((await statement()).entries.some((entry) => entry.type === 'income')).toBe(false);
    const refused = await cash({ type: 'withdrawal', amount: '1', date: '2019-06-11' });
    expect(refused.statusCode).toBe(409);
    expect((await cash({ type: 'deposit', amount: '100', date: '2019-06-11' })).statusCode).toBe(
      201,
    );
  });

  it('ao vivo: comprar na data com dá direito; a data com de ontem não (CA01, CA02)', async () => {
    const live = await newPortfolio({ name: 'FIIs', type: 'live', initialAmount: '1000' });
    const res = await trade(
      { type: 'buy', assetId: MXRF11, quantity: 100, quotedAt: '2026-11-06T14:30:00.000Z' },
      live,
    );
    expect(res.statusCode).toBe(201);
    expect(await positions(live)).toMatchObject({
      cash: '20.00',
      income: '0.00',
      pendingIncome: '10.00',
      nextPayment: { date: '2026-11-20', amount: '10.00' },
    });
    expect((await positions(live)).positions[0]).toMatchObject({ incomeLoaded: false });
  });

  it('desdobramento com data com na sexta vale no pregão seguinte, sem inflar o valor (CA05)', async () => {
    const live = await newPortfolio({ name: 'Ações', type: 'live', initialAmount: '5000' });
    await trade(
      { type: 'buy', assetId: PETR4, quantity: 100, quotedAt: '2026-11-06T14:30:00.000Z' },
      live,
    );
    t.market.events.set(PETR4, [{ kind: 'desdobramento', exDate: '2026-11-06', factor: '300' }]);

    // Sábado: ainda não houve pregão depois da data com; a posição é a de antes, com o preço de sexta.
    now = new Date('2026-11-07T15:00:00Z');
    const saturday = await positions(live);
    expect(saturday.positions[0]).toMatchObject({
      quantity: 100,
      lastPrice: '31.20',
      marketValue: '3120.00',
    });
    expect(saturday.total).toBe('5000.00');

    // Segunda, 08:00, antes da primeira cotação do dia: o desdobramento já vale, e o preço de sexta
    // vem dividido por 4.
    now = new Date('2026-11-09T11:00:00Z');
    const monday = await positions(live);
    expect(monday.positions[0]).toMatchObject({
      quantity: 400,
      lastPrice: '7.80',
      marketValue: '3120.00',
    });
    expect(monday.total).toBe('5000.00');
    const performance = await call('GET', portfolioSubPath(PORTFOLIO_PATHS.performance, live));
    expect(performance.json<{ endValue: string }>().endValue).toBe('5000.00');
  });
});
