import {
  PORTFOLIO_PATHS,
  portfolioSubPath,
  PROFILE_PATHS,
  type AuthSession,
  type PortfolioPositions,
  type TradeQuote,
  type TradeResult,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MGLU3 = '22222222-2222-4222-8222-222222222222';
const VVAR3 = '33333333-3333-4333-8333-333333333333';
const NEW11 = '44444444-4444-4444-8444-444444444444';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-06T15:00:00Z');

describe('compra e venda na carteira histórica (SPEC-016)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let historical: string;

  beforeEach(async () => {
    now = new Date('2026-11-06T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2021, 2026]) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    ana = await t.registerConfirmed();
    const asset = (id: string, ticker: string, active = true) =>
      t.market.assets.set(id, { id, ticker, name: ticker, assetClass: 'stock', active });
    asset(PETR4, 'PETR4');
    asset(MGLU3, 'MGLU3');
    asset(VVAR3, 'VVAR3', false); // saiu da bolsa depois
    asset(NEW11, 'NEW11'); // sem histórico carregado
    t.market.dailyCloses.set(
      PETR4,
      new Map([
        ['2019-02-01', '22.00'],
        ['2019-03-13', '25.10'],
        ['2019-03-15', '25.30'],
        ['2019-05-20', '28.00'],
      ]),
    );
    t.market.dailyCloses.set(MGLU3, new Map([['2019-03-15', '40.00']]));
    t.market.dailyCloses.set(VVAR3, new Map([['2019-03-15', '5.00']]));
    t.market.events.set(MGLU3, [{ kind: 'split', exDate: '2020-10-05' }]);
    // O preço de hoje, para avaliar as posições (DA17).
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

  const quote = (assetId: string, date?: string, id = historical) =>
    call(
      'GET',
      `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, id)}?assetId=${assetId}${date ? `&date=${date}` : ''}`,
    );

  /** Cada pedido um segundo depois do anterior: a ordem do livro não fica no empate. */
  const trade = (payload: Record<string, unknown>, id = historical) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, id), payload);
  };

  const positions = async (id = historical) =>
    (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, id))).json<PortfolioPositions>();

  const dateError = async (date: string | undefined, id = historical) =>
    (
      await trade({ type: 'buy', assetId: PETR4, quantity: 1, ...(date ? { date } : {}) }, id)
    ).json<{ fields?: Record<string, string> }>().fields?.date;

  it('o fechamento da B3 do dia é o preço; compra e venda com caixa e preço médio (CA01)', async () => {
    expect((await quote(PETR4, '2019-03-15')).json<TradeQuote>()).toEqual({
      tradable: true,
      price: '25.30',
      date: '2019-03-15',
      source: 'b3',
      quotedAt: null,
      level: null,
      delayMinutes: null,
      cash: '10000.00',
      held: 0,
      buyable: true,
    });

    const buy = await trade({ type: 'buy', assetId: PETR4, quantity: 100, date: '2019-03-15' });
    expect(buy.statusCode).toBe(201);
    expect(buy.json<TradeResult>()).toMatchObject({
      trade: {
        type: 'buy',
        price: '25.30',
        total: '2530.00',
        date: '2019-03-15',
        quotedAt: null,
        level: null,
        source: 'b3',
      },
      cash: '7470.00',
      // Avaliada até hoje (DA17), com a cotação de agora.
      position: {
        quantity: 100,
        averagePrice: '25.30',
        lastPrice: '31.20',
        marketValue: '3120.00',
      },
    });

    const sale = await trade({ type: 'sell', assetId: PETR4, quantity: 60, date: '2019-05-20' });
    expect(sale.json<TradeResult>()).toMatchObject({
      trade: { total: '1680.00', date: '2019-05-20' },
      cash: '9150.00',
      position: { quantity: 40, averagePrice: '25.30' },
    });
    expect(await positions()).toMatchObject({
      cash: '9150.00',
      positionsValue: '1248.00',
      total: '10398.00',
      lastEntryDate: '2019-05-20',
      positions: [{ ticker: 'PETR4', quantity: 40, events: [] }],
    });
  });

  it('a data segue as regras da histórica, cada recusa com o motivo (CA02)', async () => {
    expect(await dateError(undefined)).toBe('required');
    expect(await dateError('2018-12-28')).toBe('before_start');
    expect(await dateError('2019-03-05')).toBe('not_trading_day'); // Carnaval
    expect(await dateError('2026-11-06')).toBe('future'); // hoje
    await trade({ type: 'buy', assetId: PETR4, quantity: 1, date: '2019-03-15' });
    expect(await dateError('2019-03-13')).toBe('before_last_entry');
    // Ano sem calendário: na cotação, o motivo; na negociação, 409.
    expect((await quote(PETR4, '2020-03-02')).json<TradeQuote>()).toMatchObject({
      tradable: false,
      reason: 'calendar_not_published',
    });
    const unpublished = await trade({
      type: 'buy',
      assetId: PETR4,
      quantity: 1,
      date: '2020-03-02',
    });
    expect(unpublished.statusCode).toBe(409);
    expect(unpublished.json()).toMatchObject({ error: 'calendar_not_published' });
  });

  it('sem negócio no dia: o último dia com negócio antes; sem histórico: history_pending (CA03)', async () => {
    expect((await quote(PETR4, '2019-03-14')).json<TradeQuote>()).toMatchObject({
      tradable: false,
      reason: 'no_close_that_day',
      lastTradingDay: '2019-03-13',
    });
    const none = await trade({ type: 'buy', assetId: PETR4, quantity: 1, date: '2019-03-14' });
    expect(none.statusCode).toBe(409);
    expect(none.json()).toMatchObject({
      error: 'no_close_that_day',
      details: { lastTradingDay: '2019-03-13' },
    });
    expect((await quote(NEW11, '2019-03-15')).json<TradeQuote>()).toMatchObject({
      tradable: false,
      reason: 'history_pending',
    });
  });

  it('ativo desativado com negócio no dia pode ser comprado na histórica (CA04)', async () => {
    expect((await quote(VVAR3, '2019-03-15')).json<TradeQuote>()).toMatchObject({
      tradable: true,
      buyable: true,
    });
    const res = await trade({ type: 'buy', assetId: VVAR3, quantity: 100, date: '2019-03-15' });
    expect(res.statusCode).toBe(201);
  });

  it('evento depois da compra: aviso e sem valor atual até a SPEC-043 (CA05)', async () => {
    await trade({ type: 'buy', assetId: MGLU3, quantity: 10, date: '2019-03-15' });
    t.market.closes.set(MGLU3, { date: '2026-11-05', close: '9.00' });
    const result = await positions();
    expect(result.positions[0]).toMatchObject({
      ticker: 'MGLU3',
      lastPrice: '9.00',
      marketValue: null,
      change: null,
      changePercent: null,
      events: [{ kind: 'split', exDate: '2020-10-05' }],
    });
    expect(result.positionsValue).toBe('0.00');
  });

  it('estorno de negociação da histórica sem prazo (CA06)', async () => {
    const buy = (
      await trade({ type: 'buy', assetId: PETR4, quantity: 10, date: '2019-03-15' })
    ).json<TradeResult>().trade.id;
    now = new Date('2026-12-15T15:00:00Z');
    now = new Date(now.getTime() + 1000);
    const res = await call('POST', portfolioSubPath(PORTFOLIO_PATHS.reversals, historical), {
      entryId: buy,
    });
    expect(res.statusCode).toBe(201);
    expect((await positions()).positions).toEqual([]);
  });

  it('ao vivo: data não pode ser enviada e o horário da cotação é obrigatório', async () => {
    const live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '1000' });
    const withDate = await trade(
      {
        type: 'buy',
        assetId: PETR4,
        quantity: 1,
        date: '2019-03-15',
        quotedAt: '2026-11-06T14:30:00.000Z',
      },
      live,
    );
    expect(withDate.json()).toMatchObject({ fields: { date: 'not_allowed' } });
    const withoutQuote = await trade({ type: 'buy', assetId: PETR4, quantity: 1 }, live);
    expect(withoutQuote.json()).toMatchObject({ fields: { quotedAt: 'required' } });
  });

  it('exportação com a negociação da histórica, sem horário de cotação, versão 6 (CA09)', async () => {
    await trade({ type: 'buy', assetId: PETR4, quantity: 10, date: '2019-03-15' });
    const exported = (await call('GET', PROFILE_PATHS.export)).json<{
      version: number;
      portfolios: Array<{ trades: unknown[] }>;
    }>();
    expect(exported.version).toBe(6);
    expect(exported.portfolios[0]?.trades).toEqual([
      expect.objectContaining({
        date: '2019-03-15',
        price: '25.30',
        quotedAt: null,
        level: null,
        source: 'b3',
        reversedAt: null,
      }),
    ]);
  });
});
