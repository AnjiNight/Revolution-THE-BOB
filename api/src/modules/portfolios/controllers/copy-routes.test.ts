import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  portfolioSubPath,
  PROFILE_PATHS,
  type AuthSession,
  type CashStatement,
  type PersonalDataExport,
  type Portfolio,
  type PortfolioCopyResult,
  type PortfolioList,
  type PortfolioPositions,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const PETR4 = '11111111-1111-4111-8111-111111111111';
const MXRF11 = '22222222-2222-4222-8222-222222222222';

/** Sexta-feira, 06/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-06T15:00:00Z');

describe('nova carteira a partir de outra (SPEC-023)', () => {
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
      name: 'PETR4',
      assetClass: 'stock',
      active: true,
    });
    t.market.assets.set(MXRF11, {
      id: MXRF11,
      ticker: 'MXRF11',
      name: 'MXRF11',
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
    t.market.dailyCloses.set(MXRF11, new Map([['2019-03-15', '10.00']]));
    t.market.quotes.set(PETR4, {
      price: '31.20',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    t.market.closes.set(PETR4, { date: '2026-11-05', close: '31.00' });
    t.market.closes.set(MXRF11, { date: '2026-11-05', close: '10.50' });
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

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
    session: AuthSession | null = ana,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  const newPortfolio = async (payload: Record<string, unknown>) =>
    (await call('POST', PORTFOLIO_PATHS.list, payload)).json<{ portfolio: { id: string } }>()
      .portfolio.id;

  /** Cada pedido um segundo depois do anterior: a ordem do livro não fica no empate. */
  const tick = () => {
    now = new Date(now.getTime() + 1000);
  };

  const trade = (id: string, payload: Record<string, unknown>) => {
    tick();
    return call('POST', portfolioSubPath(PORTFOLIO_PATHS.trades, id), payload);
  };

  const cash = (id: string, payload: Record<string, unknown>) => {
    tick();
    return call('POST', portfolioCashPath(id), payload);
  };

  const copy = (id: string, payload: Record<string, unknown>, session: AuthSession | null = ana) =>
    call('POST', portfolioSubPath(PORTFOLIO_PATHS.copies, id), payload, session);

  const positions = async (id: string) =>
    (await call('GET', portfolioSubPath(PORTFOLIO_PATHS.positions, id))).json<PortfolioPositions>();

  const statement = async (id: string) =>
    (await call('GET', portfolioCashPath(id))).json<CashStatement>();

  /** O que um lançamento copiado mantém (tudo menos o id e o saldo, que é o mesmo por conta). */
  const shape = (entry: CashStatement['entries'][number]) => ({
    type: entry.type,
    amount: entry.amount,
    date: entry.date,
    recordedAt: entry.recordedAt,
    reversedAt: entry.reversedAt,
    trade: entry.trade ? { ticker: entry.trade.ticker, quantity: entry.trade.quantity } : null,
  });

  /** A histórica do beforeEach com uma compra, uma venda e um aporte estornado. */
  const fillHistorical = async () => {
    expect(
      (await trade(historical, { type: 'buy', assetId: PETR4, quantity: 100, date: '2019-03-15' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await trade(historical, { type: 'buy', assetId: MXRF11, quantity: 50, date: '2019-03-15' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await trade(historical, { type: 'sell', assetId: PETR4, quantity: 20, date: '2019-05-20' }))
        .statusCode,
    ).toBe(201);
    const extra = await cash(historical, { type: 'deposit', amount: '50', date: '2019-05-20' });
    expect(extra.statusCode).toBe(201);
    const reversed = await call('POST', portfolioSubPath(PORTFOLIO_PATHS.reversals, historical), {
      entryId: extra.json<{ entry: { id: string } }>().entry.id,
    });
    expect(reversed.statusCode).toBe(201);
  };

  it('"tudo": mesmo tipo e início, os lançamentos que valem (sem estornados) iguais, e as mesmas contas (CA01)', async () => {
    await fillHistorical();
    tick();
    const res = await copy(historical, { name: ' Cenário B ', scope: 'all' });
    expect(res.statusCode).toBe(201);
    const { portfolio, copied } = res.json<PortfolioCopyResult>();
    expect(portfolio).toMatchObject({
      name: 'Cenário B',
      type: 'historical',
      startDate: '2019-01-02',
      createdAt: now.toISOString(),
      copiedFrom: { id: historical, name: 'E se em 2019' },
    });
    expect(copied).toEqual({ cashEntries: 1, trades: 3 });

    const original = await statement(historical);
    const twin = await statement(portfolio.id);
    expect(twin.balance).toBe(original.balance);
    // O aporte estornado e o estorno ficam de fora; o resto entra igual, inclusive o horário.
    expect(twin.entries.map(shape)).toEqual(
      original.entries.filter((entry) => entry.reversedAt === null).map(shape),
    );
    expect(twin.entries.map((entry) => entry.balanceAfter)).toEqual(
      original.entries
        .filter((entry) => entry.reversedAt === null)
        .map((entry) => entry.balanceAfter),
    );
    expect(await positions(portfolio.id)).toEqual(await positions(historical));
    expect(twin.entries.map((entry) => entry.id)).not.toContain(original.entries[0]?.id);
  });

  it('"só o dinheiro": aportes e retiradas nas mesmas datas, sem posições (CA02)', async () => {
    await fillHistorical();
    const res = await copy(historical, { name: 'Outra divisão', scope: 'cash' });
    expect(res.statusCode).toBe(201);
    const { portfolio, copied } = res.json<PortfolioCopyResult>();
    expect(copied).toEqual({ cashEntries: 1, trades: 0 });
    const twin = await statement(portfolio.id);
    expect(twin.balance).toBe('10000.00');
    expect(twin.entries.map(shape)).toEqual([
      {
        type: 'deposit',
        amount: '10000.00',
        date: '2019-01-02',
        recordedAt: '2026-11-06T15:00:00.000Z',
        reversedAt: null,
        trade: null,
      },
    ]);
    expect((await positions(portfolio.id)).positions).toEqual([]);
  });

  it('"só o dinheiro" com uma retirada que saiu do lucro de uma venda: 409 e nada gravado (CA02)', async () => {
    const id = await newPortfolio({
      name: 'Lucro sacado',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '1000',
    });
    await trade(id, { type: 'buy', assetId: PETR4, quantity: 10, date: '2019-03-15' }); // 253,00
    await trade(id, { type: 'sell', assetId: PETR4, quantity: 10, date: '2019-05-20' }); // 280,00
    const out = await cash(id, { type: 'withdrawal', amount: '1020', date: '2019-05-20' });
    expect(out.statusCode).toBe(201);

    const res = await copy(id, { name: 'Sem as vendas', scope: 'cash' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'copy_breaks_cash',
      details: { date: '2019-05-20', amount: '1020.00' },
    });
    const list = (await call('GET', PORTFOLIO_PATHS.list)).json<PortfolioList>();
    expect(list.portfolios.map((p) => p.name).sort()).toEqual(['E se em 2019', 'Lucro sacado']);
    // Com tudo, a mesma carteira copia normalmente.
    expect((await copy(id, { name: 'Com as vendas', scope: 'all' })).statusCode).toBe(201);
  });

  it('"copiar até" na histórica corta o livro no dia, inclusive; o próximo lançamento segue a RB25 (CA03)', async () => {
    await fillHistorical();
    const res = await copy(historical, { name: 'Até março', scope: 'all', until: '2019-03-15' });
    expect(res.statusCode).toBe(201);
    const { portfolio, copied } = res.json<PortfolioCopyResult>();
    expect(copied).toEqual({ cashEntries: 1, trades: 2 });
    expect((await positions(portfolio.id)).lastEntryDate).toBe('2019-03-15');

    const early = await cash(portfolio.id, { type: 'deposit', amount: '1', date: '2019-03-13' });
    expect(early.json()).toMatchObject({ fields: { date: 'before_last_entry' } });
    expect(
      (await cash(portfolio.id, { type: 'deposit', amount: '1', date: '2019-03-15' })).statusCode,
    ).toBe(201);
    // A original não mudou (CA06).
    expect((await statement(historical)).balance).toBe((await positions(historical)).cash);
  });

  it('"copiar até": fora da histórica, antes do início, hoje ou depois e formato errado (CA03)', async () => {
    const live = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '100' });
    const untilError = async (id: string, until: string) =>
      (await copy(id, { name: `Cópia ${until}`, scope: 'all', until })).json<{
        fields?: Record<string, string>;
      }>().fields?.until;
    expect(await untilError(live, '2026-11-05')).toBe('not_allowed');
    expect(await untilError(historical, '2018-12-31')).toBe('before_start');
    expect(await untilError(historical, '2026-11-06')).toBe('future');
    expect(await untilError(historical, '2026-12-01')).toBe('future');
    expect(await untilError(historical, '15/03/2019')).toBe('invalid_date');
    expect(
      (await copy(historical, { name: 'Ontem', scope: 'all', until: '2026-11-05' })).statusCode,
    ).toBe(201);
    // Vazio é o mesmo que não mandar.
    expect((await copy(historical, { name: 'Vazio', scope: 'cash', until: '' })).statusCode).toBe(
      201,
    );
  });

  it('ao vivo: a cópia leva a cotação usada e o horário; a compra de ontem não se estorna, a de hoje sim (CA01, CA07)', async () => {
    now = new Date('2026-11-05T15:00:00Z'); // quinta-feira, 05/11
    t.market.quotes.set(PETR4, {
      price: '30.00',
      at: new Date('2026-11-05T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    const live = await newPortfolio({ name: 'Cenário A', type: 'live', initialAmount: '5000' });
    const buy = await trade(live, {
      type: 'buy',
      assetId: PETR4,
      quantity: 100,
      quotedAt: '2026-11-05T14:30:00.000Z',
    });
    expect(buy.statusCode).toBe(201);

    now = new Date('2026-11-06T15:00:00Z'); // sexta-feira, 06/11
    t.market.quotes.set(PETR4, {
      price: '31.20',
      at: new Date('2026-11-06T14:30:00Z'),
      level: 'free',
      source: 'brapi',
    });
    const res = await copy(live, { name: 'Cenário B', scope: 'all' });
    expect(res.statusCode).toBe(201);
    const { portfolio, copied } = res.json<PortfolioCopyResult>();
    expect(portfolio).toMatchObject({ type: 'live', startDate: '2026-11-05' });
    expect(copied).toEqual({ cashEntries: 1, trades: 1 });

    const twin = await statement(portfolio.id);
    const copiedBuy = twin.entries.find((entry) => entry.trade);
    expect(copiedBuy).toMatchObject({
      date: '2026-11-05',
      recordedAt: '2026-11-05T15:00:01.000Z',
      trade: { ticker: 'PETR4', quantity: 100, price: '30.00' },
      reversible: false,
    });
    expect(await positions(portfolio.id)).toEqual(await positions(live));

    // Na cópia, o lançamento novo é de agora e segue as regras de sempre.
    const today = await trade(portfolio.id, {
      type: 'sell',
      assetId: PETR4,
      quantity: 10,
      quotedAt: '2026-11-06T14:30:00.000Z',
    });
    expect(today.statusCode).toBe(201);
    const sell = (await statement(portfolio.id)).entries.find((entry) => entry.type === 'sell');
    expect(sell).toMatchObject({ date: '2026-11-06', reversible: true });
    // A original continua como estava (CA06).
    expect((await positions(live)).positions[0]?.quantity).toBe(100);
  });

  it('a cópia é independente, sabe de onde veio e perde só o nome quando a original é excluída (CA06)', async () => {
    tick();
    const res = await copy(historical, { name: 'Cenário B', scope: 'cash' });
    const { portfolio } = res.json<PortfolioCopyResult>();

    const list = (await call('GET', PORTFOLIO_PATHS.list)).json<PortfolioList>();
    expect(list.portfolios.map((p) => [p.name, p.copiedFrom])).toEqual([
      ['Cenário B', { id: historical, name: 'E se em 2019' }],
      ['E se em 2019', null],
    ]);

    await cash(portfolio.id, { type: 'withdrawal', amount: '10000', date: '2019-01-02' });
    expect((await statement(historical)).balance).toBe('10000.00');

    expect((await call('DELETE', portfolioPath(historical))).statusCode).toBe(204);
    const alone = (await call('GET', portfolioPath(portfolio.id))).json<{ portfolio: Portfolio }>();
    expect(alone.portfolio.copiedFrom).toEqual({ id: historical, name: null });

    const exported = (await call('GET', PROFILE_PATHS.export)).json<PersonalDataExport>();
    expect(exported.version).toBe(7);
    expect(exported.portfolios.map((p) => [p.name, p.copiedFrom])).toEqual([
      ['Cenário B', { id: historical, name: null }],
    ]);
  });

  it('nome repetido ou 21ª carteira: 409 e nada gravado; o nome é limpo (CA04)', async () => {
    const same = await copy(historical, { name: 'e se EM 2019', scope: 'all' });
    expect(same.statusCode).toBe(409);
    expect(same.json()).toMatchObject({ error: 'portfolio_name_in_use' });

    for (let i = 2; i <= 20; i += 1) {
      expect((await copy(historical, { name: `Cópia ${i}`, scope: 'cash' })).statusCode).toBe(201);
    }
    const extra = await copy(historical, { name: 'Cópia 21', scope: 'cash' });
    expect(extra.statusCode).toBe(409);
    expect(extra.json()).toMatchObject({ error: 'portfolio_limit_reached' });
    expect((await call('GET', PORTFOLIO_PATHS.list)).json<PortfolioList>().portfolios).toHaveLength(
      20,
    );
  });

  it('dados inválidos: nome e o que copiar (CA04)', async () => {
    const res = await copy(historical, { name: '', scope: 'tudo' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'validation_error',
      fields: { name: 'required', scope: 'invalid_option' },
    });
  });

  it('original de outro usuário ou inexistente: 404 e a tentativa no log; colaborador 403; sem sessão 401 (CA05)', async () => {
    const bia = await t.registerConfirmed({
      name: 'Bia Lima',
      email: 'bia@exemplo.com',
      password: 'outra-senha-longa',
    });
    const foreign = await copy(historical, { name: 'Da Ana', scope: 'all' }, bia);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ error: 'portfolio_not_found' });
    expect(t.logs.text).toContain('tentativa de acessar carteira de outro usuário');
    expect(t.logs.text).not.toContain('E se em 2019');
    expect(
      (await copy('99999999-9999-4999-8999-999999999999', { name: 'Nada', scope: 'all' }))
        .statusCode,
    ).toBe(404);

    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Colab', email: 'colab@exemplo.com' },
      () => 'senha-do-colaborador',
    );
    const login = await t.app.inject({
      method: 'POST',
      url: AUTH_PATHS.collaboratorLogin,
      payload: { email: 'colab@exemplo.com', password: 'senha-do-colaborador' },
    });
    const colab = login.json<AuthSession>();
    expect((await copy(historical, { name: 'Colab', scope: 'all' }, colab)).statusCode).toBe(403);
    expect((await copy(historical, { name: 'Anônimo', scope: 'all' }, null)).statusCode).toBe(401);
  });
});
