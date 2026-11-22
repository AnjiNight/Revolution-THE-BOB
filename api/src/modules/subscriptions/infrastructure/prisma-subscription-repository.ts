import type { PaidPlanCode, PersonalDataExport } from '@simulador/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { NewSubscription, Renewal, SubscriptionRepository } from '../application/ports.js';
import type { StoredPayment, StoredPlan, StoredSubscription } from '../domain/subscription.js';

interface SubscriptionRow {
  id: string;
  usuarioId: string;
  plano: string;
  inicio: Date;
  fim: Date;
  renovacaoAutomatica: boolean;
  canceladaEm: Date | null;
  criadaEm: Date;
}

function toSubscription(row: SubscriptionRow): StoredSubscription {
  return {
    id: row.id,
    userId: row.usuarioId,
    plan: row.plano as PaidPlanCode,
    startedAt: row.inicio,
    endsAt: row.fim,
    autoRenew: row.renovacaoAutomatica,
    cancelledAt: row.canceladaEm,
    createdAt: row.criadaEm,
  };
}

/** SPEC-025: tabelas `plano`, `assinatura` e `pagamento_simulado`. */
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async plans(): Promise<StoredPlan[]> {
    const rows = await this.prisma.plano.findMany();
    return rows.map((row) => ({
      code: row.codigo,
      priceCents: row.precoCentavos,
      durationDays: row.duracaoDias,
      active: row.ativo,
    }));
  }

  async latest(userId: string): Promise<StoredSubscription | null> {
    const row = await this.prisma.assinatura.findFirst({
      where: { usuarioId: userId },
      orderBy: [{ fim: 'desc' }, { criadaEm: 'desc' }],
    });
    return row ? toSubscription(row) : null;
  }

  async create(input: NewSubscription, now: Date): Promise<StoredSubscription | null> {
    return this.prisma.$transaction(async (tx) => {
      // A linha da conta travada: dois pedidos ao mesmo tempo esperam um pelo outro.
      await tx.$queryRaw`SELECT "id" FROM "usuario" WHERE "id" = ${input.userId}::uuid FOR UPDATE`;
      // A mesma regra de `isActive`: começou e (renova sozinha ou ainda não terminou).
      const active = await tx.assinatura.count({
        where: {
          usuarioId: input.userId,
          inicio: { lte: now },
          OR: [{ renovacaoAutomatica: true }, { fim: { gt: now } }],
        },
      });
      if (active > 0) return null;
      const row = await tx.assinatura.create({
        data: {
          usuarioId: input.userId,
          plano: input.plan,
          inicio: input.startedAt,
          fim: input.endsAt,
          renovacaoAutomatica: true,
        },
      });
      await tx.pagamentoSimulado.create({
        data: {
          assinaturaId: row.id,
          plano: input.plan,
          valorCentavos: input.amountCents,
          periodoInicio: input.startedAt,
          periodoFim: input.endsAt,
        },
      });
      return toSubscription(row);
    });
  }

  async setAutoRenew(id: string, autoRenew: boolean, cancelledAt: Date | null): Promise<void> {
    await this.prisma.assinatura.update({
      where: { id },
      data: { renovacaoAutomatica: autoRenew, canceladaEm: cancelledAt },
    });
  }

  async payments(userId: string): Promise<StoredPayment[]> {
    const rows = await this.prisma.pagamentoSimulado.findMany({
      where: { assinatura: { usuarioId: userId } },
      orderBy: { periodoInicio: 'desc' },
    });
    return rows.map((row) => ({
      plan: row.plano as PaidPlanCode,
      amountCents: row.valorCentavos,
      periodStart: row.periodoInicio,
      periodEnd: row.periodoFim,
      recordedAt: row.registradoEm,
    }));
  }

  async dueForRenewal(now: Date): Promise<StoredSubscription[]> {
    const rows = await this.prisma.assinatura.findMany({
      where: { renovacaoAutomatica: true, fim: { lte: now } },
      orderBy: { fim: 'asc' },
    });
    return rows.map(toSubscription);
  }

  async renew(renewal: Renewal): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Só se o fim ainda é o lido e a renovação continua ligada (cancelou no meio: não renova).
      const updated = await tx.assinatura.updateMany({
        where: { id: renewal.subscriptionId, fim: renewal.from, renovacaoAutomatica: true },
        data: { fim: renewal.to },
      });
      if (updated.count === 0) return false;
      await tx.pagamentoSimulado.create({
        data: {
          assinaturaId: renewal.subscriptionId,
          plano: renewal.plan,
          valorCentavos: renewal.amountCents,
          periodoInicio: renewal.from,
          periodoFim: renewal.to,
        },
      });
      return true;
    });
  }

  countEndedBetween(from: Date, to: Date): Promise<number> {
    return this.prisma.assinatura.count({
      where: { renovacaoAutomatica: false, fim: { gt: from, lte: to } },
    });
  }

  async exportForUser(userId: string): Promise<PersonalDataExport['subscriptions']> {
    const rows = await this.prisma.assinatura.findMany({
      where: { usuarioId: userId },
      orderBy: { inicio: 'desc' },
      include: { pagamentos: { orderBy: { periodoInicio: 'asc' } } },
    });
    return rows.map((row) => ({
      plan: row.plano as PaidPlanCode,
      startedAt: row.inicio.toISOString(),
      endsAt: row.fim.toISOString(),
      autoRenew: row.renovacaoAutomatica,
      cancelledAt: row.canceladaEm?.toISOString() ?? null,
      payments: row.pagamentos.map((payment) => ({
        amountCents: payment.valorCentavos,
        periodStart: payment.periodoInicio.toISOString(),
        periodEnd: payment.periodoFim.toISOString(),
        recordedAt: payment.registradoEm.toISOString(),
      })),
    }));
  }
}
