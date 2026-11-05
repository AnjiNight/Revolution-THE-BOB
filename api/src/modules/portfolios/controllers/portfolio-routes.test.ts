import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  portfolioPath,
  PROFILE_PATHS,
  type AuthSession,
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

  it('exportação: seção portfolios e versão 2 (CA07)', async () => {
    await create({ name: 'Dividendos', type: 'live' });
    const res = await call('GET', PROFILE_PATHS.export, ana);
    expect(res.json()).toMatchObject({
      version: 2,
      portfolios: [{ name: 'Dividendos', type: 'live', startDate: '2026-11-05' }],
    });
  });
});
