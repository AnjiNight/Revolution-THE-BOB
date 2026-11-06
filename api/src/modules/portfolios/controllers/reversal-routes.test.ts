import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  portfolioSubPath,
  PROFILE_PATHS,
  type AuthSession,
  type CashEntryResult,
  type CashStatement,
  type PortfolioPositions,
  type ReversalResult,
  type TradeQuote,
  type TradeResult,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-06T15:00:00Z');

describe('estorno de lançamento (SPEC-015)', () => {
  let t: TestApp;
  let ana: AuthSession;
  let live: string;

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
    quote('31.20');
    live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '5000' });
  });

  afterEach(async () => {
    await t.app.close();
  });

  /** A cotação de agora, com o horário do relógio dos testes. */
  const quote = (price: string) =>
    t.market.quotes.set(PETR4, { price, at: new Date(now), level: 'free', source: 'brapi' });

  /** Cada pedido um segundo depois do anterior: a ordem do livro não fica no empate. */
  const tick = () => {
    now = new Date(now.getTime() + 1000);
  };

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

  const newPortfolio = async (payload: Record<string, unknown>) =>
    (await call('POST', PORTFOLIO_PATHS.list, ana, payload)).json<{
      portfolio: { id: string };
    }>().portfolio.id;

  const statement = async (id = live) =>
    (await call('GET', portfolioCashPath(id))).json<CashStatement>();

  const firstEntryId = async (id = live) => {
    const entries = (await statement(id)).entries;
    return entries[entries.length - 1]?.id ?? '';
  };

  const addCash = async (
    type: 'deposit' | 'withdrawal',
    amount: string,
    id = live,
    date?: string,
  ) => {
    tick();
    return (
      await call('POST', portfolioCashPath(id), ana, { type, amount, ...(date ? { date } : {}) })
    ).json<CashEntryResult>().entry.id;
  };

  const deal = async (type: 'buy' | 'sell', quantity: number, price = '31.20') => {
    quote(price);
    const seen = (
      await call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, live)}?assetId=${PETR4}`)
    ).json<TradeQuote>();
    if (!seen.tradable) throw new Error(`não dá para negociar: ${seen.reason}`);
    tick();
    const res = await call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, live), ana, {
      type,
      assetId: PETR4,
      quantity,
      quotedAt: seen.quotedAt,
    });
    return res.json<TradeResult>().trade.id;
  };

  const reverse = (entryId: unknown, id = live, session = ana) => {
    tick();
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.reversals, id), session, { entryId });
  };

  const positions = async () =>
    (
      await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, live))
    ).json<PortfolioPositions>();

  it('estorna um aporte: o caixa sai sem ele, e ele fica riscado no extrato (CA02, CA08)', async () => {
    const deposit = await firstEntryId();
    const res = await reverse(deposit);
    expect(res.statusCode).toBe(201);
    expect(res.json<ReversalResult>()).toEqual({
      reversal: { entryId: deposit, type: 'deposit', reversedAt: now.toISOString() },
      cash: '0.00',
    });
    const after = await statement();
    expect(after.balance).toBe('0.00');
    expect(after.total).toBe(1);
    expect(after.entries[0]).toMatchObject({
      id: deposit,
      balanceAfter: null,
      reversedAt: now.toISOString(),
      reversible: false,
    });
  });

  it('estornar a compra devolve o preço médio de antes (o exemplo do §4.3, CA02)', async () => {
    await addCash('deposit', '5000');
    await deal('buy', 100, '10.00');
    const wrong = await deal('buy', 100, '20.00');
    expect((await positions()).positions[0]).toMatchObject({
      quantity: 200,
      averagePrice: '15.00',
    });
    expect((await reverse(wrong)).statusCode).toBe(201);
    expect(await positions()).toMatchObject({
      cash: '9000.00',
      positions: [{ quantity: 100, averagePrice: '10.00' }],
    });
  });

  it('aporte usado numa compra: recusado, dizendo qual estornar antes; nada é gravado (CA03)', async () => {
    const deposit = await firstEntryId();
    const buy = await deal('buy', 100);
    const refused = await reverse(deposit);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      error: 'reversal_breaks_cash',
      details: {
        entryId: buy,
        type: 'buy',
        date: '2026-11-06',
        amount: '3120.00',
        ticker: 'PETR4',
        quantity: '100',
      },
    });
    expect(t.portfolioRepo.ledger.reversals).toHaveLength(0);

    // Estornando a compra antes, o aporte pode ser estornado.
    expect((await reverse(buy)).statusCode).toBe(201);
    expect((await reverse(deposit)).json<ReversalResult>().cash).toBe('0.00');
  });

  it('compra com venda depois: recusado pela posição; estornando a venda antes, passa (CA03)', async () => {
    const buy = await deal('buy', 100);
    const sale = await deal('sell', 60, '33.00');
    const refused = await reverse(buy);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      error: 'reversal_breaks_position',
      details: { entryId: sale, type: 'sell', quantity: '60', ticker: 'PETR4' },
    });
    expect((await reverse(sale)).statusCode).toBe(201);
    expect((await reverse(buy)).statusCode).toBe(201);
    expect((await positions()).positions).toEqual([]);
  });

  it('o mesmo lançamento não se estorna duas vezes; de outra carteira, 404 (CA03)', async () => {
    const deposit = await firstEntryId();
    expect((await reverse(deposit)).statusCode).toBe(201);
    const again = await reverse(deposit);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'already_reversed' });

    const other = await newPortfolio({ name: 'Outra', type: 'live', initialAmount: '10' });
    const elsewhere = await reverse(await firstEntryId(other));
    expect(elsewhere.statusCode).toBe(404);
    expect(elsewhere.json()).toMatchObject({ error: 'entry_not_found' });
    expect((await reverse(UNKNOWN)).statusCode).toBe(404);
    expect((await reverse('nao-e-uuid')).statusCode).toBe(400);
  });

  it('ao vivo: compra e venda só no dia; aporte e retirada a qualquer momento (CA04)', async () => {
    const buy = await deal('buy', 10);
    const deposit = await addCash('deposit', '1000');
    now = new Date('2026-11-09T15:00:00Z'); // segunda-feira seguinte

    const entries = (await statement()).entries;
    expect(entries.find((entry) => entry.id === buy)?.reversible).toBe(false);
    expect(entries.find((entry) => entry.id === deposit)?.reversible).toBe(true);

    const late = await reverse(buy);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ error: 'reversal_window_closed' });
    expect((await reverse(deposit)).statusCode).toBe(201);
  });

  it('histórica: sem prazo, e a data de um lançamento novo ignora os estornados (CA04, CA05)', async () => {
    const historical = await newPortfolio({
      name: 'E se em 2019',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '1000',
    });
    await addCash('deposit', '500', historical, '2019-02-01');
    const last = await addCash('deposit', '300', historical, '2019-03-11');
    now = new Date('2026-11-20T15:00:00Z');
    expect((await reverse(last, historical)).statusCode).toBe(201);
    const earlier = await call('POST', portfolioCashPath(historical), ana, {
      type: 'deposit',
      amount: '50',
      date: '2019-02-15',
    });
    expect(earlier.statusCode).toBe(201);
    expect((await statement(historical)).balance).toBe('1550.00');
  });

  it('um estorno e uma compra ao mesmo tempo nunca deixam o caixa negativo (CA06)', async () => {
    const deposit = await firstEntryId();
    const seen = (
      await call('GET', `${portfolioSubPath(PORTFOLIO_PATHS.tradeQuote, live)}?assetId=${PETR4}`)
    ).json<TradeQuote>();
    tick();
    const results = await Promise.all([
      reverse(deposit),
      call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, live), ana, {
        type: 'buy',
        assetId: PETR4,
        quantity: 100,
        quotedAt: seen.tradable ? seen.quotedAt : '',
      }),
    ]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(Number((await statement()).balance)).toBeGreaterThanOrEqual(0);
  });

  it('carteira de outro: 404 com aviso; colaborador: 403; sem sessão: 401 (CA08)', async () => {
    const deposit = await firstEntryId();
    const bia = await t.registerConfirmed({
      name: 'Bia Lima',
      email: 'bia@exemplo.com',
      password: 'outra-senha-longa',
    });
    expect((await reverse(deposit, live, bia)).statusCode).toBe(404);
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
    expect((await reverse(deposit, live, login.json<AuthSession>())).statusCode).toBe(403);
    tick();
    const anonymous = await t.app.inject({
      method: 'POST',
      url: portfolioSubPath(PORTFOLIO_PATHS.reversals, live),
      payload: { entryId: deposit },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('exportação com o momento do estorno, versão 6; exclusão conta os estornos (CA07, CA09)', async () => {
    const deposit = await firstEntryId();
    const buy = await deal('buy', 10);
    expect((await reverse(buy)).statusCode).toBe(201);
    const reversedAt = now.toISOString();

    const exported = (await call('GET', PROFILE_PATHS.export)).json<{
      version: number;
      portfolios: Array<{ cashEntries: unknown[]; trades: unknown[] }>;
    }>();
    expect(exported.version).toBe(6);
    expect(exported.portfolios[0]?.cashEntries).toEqual([
      expect.objectContaining({ amount: '5000.00', reversedAt: null }),
    ]);
    expect(exported.portfolios[0]?.trades).toEqual([
      expect.objectContaining({ quantity: 10, reversedAt }),
    ]);
    expect(deposit).toBeTruthy();

    expect((await call('DELETE', portfolioPath(live))).statusCode).toBe(204);
    // Aporte inicial, compra e o estorno.
    expect(t.portfolioRepo.deletions[0]).toMatchObject({ entries: 3 });
    expect(t.portfolioRepo.ledger.reversals).toHaveLength(0);
  });
});
