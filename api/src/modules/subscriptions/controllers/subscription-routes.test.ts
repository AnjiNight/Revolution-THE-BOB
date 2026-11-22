import {
  AUTH_PATHS,
  PORTFOLIO_PATHS,
  PREMIUM_REQUIRED,
  PROFILE_PATHS,
  SUBSCRIPTION_PATHS,
  type AuthSession,
  type MySubscription,
  type PersonalDataExport,
  type PlanList,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

describe('rotas de plano e assinatura (SPEC-025)', () => {
  let now: Date;
  let t: TestApp;
  let ana: AuthSession;

  beforeEach(async () => {
    now = new Date('2026-11-22T13:00:00Z');
    t = await buildTestApp({ clock: () => now });
    ana = await t.registerConfirmed();
  });

  afterEach(async () => {
    await t.app.close();
  });

  const call = (method: 'GET' | 'POST', url: string, session?: AuthSession, payload?: object) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
      ...(payload ? { payload } : {}),
    });

  const collaborator = async (): Promise<AuthSession> => {
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'Nicoly', email: 'nicoly@equipe.com' },
      () => 'senha-do-colaborador',
    );
    const login = await call('POST', AUTH_PATHS.collaboratorLogin, undefined, {
      email: 'nicoly@equipe.com',
      password: 'senha-do-colaborador',
    });
    return login.json<AuthSession>();
  };

  it('os planos sem sessão; a assinatura pede sessão (CA01)', async () => {
    const plans = await call('GET', SUBSCRIPTION_PATHS.plans);
    expect(plans.statusCode).toBe(200);
    expect(plans.json<PlanList>().plans.map((plan) => [plan.code, plan.priceCents])).toEqual([
      ['gratuito', 0],
      ['assinante_mensal', 1990],
      ['assinante_anual', 19900],
    ]);
    expect((await call('GET', SUBSCRIPTION_PATHS.mine)).statusCode).toBe(401);
  });

  it('assinar, a segunda vez 409, cancelar e reativar (CA02, CA03)', async () => {
    const created = await call('POST', SUBSCRIPTION_PATHS.mine, ana, { plan: 'assinante_anual' });
    expect(created.statusCode).toBe(201);
    expect(created.json<MySubscription>()).toMatchObject({
      active: true,
      subscription: { plan: 'assinante_anual', endsAt: '2027-11-22T13:00:00.000Z' },
      payments: [{ amountCents: 19900 }],
    });

    const again = await call('POST', SUBSCRIPTION_PATHS.mine, ana, { plan: 'assinante_mensal' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'subscription_active' });

    const cancelled = await call('POST', SUBSCRIPTION_PATHS.cancel, ana);
    expect(cancelled.json<MySubscription>().subscription?.autoRenew).toBe(false);
    const resumed = await call('POST', SUBSCRIPTION_PATHS.resume, ana);
    expect(resumed.json<MySubscription>().subscription?.autoRenew).toBe(true);
  });

  it('plano inválido 400; cancelar sem assinatura 404', async () => {
    for (const payload of [{ plan: 'gratuito' }, { plan: 'vip' }, {}]) {
      const response = await call('POST', SUBSCRIPTION_PATHS.mine, ana, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'plan_not_found' });
    }
    expect((await call('POST', SUBSCRIPTION_PATHS.cancel, ana)).statusCode).toBe(404);
  });

  it('comparar carteiras sem assinatura: 403 premium_required, mesmo num pedido feito à mão (CA05)', async () => {
    const url = `${PORTFOLIO_PATHS.comparison}?ids=a,b`;
    const blocked = await call('GET', url, ana);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ error: PREMIUM_REQUIRED });

    await t.subscribe(ana);
    // Com a assinatura, a rota chega à validação dos ids (que aqui são inválidos).
    expect((await call('GET', url, ana)).statusCode).toBe(400);

    // Cancelada e vencida: bloqueada de novo, sem esperar a tarefa.
    await call('POST', SUBSCRIPTION_PATHS.cancel, ana);
    now = new Date('2026-12-22T13:00:00Z');
    expect((await call('GET', url, ana)).statusCode).toBe(403);
  });

  it('o colaborador não assina, mas compara (CA06)', async () => {
    const colab = await collaborator();
    const subscribe = await call('POST', SUBSCRIPTION_PATHS.mine, colab, {
      plan: 'assinante_mensal',
    });
    expect(subscribe.statusCode).toBe(403);
    expect((await call('GET', SUBSCRIPTION_PATHS.mine, colab)).json<MySubscription>()).toEqual({
      active: false,
      collaborator: true,
      subscription: null,
      payments: [],
    });
    const compare = await call('GET', `${PORTFOLIO_PATHS.comparison}?ids=a,b`, colab);
    expect(compare.statusCode).toBe(400);
  });

  it('a exportação traz as assinaturas e os pagamentos simulados (CA07)', async () => {
    await t.subscribe(ana);
    const exported = (await call('GET', PROFILE_PATHS.export, ana)).json<PersonalDataExport>();
    expect(exported.version).toBe(8);
    expect(exported.subscriptions).toEqual([
      {
        plan: 'assinante_mensal',
        startedAt: '2026-11-22T13:00:00.000Z',
        endsAt: '2026-12-22T13:00:00.000Z',
        autoRenew: true,
        cancelledAt: null,
        payments: [
          {
            amountCents: 1990,
            periodStart: '2026-11-22T13:00:00.000Z',
            periodEnd: '2026-12-22T13:00:00.000Z',
            recordedAt: '2026-11-22T13:00:00.000Z',
          },
        ],
      },
    ]);
  });
});
