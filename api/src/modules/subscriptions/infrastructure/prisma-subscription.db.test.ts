import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { PrismaTaskRunRepository } from '../../market-data/infrastructure/prisma-quote-repository.js';
import { SubscriptionRenewal } from '../application/subscription-renewal.js';
import { SubscriptionService } from '../application/subscription-service.js';
import { PrismaSubscriptionRepository } from './prisma-subscription-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-025: CA02 a CA04, CA07 e CA09). Rodam só com
 * TEST_DATABASE_URL apontando para um banco com as migrações aplicadas. ATENÇÃO: apagam as contas
 * de teste abaixo (com as assinaturas) e as execuções da renovação nesse banco.
 */
const url = process.env.TEST_DATABASE_URL;
const EMAILS = ['assinante-a@exemplo.com', 'assinante-b@exemplo.com'];

describe.skipIf(!url)('assinaturas no PostgreSQL', () => {
  let prisma: PrismaClient;
  let repo: PrismaSubscriptionRepository;
  let now: Date;
  let service: SubscriptionService;
  let ana: string;
  let bia: string;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaSubscriptionRepository(prisma);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.execucaoTarefa.deleteMany({ where: { tarefa: 'renovacao_assinaturas' } });
    const [a, b] = await Promise.all(
      EMAILS.map((email) =>
        prisma.usuario.create({ data: { nome: 'Teste', email, senhaHash: '$argon2id$fake' } }),
      ),
    );
    ana = a!.id;
    bia = b!.id;
    now = new Date('2026-11-22T13:00:00Z');
    service = new SubscriptionService({ subscriptions: repo, clock: () => now });
  });

  it('os planos da migração', async () => {
    expect(await service.plans()).toEqual({
      plans: [
        { code: 'gratuito', priceCents: 0, durationDays: null },
        { code: 'assinante_mensal', priceCents: 1990, durationDays: 30 },
        { code: 'assinante_anual', priceCents: 19900, durationDays: 365 },
      ],
    });
  });

  it('dois pedidos de assinatura ao mesmo tempo criam uma só', async () => {
    const results = await Promise.allSettled([
      service.subscribe(ana, 'user', 'assinante_mensal'),
      service.subscribe(ana, 'user', 'assinante_anual'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.assinatura.count({ where: { usuarioId: ana } })).toBe(1);
    expect(
      await prisma.pagamentoSimulado.count({ where: { assinatura: { usuarioId: ana } } }),
    ).toBe(1);
  });

  it('cancelar, renovar pela tarefa e registrar a execução', async () => {
    await service.subscribe(ana, 'user', 'assinante_mensal');
    await service.subscribe(bia, 'user', 'assinante_mensal');
    await service.cancel(bia, 'user');

    now = new Date('2026-12-23T03:15:00Z');
    const runs = new PrismaTaskRunRepository(prisma);
    const result = await new SubscriptionRenewal({
      subscriptions: service,
      runs,
      clock: () => now,
    }).run();
    expect(result).toMatchObject({
      status: 'sucesso',
      records: 1,
      totals: { renovadas: 1, expiradas: 1 },
    });
    expect((await service.mine(ana, 'user')).subscription?.endsAt).toBe('2027-01-21T13:00:00.000Z');
    expect(await service.hasPremium(bia, 'user')).toBe(false);
    expect((await runs.lastRun('renovacao_assinaturas'))?.status).toBe('sucesso');
  });

  it('exporta e apaga em cascata com a conta (CA07)', async () => {
    await service.subscribe(ana, 'user', 'assinante_anual');
    const exported = await repo.exportForUser(ana);
    expect(exported).toHaveLength(1);
    expect(exported[0]?.payments).toEqual([
      {
        amountCents: 19900,
        periodStart: '2026-11-22T13:00:00.000Z',
        periodEnd: '2027-11-22T13:00:00.000Z',
        recordedAt: expect.any(String) as string,
      },
    ]);
    await prisma.usuario.delete({ where: { id: ana } });
    expect(await prisma.assinatura.count({ where: { usuarioId: ana } })).toBe(0);
    expect(await prisma.pagamentoSimulado.count()).toBe(
      await prisma.pagamentoSimulado.count({ where: { assinatura: { usuarioId: bia } } }),
    );
  });

  it('o banco recusa assinatura do plano Gratuito e pagamento zerado', async () => {
    await expect(
      prisma.assinatura.create({
        data: { usuarioId: ana, plano: 'gratuito', inicio: now, fim: new Date(now.getTime() + 1) },
      }),
    ).rejects.toThrow();
    const sub = await prisma.assinatura.create({
      data: {
        usuarioId: ana,
        plano: 'assinante_mensal',
        inicio: now,
        fim: new Date(now.getTime() + 1000),
      },
    });
    await expect(
      prisma.pagamentoSimulado.create({
        data: {
          assinaturaId: sub.id,
          plano: 'assinante_mensal',
          valorCentavos: 0,
          periodoInicio: now,
          periodoFim: new Date(now.getTime() + 1000),
        },
      }),
    ).rejects.toThrow();
  });
});
