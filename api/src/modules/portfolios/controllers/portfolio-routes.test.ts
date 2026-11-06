import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioCashPath,
  portfolioPath,
  PROFILE_PATHS,
  type AuthSession,
  type CashEntryResult,
  type CashStatement,
  type Portfolio,
  type PortfolioList,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../../market-data/domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Quinta-feira, 05/11/2026, 12:00 em Brasília. */
let now = new Date('2026-11-05T15:00:00Z');

describe('rotas das carteiras (SPEC-012)', () => {
  let t: TestApp;
  let ana: AuthSession;

  beforeEach(async () => {
    now = new Date('2026-11-05T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2023, 2026]) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    ana = await t.registerConfirmed();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    session: AuthSession | null,
    payload?: Record<string, unknown>,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  const create = (payload: Record<string, unknown>, session = ana) =>
    call('POST', PORTFOLIO_PATHS.list, session, payload);

  const other = () =>
    t.registerConfirmed({
      name: 'Bia Lima',
      email: 'bia@exemplo.com',
      password: 'outra-senha-longa',
    });

  it('cria ao vivo (início hoje em Brasília) e histórica (início escolhido) (CA01)', async () => {
    const live = await create({ name: '  Dividendos ', type: 'live' });
    expect(live.statusCode).toBe(201);
    expect(live.json<{ portfolio: Portfolio }>().portfolio).toMatchObject({
      name: 'Dividendos',
      type: 'live',
      startDate: '2026-11-05',
    });

    const historical = await create({
      name: 'E se em 2019',
      type: 'historical',
      startDate: '2019-01-02',
    });
    expect(historical.json<{ portfolio: Portfolio }>().portfolio).toMatchObject({
      type: 'historical',
      startDate: '2019-01-02',
    });
  });

  it('ao vivo criada às 23h30 de Brasília começa nesse dia, não no seguinte (UTC)', async () => {
    now = new Date('2026-11-06T02:30:00Z'); // 05/11, 23:30 em Brasília
    const res = await create({ name: 'Noite', type: 'live' });
    expect(res.json<{ portfolio: Portfolio }>().portfolio.startDate).toBe('2026-11-05');
  });

  it('data de início da histórica: pregão até ontem; o resto com o motivo (CA02)', async () => {
    const reason = async (startDate: string) =>
      (await create({ name: `H ${startDate}`, type: 'historical', startDate })).json<{
        fields?: Record<string, string>;
      }>().fields?.startDate;
    expect(await reason('2023-12-25')).toBe('not_trading_day'); // Natal
    expect(await reason('2023-12-23')).toBe('not_trading_day'); // sábado
    expect(await reason('2015-12-30')).toBe('before_history');
    expect(await reason('2026-11-05')).toBe('future'); // hoje
    expect(await reason('2026-12-01')).toBe('future');
    expect(
      (await create({ name: 'Ontem', type: 'historical', startDate: '2026-11-04' })).statusCode,
    ).toBe(201);

    const unpublished = await create({
      name: 'Sem calendário',
      type: 'historical',
      startDate: '2018-03-01',
    });
    expect(unpublished.statusCode).toBe(409);
    expect(unpublished.json()).toMatchObject({ error: 'calendar_not_published' });
  });

  it('nome único por usuário, sem maiúsculas nem acentos; outro usuário pode repetir (CA03)', async () => {
    await create({ name: 'Dividendos', type: 'live' });
    const repeated = await create({ name: 'dividêndos', type: 'live' });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({ error: 'portfolio_name_in_use' });
    expect((await create({ name: 'Dividendos', type: 'live' }, await other())).statusCode).toBe(
      201,
    );
  });

  it('a 21ª carteira é recusada (CA01)', async () => {
    for (let i = 1; i <= 20; i += 1) {
      expect((await create({ name: `Carteira ${i}`, type: 'live' })).statusCode).toBe(201);
    }
    const extra = await create({ name: 'Carteira 21', type: 'live' });
    expect(extra.statusCode).toBe(409);
    expect(extra.json()).toMatchObject({ error: 'portfolio_limit_reached' });
  });

  it('lista só as do usuário, da mais recente para a mais antiga, com o limite (CA05)', async () => {
    await create({ name: 'Primeira', type: 'live' });
    now = new Date('2026-11-05T16:00:00Z');
    await create({ name: 'Segunda', type: 'live' });
    await create({ name: 'Da Bia', type: 'live' }, await other());

    const list = (await call('GET', PORTFOLIO_PATHS.list, ana)).json<PortfolioList>();
    expect(list.limit).toBe(20);
    expect(list.portfolios.map((p) => p.name)).toEqual(['Segunda', 'Primeira']);
  });

  it('carteira de outro usuário: 404 em todas as rotas, e a tentativa fica no log (CA05)', async () => {
    const bia = await other();
    const id = (await create({ name: 'Da Bia', type: 'live' }, bia)).json<{
      portfolio: Portfolio;
    }>().portfolio.id;
    for (const [method, payload] of [
      ['GET', undefined],
      ['PATCH', { name: 'Minha' }],
      ['DELETE', undefined],
    ] as const) {
      const res = await call(method, portfolioPath(id), ana, payload);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'portfolio_not_found' });
    }
    expect(t.logs.text).toContain('tentativa de acessar carteira de outro usuário');
    expect(t.logs.text).not.toContain('Da Bia');
    expect((await call('GET', portfolioPath(id), bia)).statusCode).toBe(200);
  });

  it('colaborador recebe 403; sem sessão, 401 (CA05)', async () => {
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
    expect((await call('GET', PORTFOLIO_PATHS.list, collaborator)).statusCode).toBe(403);
    expect((await create({ name: 'X', type: 'live' }, collaborator)).statusCode).toBe(403);
    expect((await call('GET', PORTFOLIO_PATHS.list, null)).statusCode).toBe(401);
  });

  it('renomear: o mesmo nome não grava; tipo e início não mudam (CA04, CA06)', async () => {
    const created = (await create({ name: 'Dividendos', type: 'live' })).json<{
      portfolio: Portfolio;
    }>().portfolio;
    now = new Date('2026-11-05T17:00:00Z');

    const same = await call('PATCH', portfolioPath(created.id), ana, { name: ' Dividendos ' });
    expect(same.json<{ portfolio: Portfolio }>().portfolio.updatedAt).toBe(created.updatedAt);

    const renamed = await call('PATCH', portfolioPath(created.id), ana, { name: 'Renda' });
    expect(renamed.json<{ portfolio: Portfolio }>().portfolio).toMatchObject({
      name: 'Renda',
      type: 'live',
      updatedAt: now.toISOString(),
    });

    const immutable = await call('PATCH', portfolioPath(created.id), ana, {
      name: 'X',
      type: 'historical',
    });
    expect(immutable.statusCode).toBe(400);
    expect(immutable.json()).toMatchObject({ fields: { type: 'immutable' } });
  });

  it('excluir apaga a carteira e grava o registro sem dado pessoal (CA06)', async () => {
    const id = (
      await create({ name: 'Dividendos', type: 'historical', startDate: '2019-01-02' })
    ).json<{
      portfolio: Portfolio;
    }>().portfolio.id;
    expect((await call('DELETE', portfolioPath(id), ana)).statusCode).toBe(204);
    expect((await call('GET', portfolioPath(id), ana)).statusCode).toBe(404);
    expect(t.portfolioRepo.deletions).toEqual([
      { portfolioId: id, type: 'historical', entries: 0, at: now },
    ]);
  });

  it('exportação: seção portfolios (CA07); a SPEC-013 subiu a versão para 3', async () => {
    await create({ name: 'Dividendos', type: 'live' });
    const res = await call('GET', PROFILE_PATHS.export, ana);
    expect(res.json()).toMatchObject({
      version: 3,
      portfolios: [{ name: 'Dividendos', type: 'live', startDate: '2026-11-05', cashEntries: [] }],
    });
  });
});

describe('caixa das carteiras (SPEC-013)', () => {
  let t: TestApp;
  let ana: AuthSession;

  beforeEach(async () => {
    now = new Date('2026-11-05T15:00:00Z');
    t = await buildTestApp({ clock: () => now });
    for (const year of [2019, 2021, 2026]) {
      await t.calendar.publish(year, { nonTradingDays: suggestNonTradingDays(year) }, 'colab');
    }
    ana = await t.registerConfirmed();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    session: AuthSession | null,
    payload?: Record<string, unknown>,
  ) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  const newPortfolio = async (payload: Record<string, unknown>) =>
    (await call('POST', PORTFOLIO_PATHS.list, ana, payload)).json<{ portfolio: Portfolio }>()
      .portfolio.id;
  const live = () => newPortfolio({ name: 'Ao vivo', type: 'live' });
  const historical = () =>
    newPortfolio({ name: 'E se em 2019', type: 'historical', startDate: '2019-01-02' });

  const add = (id: string, payload: Record<string, unknown>, session = ana) =>
    call('POST', portfolioCashPath(id), session, payload);
  const statement = async (id: string, query = '') =>
    (await call('GET', `${portfolioCashPath(id)}${query}`, ana)).json<CashStatement>();
  const dateError = async (id: string, date?: string) =>
    (await add(id, { type: 'deposit', amount: '10', ...(date ? { date } : {}) })).json<{
      fields?: Record<string, string>;
    }>().fields?.date;

  it('ao vivo: aporte e retirada no momento atual, em qualquer dia; data enviada é recusada (CA02)', async () => {
    const id = await live();
    now = new Date('2026-11-07T18:30:00Z'); // sábado, 15:30 em Brasília
    const deposit = await add(id, { type: 'deposit', amount: '1000' });
    expect(deposit.statusCode).toBe(201);
    expect(deposit.json<CashEntryResult>()).toEqual({
      entry: {
        id: expect.any(String),
        type: 'deposit',
        amount: '1000.00',
        date: '2026-11-07',
        recordedAt: '2026-11-07T18:30:00.000Z',
        balanceAfter: '1000.00',
      },
      balance: '1000.00',
    });
    now = new Date('2026-11-08T02:30:00Z'); // ainda sábado, 23:30 em Brasília
    const withdrawal = await add(id, { type: 'withdrawal', amount: '250.5' });
    expect(withdrawal.json<CashEntryResult>()).toMatchObject({
      entry: { date: '2026-11-07', amount: '250.50', balanceAfter: '749.50' },
      balance: '749.50',
    });
    expect(await dateError(id, '2026-11-06')).toBe('not_allowed');
  });

  it('histórica: pregão, não antes do início nem do último lançamento, antes de hoje (CA03)', async () => {
    const id = await historical();
    expect(await dateError(id)).toBe('required');
    expect(await dateError(id, '2018-12-28')).toBe('before_start');
    expect(await dateError(id, '2019-01-05')).toBe('not_trading_day'); // sábado
    expect(await dateError(id, '2021-04-21')).toBe('not_trading_day'); // Tiradentes
    expect(await dateError(id, '2026-11-05')).toBe('future'); // hoje
    expect(await dateError(id, '2026-12-01')).toBe('future');

    expect(
      (await add(id, { type: 'deposit', amount: '1000', date: '2019-03-15' })).statusCode,
    ).toBe(201);
    expect(await dateError(id, '2019-03-14')).toBe('before_last_entry');
    // O mesmo dia do último lançamento é aceito.
    expect((await add(id, { type: 'deposit', amount: '1', date: '2019-03-15' })).statusCode).toBe(
      201,
    );

    const unpublished = await add(id, { type: 'deposit', amount: '10', date: '2020-03-02' });
    expect(unpublished.statusCode).toBe(409);
    expect(unpublished.json()).toMatchObject({ error: 'calendar_not_published' });
    expect((await statement(id)).balance).toBe('1001.00');
  });

  it('retirada maior que o saldo: insufficient_cash com o disponível (CA04)', async () => {
    const id = await live();
    await add(id, { type: 'deposit', amount: '1000' });
    const tooMuch = await add(id, { type: 'withdrawal', amount: '1000.01' });
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json()).toMatchObject({
      error: 'insufficient_cash',
      details: { available: '1000.00' },
    });
    const all = await add(id, { type: 'withdrawal', amount: '1000' });
    expect(all.json<CashEntryResult>().balance).toBe('0.00');
  });

  it('duas retiradas ao mesmo tempo nunca deixam o caixa negativo (CA04)', async () => {
    const id = await live();
    await add(id, { type: 'deposit', amount: '1000' });
    const results = await Promise.all([
      add(id, { type: 'withdrawal', amount: '600' }),
      add(id, { type: 'withdrawal', amount: '600' }),
    ]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect((await statement(id)).balance).toBe('400.00');
  });

  it('valores de R$ 0,01 a R$ 10.000.000,00 com até 2 casas (CA05)', async () => {
    const id = await live();
    for (const amount of ['0', '-5', '0.001', '10000000.01', '1.000,00']) {
      const res = await add(id, { type: 'deposit', amount });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ fields: Record<string, string> }>().fields.amount).toBeDefined();
    }
    expect((await add(id, { type: 'deposit', amount: '10000000.00' })).statusCode).toBe(201);
    expect((await add(id, { type: 'deposit', amount: '0.01' })).statusCode).toBe(201);
  });

  it('valor inicial vira o primeiro aporte; com erro, nada é gravado (CA06)', async () => {
    const liveId = await newPortfolio({ name: 'Ao vivo', type: 'live', initialAmount: '5000' });
    expect((await statement(liveId)).entries).toEqual([
      expect.objectContaining({ type: 'deposit', amount: '5000.00', date: '2026-11-05' }),
    ]);
    const historicalId = await newPortfolio({
      name: 'E se',
      type: 'historical',
      startDate: '2019-01-02',
      initialAmount: '5000.00',
    });
    expect((await statement(historicalId)).entries[0]).toMatchObject({
      date: '2019-01-02',
      balanceAfter: '5000.00',
    });

    const invalid = await call('POST', PORTFOLIO_PATHS.list, ana, {
      name: 'Errada',
      type: 'live',
      initialAmount: '0',
    });
    expect(invalid.json()).toMatchObject({ fields: { initialAmount: 'invalid_amount' } });
    const names = (await call('GET', PORTFOLIO_PATHS.list, ana))
      .json<PortfolioList>()
      .portfolios.map((p) => p.name);
    expect(names).not.toContain('Errada');
  });

  it('extrato do mais recente ao mais antigo, 100 por vez com Mostrar mais (CA08)', async () => {
    const id = await live();
    for (let i = 1; i <= 105; i += 1) {
      now = new Date(Date.parse('2026-11-05T15:00:00Z') + i * 1000);
      await add(id, { type: 'deposit', amount: String(i) });
    }
    const first = await statement(id);
    expect(first).toMatchObject({ balance: '5565.00', hasMore: true, total: 105 });
    expect(first.entries).toHaveLength(100);
    expect(first.entries[0]).toMatchObject({ amount: '105.00', balanceAfter: '5565.00' });
    expect(first.entries[1]).toMatchObject({ amount: '104.00', balanceAfter: '5460.00' });

    const more = await statement(id, '?offset=100');
    expect(more).toMatchObject({ hasMore: false, total: 105 });
    expect(more.entries.map((entry) => entry.amount)).toEqual([
      '5.00',
      '4.00',
      '3.00',
      '2.00',
      '1.00',
    ]);
    expect((await call('GET', `${portfolioCashPath(id)}?offset=abc`, ana)).statusCode).toBe(400);
  });

  it('carteira de outro usuário: 404 com aviso no log; colaborador 403; sem sessão 401', async () => {
    const bia = await t.registerConfirmed({
      name: 'Bia Lima',
      email: 'bia@exemplo.com',
      password: 'outra-senha-longa',
    });
    const biaPortfolio = (
      await call('POST', PORTFOLIO_PATHS.list, bia, { name: 'Da Bia', type: 'live' })
    ).json<{ portfolio: Portfolio }>().portfolio.id;
    expect((await call('GET', portfolioCashPath(biaPortfolio), ana)).statusCode).toBe(404);
    expect((await add(biaPortfolio, { type: 'deposit', amount: '10' })).statusCode).toBe(404);
    expect(t.logs.text).toContain('tentativa de acessar carteira de outro usuário');
    expect((await call('GET', portfolioCashPath(biaPortfolio), null)).statusCode).toBe(401);
    expect((await call('GET', portfolioCashPath('nao-e-uuid'), ana)).statusCode).toBe(404);
  });

  it('excluir a carteira apaga os lançamentos e o registro conta quantos eram (CA07)', async () => {
    const id = await live();
    await add(id, { type: 'deposit', amount: '100' });
    await add(id, { type: 'withdrawal', amount: '40' });
    expect((await call('DELETE', portfolioPath(id), ana)).statusCode).toBe(204);
    expect(t.portfolioRepo.deletions).toEqual([
      { portfolioId: id, type: 'live', entries: 2, at: now },
    ]);
    expect(t.portfolioRepo.cash.entries).toHaveLength(0);
  });

  it('exportação com os lançamentos de cada carteira, na ordem do livro (CA09)', async () => {
    const id = await historical();
    await add(id, { type: 'deposit', amount: '1000', date: '2019-03-15' });
    now = new Date('2026-11-05T16:00:00Z');
    await add(id, { type: 'withdrawal', amount: '100', date: '2019-04-01' });
    const res = await call('GET', PROFILE_PATHS.export, ana);
    expect(res.json()).toMatchObject({
      version: 3,
      portfolios: [
        {
          id,
          cashEntries: [
            {
              type: 'deposit',
              amount: '1000.00',
              date: '2019-03-15',
              recordedAt: '2026-11-05T15:00:00.000Z',
            },
            {
              type: 'withdrawal',
              amount: '100.00',
              date: '2019-04-01',
              recordedAt: '2026-11-05T16:00:00.000Z',
            },
          ],
        },
      ],
    });
  });
});
