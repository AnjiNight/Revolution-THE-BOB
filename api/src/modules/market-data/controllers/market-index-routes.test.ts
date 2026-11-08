import {
  addDays,
  AUTH_PATHS,
  INDEX_PATHS,
  isWeekend,
  type AuthSession,
  type MarketIndexStatus,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import { suggestNonTradingDays } from '../domain/calendar-suggestion.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Quarta-feira, 11/11/2026, 12:00 em Brasília. */
const NOW = new Date('2026-11-11T15:00:00Z');

describe('rota dos índices da B3 (SPEC-020 §5.2)', () => {
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
    await t.calendar.publish(2026, { nonTradingDays: suggestNonTradingDays(2026) }, 'colab');
  });

  afterEach(async () => {
    await t.app.close();
  });

  const get = (session: AuthSession | null) =>
    t.app.inject({
      method: 'GET',
      url: INDEX_PATHS.marketIndexes,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
    });

  const store = async (indexId: string, from: string, to: string, skip: string[] = []) => {
    const closes = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!isWeekend(day) && !skip.includes(day)) closes.push({ date: day, value: '168498.45' });
    }
    await t.marketIndexRepo.save(indexId, closes);
  };

  it('sem dados: os dois índices vazios, sem execução', async () => {
    const res = await get(collaborator);
    expect(res.statusCode).toBe(200);
    expect(res.json<MarketIndexStatus>()).toEqual({
      indexes: [
        { code: 'IBOV', from: null, to: null, days: 0, stale: false, missingTradingDays: 0 },
        { code: 'IFIX', from: null, to: null, days: 0, stale: false, missingTradingDays: 0 },
      ],
      lastRun: null,
    });
  });

  it('período, última execução e avisos: parado há mais de 2 pregões e pregão sem fechamento (CA09)', async () => {
    const holidays = suggestNonTradingDays(2026).map((day) => day.date);
    await store('idx-ibov', '2026-01-02', '2026-11-10', [...holidays, '2026-10-14']);
    // O IFIX parou na quinta, 05/11: sexta, segunda e terça já passaram (3 pregões), hoje é quarta.
    await store('idx-ifix', '2026-11-03', '2026-11-05');
    const runId = await t.runs.start('indices_b3', NOW);
    await t.runs.finish(
      runId,
      {
        status: 'falha',
        records: 0,
        affectedAssets: 0,
        periodStart: null,
        periodEnd: null,
        errors: [],
      },
      NOW,
    );

    const status = (await get(collaborator)).json<MarketIndexStatus>();
    expect(status.lastRun).toEqual({ at: NOW.toISOString(), status: 'falha' });
    expect(status.indexes[0]).toMatchObject({
      code: 'IBOV',
      from: '2026-01-02',
      to: '2026-11-10',
      stale: false,
      missingTradingDays: 1,
    });
    expect(status.indexes[1]).toMatchObject({ code: 'IFIX', to: '2026-11-05', stale: true });
  });

  it('só o colaborador: 403 para usuário e 401 sem sessão (CA09)', async () => {
    const user = await t.registerConfirmed();
    expect((await get(user)).statusCode).toBe(403);
    expect((await get(null)).statusCode).toBe(401);
  });
});
