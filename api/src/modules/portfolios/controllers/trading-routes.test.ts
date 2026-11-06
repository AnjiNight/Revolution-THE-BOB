import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  portfolioSubPath,
  PROFILE_PATHS,
  type AuthSession,
  type CashStatement,
  type PortfolioPositions,
  type TradeQuote,
  type TradeResult,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '22222222-2222-4222-8222-222222222222';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

/** Quinta-feira, 05/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-05T15:00:00Z');

describe('compra e venda na carteira ao vivo (SPEC-014)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let live: string;

  beforeEach(async () => {
    now = new Date('2026-11-05T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2026, 2027]) {
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
    quote(PETR4, '31.20', '2026-11-05T14:30:00Z');
    live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '5000' });
  });

  afterEach(async () => {
    await t.app.close();
  });

  const quote = (assetId: string, price: string, at: string) =>
    t.market.quotes.set(assetId, { price, at: new Date(at), level: 'free', source: 'brapi' });

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    session: AuthSession | null = ana,
    payload?: Record<string, unknown>,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  const newPortfolio = async (payload: Record<string, unknown>, session = ana) =>
    (await call('POST', PORTFOLIO_PATHS.list, session, payload)).json<{
      portfolio: { id: string };
    }>().portfolio.id;

  const tradeQuote = async (assetId = PETR4, id = live) =>
    (
      await call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, id)}?assetId=${assetId}`)
    ).json<TradeQuote>();

  /** Cada negociação um segundo depois da anterior: a ordem do livro não fica no empate. */
  const trade = (payload: Record<string, unknown>, id = live, session = ana) => {
    now = new Date(now.getTime() + 1000);
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, id), session, payload);
  };

  /** Negocia com a cotação que a tela veria agora. */
  const tradeNow = async (type: 'buy' | 'sell', quantity: number, assetId = PETR4) => {
    const seen = await tradeQuote(assetId);
    if (!seen.tradable) throw new Error(`não dá para negociar: ${seen.reason}`);
    return trade({ type, assetId, quantity, quotedAt: seen.quotedAt });
  };

  const positions = async (id = live) =>
    (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, id))).json<PortfolioPositions>();

  it('os exemplos do §4.3: compra, segunda compra e venda; caixa e preço médio (CA01, CA02, CA06)', async () => {
    expect(await tradeQuote()).toEqual({
      tradable: true,
      price: '31.20',
      quotedAt: '2026-11-05T14:30:00.000Z',
      level: 'free',
      delayMinutes: 45,
      cash: '5000.00',
      held: 0,
      buyable: true,
    });

    const first = await tradeNow('buy', 100);
    expect(first.statusCode).toBe(201);
    expect(first.json<TradeResult>()).toMatchObject({
      trade: {
        type: 'buy',
        ticker: 'PETR4',
        quantity: 100,
        price: '31.20',
        total: '3120.00',
        date: '2026-11-05',
        recordedAt: now.toISOString(),
        quotedAt: '2026-11-05T14:30:00.000Z',
        level: 'free',
      },
      cash: '1880.00',
      position: { quantity: 100, averagePrice: '31.20' },
    });

    quote(PETR4, '32.10', '2026-11-05T15:00:00Z');
    expect((await tradeNow('buy', 50)).json<TradeResult>()).toMatchObject({
      cash: '275.00',
      position: { quantity: 150, averagePrice: '31.50' },
    });

    quote(PETR4, '33.00', '2026-11-05T15:30:00Z');
    expect((await tradeNow('sell', 60)).json<TradeResult>()).toMatchObject({
      trade: { type: 'sell', total: '1980.00' },
      cash: '2255.00',
      position: { quantity: 90, averagePrice: '31.50' },
    });

    expect(await positions()).toEqual({
      cash: '2255.00',
      positionsValue: '2970.00',
      total: '5225.00',
      positions: [
        {
          assetId: PETR4,
          ticker: 'PETR4',
          name: 'Petrobras PN',
          class: 'stock',
          quantity: 90,
          averagePrice: '31.50',
          lastPrice: '33.00',
          lastPriceKind: 'intraday',
          lastPriceAt: '2026-11-05T15:30:00.000Z',
          lastPriceDate: null,
          marketValue: '2970.00',
          change: '135.00',
          changePercent: '4.76',
        },
      ],
    });
  });

  it('a cotação mudou entre ver e confirmar: nada é gravado e vem o preço novo (CA06)', async () => {
    const seen = await tradeQuote();
    quote(PETR4, '31.40', '2026-11-05T15:00:00Z');
    const res = await trade({
      type: 'buy',
      assetId: PETR4,
      quantity: 10,
      quotedAt: seen.tradable ? seen.quotedAt : '',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'quote_changed',
      details: { price: '31.40', quotedAt: '2026-11-05T15:00:00.000Z' },
    });
    expect(t.portfolioRepo.ledger.trades).toHaveLength(0);
  });

  it('caixa e posição insuficientes, com o disponível (CA03, CA04)', async () => {
    const tooMuch = await tradeNow('buy', 161); // 161 × 31,20 = 5.023,20
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json()).toMatchObject({
      error: 'insufficient_cash',
      details: { available: '5000.00' },
    });
    await tradeNow('buy', 90);
    const sellMore = await tradeNow('sell', 100);
    expect(sellMore.statusCode).toBe(409);
    expect(sellMore.json()).toMatchObject({
      error: 'insufficient_position',
      details: { held: '90' },
    });
  });

  it('quantidade inteira de 1 a 1.000.000 (RB27, CA03)', async () => {
    const seen = await tradeQuote();
    const quotedAt = seen.tradable ? seen.quotedAt : '';
    for (const quantity of [0, -1, 2.5, 1_000_001, '10', null]) {
      const res = await trade({ type: 'buy', assetId: PETR4, quantity, quotedAt });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ fields: Record<string, string> }>().fields.quantity).toBeDefined();
    }
    expect((await trade({ type: 'buy', assetId: PETR4, quantity: 1, quotedAt })).statusCode).toBe(
      201,
    );
  });

  it('bolsa fechada: sábado e feriado, com o próximo pregão (CA05)', async () => {
    now = new Date('2026-11-07T15:00:00Z'); // sábado
    expect(await tradeQuote()).toMatchObject({
      tradable: false,
      reason: 'market_closed',
      nextTradingDay: '2026-11-09',
      cash: '5000.00',
    });
    const res = await trade({
      type: 'buy',
      assetId: PETR4,
      quantity: 1,
      quotedAt: '2026-11-05T14:30:00.000Z',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'market_closed',
      details: { nextTradingDay: '2026-11-09' },
    });

    now = new Date('2026-11-20T15:00:00Z'); // Consciência Negra
    expect(await tradeQuote()).toMatchObject({
      reason: 'market_closed',
      nextTradingDay: '2026-11-23',
    });
  });

  it('sem cotação de hoje: no_quote_today; depois do fechamento vale a última do dia (CA05)', async () => {
    now = new Date('2026-11-06T12:00:00Z'); // sexta, 9h: a cotação guardada é de quinta
    expect(await tradeQuote()).toMatchObject({ tradable: false, reason: 'no_quote_today' });

    quote(PETR4, '31.80', '2026-11-06T21:30:00Z'); // sexta, 18h30
    now = new Date('2026-11-07T00:00:00Z'); // sexta, 21h em Brasília (já sábado em UTC)
    const seen = await tradeQuote();
    expect(seen).toMatchObject({ tradable: true, price: '31.80' });
    const res = await tradeNow('buy', 10);
    expect(res.statusCode).toBe(201);
    expect(res.json<TradeResult>().trade.date).toBe('2026-11-06');
  });

  it('ano sem calendário: calendar_not_published (CA05)', async () => {
    now = new Date('2028-03-01T15:00:00Z');
    quote(PETR4, '31.20', '2028-03-01T14:30:00Z');
    expect(await tradeQuote()).toMatchObject({ tradable: false, reason: 'calendar_not_published' });
    const res = await trade({
      type: 'buy',
      assetId: PETR4,
      quantity: 1,
      quotedAt: '2028-03-01T14:30:00.000Z',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'calendar_not_published' });
  });

  it('ativo desativado: não se compra, mas a posição pode ser vendida (CA03)', async () => {
    await tradeNow('buy', 10);
    const petr4 = t.market.assets.get(PETR4);
    if (petr4) t.market.assets.set(PETR4, { ...petr4, active: false });
    expect(await tradeQuote()).toMatchObject({ tradable: true, buyable: false, held: 10 });
    const buy = await tradeNow('buy', 1);
    expect(buy.statusCode).toBe(409);
    expect(buy.json()).toMatchObject({ error: 'asset_inactive' });
    expect((await tradeNow('sell', 10)).json<TradeResult>().position).toBeNull();
  });

  it('carteira histórica: historical_portfolio até a SPEC-016 (CA03)', async () => {
    const historical = await newPortfolio({
      name: 'Histórica',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '1000',
    });
    expect(await tradeQuote(PETR4, historical)).toMatchObject({
      tradable: false,
      reason: 'historical_portfolio',
    });
    const res = await trade(
      { type: 'buy', assetId: PETR4, quantity: 1, quotedAt: '2026-11-05T14:30:00.000Z' },
      historical,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'historical_portfolio' });
  });

  it('ativo que não existe: 404; carteira de outro: 404 com aviso; colaborador: 403 (CA09)', async () => {
    const unknown = await call(
      'GET',
      `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, live)}?assetId=${UNKNOWN}`,
    );
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: 'asset_not_found' });
    expect(
      (await call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, live)}?assetId=x`))
        .statusCode,
    ).toBe(400);

    const bia = await t.registerConfirmed({
      name: 'Bia Lima',
      email: 'bia@exemplo.com',
      password: 'outra-senha-longa',
    });
    for (const url of [
      portfolioSubPath(PORTFOLIO_PATHS.positions, live),
      `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, live)}?assetId=${PETR4}`,
    ]) {
      expect((await call('GET', url, bia)).statusCode).toBe(404);
    }
    const seen = await tradeQuote();
    const foreign = await trade(
      { type: 'buy', assetId: PETR4, quantity: 1, quotedAt: seen.tradable ? seen.quotedAt : '' },
      live,
      bia,
    );
    expect(foreign.statusCode).toBe(404);
    expect(t.logs.text).toContain('tentativa de acessar carteira de outro usuário');

    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const login = await t.app.inject({
      method: 'POST',
      url: AUTH_PATHS.collaboratorLogin,
      payload: { email: 'nicoly@equipe.com', password: 'senha-do-colaborador' },
    });
    const collaborator = login.json<AuthSession>();
    expect(
      (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, live), collaborator))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, live), null)).statusCode,
    ).toBe(401);
  });

  it('duas compras ao mesmo tempo nunca passam do caixa (CA07)', async () => {
    const seen = await tradeQuote();
    const quotedAt = seen.tradable ? seen.quotedAt : '';
    // 100 × 31,20 = 3.120,00 cada; o caixa de 5.000,00 só paga uma.
    const results = await Promise.all([
      trade({ type: 'buy', assetId: PETR4, quantity: 100, quotedAt }),
      trade({ type: 'buy', assetId: PETR4, quantity: 100, quotedAt }),
    ]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect((await positions()).cash).toBe('1880.00');
  });

  it('posição sem cotação do pregão usa o último fechamento; sem preço nenhum, sem valor (CA09)', async () => {
    quote(MXRF11, '10.05', '2026-11-05T14:30:00Z');
    await tradeNow('buy', 10, MXRF11);
    t.market.quotes.delete(MXRF11);
    t.market.closes.set(MXRF11, { date: '2026-11-04', close: '10.10' });
    const withClose = (await positions()).positions[0];
    expect(withClose).toMatchObject({
      ticker: 'MXRF11',
      lastPrice: '10.10',
      lastPriceKind: 'close',
      lastPriceDate: '2026-11-04',
      lastPriceAt: null,
      marketValue: '101.00',
    });
    t.market.closes.delete(MXRF11);
    const without = await positions();
    expect(without.positions[0]).toMatchObject({
      lastPrice: null,
      marketValue: null,
      change: null,
    });
    expect(without.positionsValue).toBe('0.00');
  });

  it('extrato com compras e vendas; exportação na versão 5; exclusão conta as negociações (CA02, CA08, CA10)', async () => {
    await tradeNow('buy', 10);
    const boughtAt = now.toISOString();
    quote(PETR4, '32.00', '2026-11-05T15:00:00Z');
    await tradeNow('sell', 4);

    const statement = (await call('GET', portfolioCashPath(live))).json<CashStatement>();
    expect(statement.total).toBe(3);
    expect(statement.entries.slice(0, 2)).toMatchObject([
      {
        type: 'sell',
        amount: '128.00',
        balanceAfter: '4816.00',
        trade: { assetId: PETR4, ticker: 'PETR4', quantity: 4, price: '32.00' },
      },
      {
        type: 'buy',
        amount: '312.00',
        balanceAfter: '4688.00',
        trade: { ticker: 'PETR4', quantity: 10, price: '31.20' },
      },
    ]);

    const exported = (await call('GET', PROFILE_PATHS.export)).json<{
      version: number;
      portfolios: Array<{ trades: unknown[] }>;
    }>();
    expect(exported.version).toBe(5);
    expect(exported.portfolios[0]?.trades).toEqual([
      {
        type: 'buy',
        ticker: 'PETR4',
        quantity: 10,
        price: '31.20',
        total: '312.00',
        date: '2026-11-05',
        recordedAt: boughtAt,
        quotedAt: '2026-11-05T14:30:00.000Z',
        level: 'free',
        reversedAt: null,
      },
      expect.objectContaining({ type: 'sell', quantity: 4, total: '128.00' }),
    ]);

    expect((await call('DELETE', portfolioPath(live))).statusCode).toBe(204);
    expect(t.portfolioRepo.deletions[0]).toMatchObject({ entries: 3 });
    expect(t.portfolioRepo.ledger.trades).toHaveLength(0);
  });
});
