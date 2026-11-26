import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTaskRuns } from '../../market-data/testing/fakes.js';
import { InMemorySubscriptions } from '../testing/fakes.js';
import { SubscriptionRenewal } from './subscription-renewal.js';
import { SubscriptionService } from './subscription-service.js';

const USER = 'usuario-1';

describe('assinatura com pagamento simulado (SPEC-025)', () => {
  let now: Date;
  let repo: InMemorySubscriptions;
  let service: SubscriptionService;

  beforeEach(() => {
    now = new Date('2026-11-22T13:00:00Z');
    repo = new InMemorySubscriptions(() => now);
    service = new SubscriptionService({ subscriptions: repo, clock: () => now });
  });

  it('lista os três planos na ordem da tela, com preço e duração (CA01)', async () => {
    expect(await service.plans()).toEqual({
      plans: [
        { code: 'gratuito', priceCents: 0, durationDays: null },
        { code: 'assinante_mensal', priceCents: 1990, durationDays: 30 },
        { code: 'assinante_anual', priceCents: 19900, durationDays: 365 },
      ],
    });
  });

  it('sem assinatura: gratuito, sem pagamentos', async () => {
    expect(await service.mine(USER, 'user')).toEqual({
      active: false,
      collaborator: false,
      subscription: null,
      payments: [],
    });
    expect(await service.hasPremium(USER, 'user')).toBe(false);
  });

  it('assinar o mensal grava a assinatura e o pagamento de 30 dias; a segunda é recusada (CA02)', async () => {
    const mine = await service.subscribe(USER, 'user', 'assinante_mensal');
    expect(mine).toEqual({
      active: true,
      collaborator: false,
      subscription: {
        plan: 'assinante_mensal',
        startedAt: '2026-11-22T13:00:00.000Z',
        endsAt: '2026-12-22T13:00:00.000Z',
        autoRenew: true,
        cancelledAt: null,
      },
      payments: [
        {
          plan: 'assinante_mensal',
          amountCents: 1990,
          periodStart: '2026-11-22T13:00:00.000Z',
          periodEnd: '2026-12-22T13:00:00.000Z',
          recordedAt: '2026-11-22T13:00:00.000Z',
        },
      ],
    });
    expect(await service.hasPremium(USER, 'user')).toBe(true);
    await expect(service.subscribe(USER, 'user', 'assinante_anual')).rejects.toMatchObject({
      code: 'subscription_active',
    });
  });

  it('o Gratuito e um plano inventado não se assinam', async () => {
    for (const plan of ['gratuito', 'vip', undefined]) {
      await expect(service.subscribe(USER, 'user', plan)).rejects.toMatchObject({
        code: 'plan_not_found',
      });
    }
    repo.planRows[2]!.active = false;
    await expect(service.subscribe(USER, 'user', 'assinante_anual')).rejects.toMatchObject({
      code: 'plan_not_found',
    });
    expect((await service.plans()).plans.map((plan) => plan.code)).toEqual([
      'gratuito',
      'assinante_mensal',
    ]);
  });

  it('cancelar mantém o acesso até o fim; depois, gratuito na hora, antes da tarefa (CA03)', async () => {
    await service.subscribe(USER, 'user', 'assinante_mensal');
    now = new Date('2026-11-30T12:00:00Z');
    const cancelled = await service.cancel(USER, 'user');
    expect(cancelled.active).toBe(true);
    expect(cancelled.subscription).toMatchObject({
      autoRenew: false,
      cancelledAt: '2026-11-30T12:00:00.000Z',
    });

    now = new Date('2026-12-22T12:59:59Z');
    expect(await service.hasPremium(USER, 'user')).toBe(true);
    now = new Date('2026-12-22T13:00:00Z');
    expect(await service.hasPremium(USER, 'user')).toBe(false);
    const after = await service.mine(USER, 'user');
    expect(after.subscription).toBeNull();
    expect(after.payments).toHaveLength(1);
    await expect(service.cancel(USER, 'user')).rejects.toMatchObject({
      code: 'subscription_not_found',
    });

    // Assinar de novo depois do fim começa um período novo.
    const again = await service.subscribe(USER, 'user', 'assinante_anual');
    expect(again.subscription?.endsAt).toBe('2027-12-22T13:00:00.000Z');
    expect(again.payments.map((payment) => payment.amountCents)).toEqual([19900, 1990]);
  });

  it('reativar antes do fim volta a renovação', async () => {
    await service.subscribe(USER, 'user', 'assinante_mensal');
    await service.cancel(USER, 'user');
    const resumed = await service.resume(USER, 'user');
    expect(resumed.subscription).toMatchObject({ autoRenew: true, cancelledAt: null });
  });

  it('com a renovação ligada, continua assinante entre o vencimento e a tarefa', async () => {
    await service.subscribe(USER, 'user', 'assinante_mensal');
    now = new Date('2026-12-22T20:00:00Z');
    expect(await service.hasPremium(USER, 'user')).toBe(true);
  });

  it('o colaborador não tem plano, mas tem os recursos premium (decisão 6)', async () => {
    expect(await service.hasPremium('colab', 'collaborator')).toBe(true);
    expect(await service.mine('colab', 'collaborator')).toMatchObject({
      active: false,
      collaborator: true,
    });
  });

  it('a tarefa renova as vencidas com o pagamento do período seguinte e registra a execução (CA04)', async () => {
    const runs = new InMemoryTaskRuns();
    const renewal = new SubscriptionRenewal({ subscriptions: service, runs, clock: () => now });
    await service.subscribe(USER, 'user', 'assinante_mensal');
    await service.subscribe('usuario-2', 'user', 'assinante_mensal');
    await service.cancel('usuario-2', 'user');

    // 23/12, 00:15 em Brasília: a de USER renova; a cancelada terminou.
    now = new Date('2026-12-23T03:15:00Z');
    const result = await renewal.run();
    expect(result).toMatchObject({
      status: 'sucesso',
      records: 1,
      totals: { renovadas: 1, pagamentos: 1, expiradas: 1 },
    });
    const mine = await service.mine(USER, 'user');
    expect(mine.subscription?.endsAt).toBe('2027-01-21T13:00:00.000Z');
    expect(mine.payments[0]).toMatchObject({
      periodStart: '2026-12-22T13:00:00.000Z',
      periodEnd: '2027-01-21T13:00:00.000Z',
      amountCents: 1990,
    });
    expect(runs.runs.map((run) => run.task)).toEqual(['renovacao_assinaturas']);

    // De novo no mesmo dia: nada a renovar.
    expect(await renewal.run()).toMatchObject({ records: 0, totals: { renovadas: 0 } });
  });

  it('com o processador parado por dois períodos, grava os dois pagamentos', async () => {
    await service.subscribe(USER, 'user', 'assinante_mensal');
    now = new Date('2027-01-25T03:15:00Z');
    expect(await service.renewDue()).toEqual({ renewed: 1, payments: 2 });
    expect((await service.mine(USER, 'user')).subscription?.endsAt).toBe(
      '2027-02-20T13:00:00.000Z',
    );
  });

  it('exporta as assinaturas com os pagamentos (CA07)', async () => {
    await service.subscribe(USER, 'user', 'assinante_mensal');
    expect(await repo.exportForUser(USER)).toEqual([
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
