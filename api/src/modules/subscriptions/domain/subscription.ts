import type { PaidPlanCode, PlanCode } from '@simulador/shared';
import { DomainError } from '../../../shared/domain/domain-error.js';

const DAY_MS = 24 * 60 * 60_000;

export interface StoredPlan {
  code: PlanCode;
  priceCents: number;
  durationDays: number | null;
  active: boolean;
}

export interface StoredPayment {
  plan: PaidPlanCode;
  amountCents: number;
  periodStart: Date;
  periodEnd: Date;
  recordedAt: Date;
}

export interface StoredSubscription {
  id: string;
  userId: string;
  plan: PaidPlanCode;
  startedAt: Date;
  endsAt: Date;
  autoRenew: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
}

/**
 * A assinatura dá os recursos do Assinante (SPEC-025 §4.2): do início até o fim do período; com a
 * renovação ligada, também depois do fim, até a tarefa diária gravar o pagamento do período
 * seguinte (assim ninguém perde o acesso nas horas entre o vencimento e a tarefa).
 */
export function isActive(subscription: StoredSubscription, now: Date): boolean {
  if (subscription.startedAt.getTime() > now.getTime()) return false;
  return subscription.autoRenew || now.getTime() < subscription.endsAt.getTime();
}

/** O fim de um período de `durationDays` dias a partir de `start`. */
export function periodEnd(start: Date, durationDays: number): Date {
  return new Date(start.getTime() + durationDays * DAY_MS);
}

/** O plano pedido não existe ou não se assina (o Gratuito). */
export class PlanNotFoundError extends DomainError {
  readonly code = 'plan_not_found';
}

/** A pessoa já tem uma assinatura que vale agora. */
export class SubscriptionActiveError extends DomainError {
  readonly code = 'subscription_active';
}

/** Não há assinatura que valha agora para cancelar ou reativar. */
export class SubscriptionNotFoundError extends DomainError {
  readonly code = 'subscription_not_found';
}
