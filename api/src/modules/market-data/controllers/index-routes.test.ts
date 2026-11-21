import { addDays, AUTH_PATHS, INDEX_PATHS, isWeekend, type AuthSession } from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = new Date('2026-11-04T15:00:00Z');

describe('rota da série do CDI (SPEC-007)', () => {
  let t: TestApp;
  let collaborator: AuthSession;

  beforeEach(async () => {
    t = await buildTestApp({ clock: () => NOW });
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
    collaborator = login.json<AuthSession>();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (session: AuthSession | null) =>
    t.app.inject({
      method: 'GET',
      url: INDEX_PATHS.cdi,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
    });

  const store = (from: string, to: string) => {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!isWeekend(day)) t.indexRates.rates.set(day, '0.050788');
    }
  };

  it('sem dados: série vazia, sem execução e sem aviso', async () => {
    const res = await get(collaborator);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      from: null,
      to: null,
      days: 0,
      lastRun: null,
      stale: false,
      missingTradingDays: 0,
    });
  });

  it('período, última execução terminada e série em dia (CA09)', async () => {
    store('2016-01-04', '2026-11-03');
    const runId = await t.runs.start('cdi_diario', NOW);
    await t.runs.finish(
      runId,
      {
        status: 'sucesso',
        records: 1,
        affectedAssets: 0,
        periodStart: null,
        periodEnd: null,
        errors: [],
      },
      NOW,
    );

    expect((await get(collaborator)).json()).toMatchObject({
      from: '2016-01-04',
      to: '2026-11-03',
      lastRun: { at: NOW.toISOString(), status: 'sucesso' },
      stale: false,
    });
  });

  it('série parada há mais de 3 dias úteis avisa (CA09)', async () => {
    store('2026-10-01', '2026-10-28');
    expect((await get(collaborator)).json()).toMatchObject({ to: '2026-10-28', stale: true });
  });

  it('só colaborador: usuário recebe 403 e sem sessão, 401', async () => {
    const user = await t.registerConfirmed();
    expect((await get(user)).statusCode).toBe(403);
    expect((await get(null)).statusCode).toBe(401);
  });
});
