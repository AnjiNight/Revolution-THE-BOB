/**
 * SPEC-025: planos e assinatura com pagamento simulado. Nenhum dado de pagamento é pedido nem
 * guardado; "assinante" é calculado pela validade da assinatura e conferido no servidor (DA12).
 */

/** Os planos, na ordem da tela Plano. */
export const PLAN_CODES = ['gratuito', 'assinante_mensal', 'assinante_anual'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
/** Os planos que se assinam (o Gratuito é a ausência de assinatura). */
export type PaidPlanCode = Exclude<PlanCode, 'gratuito'>;

export function isPaidPlanCode(value: unknown): value is PaidPlanCode {
  return value === 'assinante_mensal' || value === 'assinante_anual';
}

export interface Plan {
  code: PlanCode;
  /** Preço em centavos de real (1990 = R$ 19,90). */
  priceCents: number;
  /** Duração do período em dias; `null` no Gratuito. */
  durationDays: number | null;
}

/** `GET /api/plans`. */
export interface PlanList {
  plans: Plan[];
}

/** Um pagamento simulado: aprovado na hora, sem cobrança. */
export interface SimulatedPayment {
  plan: PaidPlanCode;
  amountCents: number;
  /** ISO 8601. */
  periodStart: string;
  periodEnd: string;
  recordedAt: string;
}

export interface SubscriptionView {
  plan: PaidPlanCode;
  /** ISO 8601. */
  startedAt: string;
  /** Fim do período já "pago" (ISO 8601). */
  endsAt: string;
  /** Renova sozinha no fim; `false` depois de cancelar. */
  autoRenew: boolean;
  cancelledAt: string | null;
}

/** `GET /api/subscription`: a minha assinatura. */
export interface MySubscription {
  /** Tem os recursos do Assinante agora. O colaborador não tem plano: `false`, com `collaborator`. */
  active: boolean;
  /** O colaborador não assina; na Visão do usuário, os recursos premium ficam liberados. */
  collaborator: boolean;
  /** A assinatura que vale agora; `null` no Gratuito. */
  subscription: SubscriptionView | null;
  /** Os pagamentos simulados, do mais recente para o mais antigo. */
  payments: SimulatedPayment[];
}

/** `POST /api/subscription`. */
export interface SubscribeRequest {
  plan: PaidPlanCode;
}

export const SUBSCRIPTION_PATHS = {
  plans: '/api/plans',
  mine: '/api/subscription',
  cancel: '/api/subscription/cancel',
  resume: '/api/subscription/resume',
} as const;

/** Erros das rotas de assinatura e dos recursos premium. */
export type SubscriptionErrorCode =
  'premium_required' | 'plan_not_found' | 'subscription_active' | 'subscription_not_found';

/** O código de erro das rotas premium sem assinatura ativa (403). */
export const PREMIUM_REQUIRED = 'premium_required';

/** Os recursos do plano Assinante nesta Spec (os da SPEC-026 e da SPEC-031 entram depois). */
export const PREMIUM_FEATURES = ['portfolio_comparison', 'portfolio_report'] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

/** O Início avisa quantos dias antes do fim de uma assinatura cancelada. */
export const SUBSCRIPTION_ENDING_WARNING_DAYS = 3;

/** Pode usar os recursos do Assinante: o colaborador (sem plano) ou a assinatura ativa. */
export function hasPremium(subscription: Pick<MySubscription, 'active' | 'collaborator'>): boolean {
  return subscription.active || subscription.collaborator;
}
