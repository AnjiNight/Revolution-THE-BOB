import {
  isPaidPlanCode,
  PLAN_CODES,
  type MySubscription,
  type PaidPlanCode,
  type PlanList,
  type Role,
  type SubscriptionView,
} from '@simulador/shared';
import {
  isActive,
  periodEnd,
  PlanNotFoundError,
  SubscriptionActiveError,
  SubscriptionNotFoundError,
  type StoredPlan,
  type StoredSubscription,
} from '../domain/subscription.js';
import type { SubscriptionRepository } from './ports.js';

export interface SubscriptionServiceDeps {
  subscriptions: SubscriptionRepository;
  clock?: () => Date;
}

/** O resultado de uma passada da renovação. */
export interface RenewalSummary {
  /** Assinaturas renovadas. */
  renewed: number;
  /** Pagamentos simulados gravados (mais de um por assinatura se o processador ficou parado). */
  payments: number;
}

/**
 * SPEC-025: planos e assinatura com pagamento simulado. "Assinante" é calculado pela validade a
 * cada pedido (DA12); o colaborador não tem plano e não é bloqueado (decisão 6).
 */
export class SubscriptionService {
  private readonly clock: () => Date;

  constructor(private readonly deps: SubscriptionServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async plans(): Promise<PlanList> {
    const plans = (await this.deps.subscriptions.plans()).filter((plan) => plan.active);
    plans.sort((a, b) => PLAN_CODES.indexOf(a.code) - PLAN_CODES.indexOf(b.code));
    return {
      plans: plans.map((plan) => ({
        code: plan.code,
        priceCents: plan.priceCents,
        durationDays: plan.durationDays,
      })),
    };
  }

  async mine(userId: string, role: Role): Promise<MySubscription> {
    const now = this.clock();
    const [latest, payments] = await Promise.all([
      this.deps.subscriptions.latest(userId),
      this.deps.subscriptions.payments(userId),
    ]);
    const current = latest && isActive(latest, now) ? latest : null;
    return {
      active: current !== null,
      collaborator: role === 'collaborator',
      subscription: current ? view(current) : null,
      payments: payments.map((payment) => ({
        plan: payment.plan,
        amountCents: payment.amountCents,
        periodStart: payment.periodStart.toISOString(),
        periodEnd: payment.periodEnd.toISOString(),
        recordedAt: payment.recordedAt.toISOString(),
      })),
    };
  }

  /** Tem os recursos do Assinante agora (o colaborador sempre, decisão 6). */
  async hasPremium(userId: string, role: Role): Promise<boolean> {
    if (role === 'collaborator') return true;
    const latest = await this.deps.subscriptions.latest(userId);
    return latest !== null && isActive(latest, this.clock());
  }

  /** Assina com pagamento simulado: grava a assinatura e o pagamento do primeiro período. */
  async subscribe(userId: string, role: Role, planCode: unknown): Promise<MySubscription> {
    const plan = await this.paidPlan(planCode);
    const now = this.clock();
    const created = await this.deps.subscriptions.create(
      {
        userId,
        plan: plan.code as PaidPlanCode,
        startedAt: now,
        endsAt: periodEnd(now, plan.durationDays ?? 0),
        amountCents: plan.priceCents,
      },
      now,
    );
    if (!created) throw new SubscriptionActiveError('a pessoa já tem assinatura ativa');
    return this.mine(userId, role);
  }

  /** Desliga a renovação: o acesso continua até o fim do período já "pago". */
  async cancel(userId: string, role: Role): Promise<MySubscription> {
    const current = await this.current(userId);
    if (current.autoRenew) {
      await this.deps.subscriptions.setAutoRenew(current.id, false, this.clock());
    }
    return this.mine(userId, role);
  }

  /** Liga a renovação de novo, antes do fim. */
  async resume(userId: string, role: Role): Promise<MySubscription> {
    const current = await this.current(userId);
    if (!current.autoRenew) await this.deps.subscriptions.setAutoRenew(current.id, true, null);
    return this.mine(userId, role);
  }

  /**
   * A tarefa diária: cada assinatura vencida com a renovação ligada ganha o pagamento simulado do
   * período seguinte (ou dos períodos, se o processador ficou parado mais de um).
   */
  async renewDue(): Promise<RenewalSummary> {
    const now = this.clock();
    const [due, plans] = await Promise.all([
      this.deps.subscriptions.dueForRenewal(now),
      this.deps.subscriptions.plans(),
    ]);
    const byCode = new Map(plans.map((plan) => [plan.code, plan]));
    let renewed = 0;
    let payments = 0;
    for (const subscription of due) {
      const plan = byCode.get(subscription.plan);
      if (!plan?.durationDays) continue;
      let from = subscription.endsAt;
      let advanced = false;
      while (from.getTime() <= now.getTime()) {
        const to = periodEnd(from, plan.durationDays);
        const ok = await this.deps.subscriptions.renew({
          subscriptionId: subscription.id,
          plan: subscription.plan,
          from,
          to,
          amountCents: plan.priceCents,
        });
        if (!ok) break;
        payments += 1;
        advanced = true;
        from = to;
      }
      if (advanced) renewed += 1;
    }
    return { renewed, payments };
  }

  /** As que terminaram sem renovação desde `since`. */
  endedSince(since: Date): Promise<number> {
    return this.deps.subscriptions.countEndedBetween(since, this.clock());
  }

  private async current(userId: string): Promise<StoredSubscription> {
    const latest = await this.deps.subscriptions.latest(userId);
    if (!latest || !isActive(latest, this.clock())) {
      throw new SubscriptionNotFoundError('sem assinatura ativa');
    }
    return latest;
  }

  private async paidPlan(code: unknown): Promise<StoredPlan> {
    if (!isPaidPlanCode(code)) throw new PlanNotFoundError('plano inválido');
    const plan = (await this.deps.subscriptions.plans()).find(
      (candidate) => candidate.code === code && candidate.active,
    );
    if (!plan?.durationDays) throw new PlanNotFoundError('plano inativo');
    return plan;
  }
}

function view(subscription: StoredSubscription): SubscriptionView {
  return {
    plan: subscription.plan,
    startedAt: subscription.startedAt.toISOString(),
    endsAt: subscription.endsAt.toISOString(),
    autoRenew: subscription.autoRenew,
    cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
  };
}
