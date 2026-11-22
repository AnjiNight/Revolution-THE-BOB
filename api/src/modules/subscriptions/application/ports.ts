import type { PaidPlanCode, PersonalDataExport } from '@simulador/shared';
import type { StoredPayment, StoredPlan, StoredSubscription } from '../domain/subscription.js';

export interface NewSubscription {
  userId: string;
  plan: PaidPlanCode;
  startedAt: Date;
  endsAt: Date;
  amountCents: number;
}

export interface Renewal {
  subscriptionId: string;
  plan: PaidPlanCode;
  /** O fim atual (a renovação só grava se ele não mudou no meio). */
  from: Date;
  to: Date;
  amountCents: number;
}

/** SPEC-025: planos, assinaturas e pagamentos simulados. */
export interface SubscriptionRepository {
  plans(): Promise<StoredPlan[]>;
  /** A assinatura mais recente da pessoa (a de fim mais tarde), ou `null`. */
  latest(userId: string): Promise<StoredSubscription | null>;
  /**
   * Grava a assinatura e o primeiro pagamento simulado, juntos. Devolve `null` (sem gravar nada)
   * se a pessoa já tem uma assinatura que vale em `now` (a mesma regra de `isActive`), conferido
   * dentro da mesma transação para dois pedidos ao mesmo tempo não criarem duas.
   */
  create(input: NewSubscription, now: Date): Promise<StoredSubscription | null>;
  /** Liga ou desliga a renovação; ao desligar, `cancelledAt` é o momento do cancelamento. */
  setAutoRenew(id: string, autoRenew: boolean, cancelledAt: Date | null): Promise<void>;
  /** Os pagamentos simulados da pessoa, do mais recente para o mais antigo. */
  payments(userId: string): Promise<StoredPayment[]>;
  /** As assinaturas com a renovação ligada e o fim já passado. */
  dueForRenewal(now: Date): Promise<StoredSubscription[]>;
  /** Estende o fim de `from` para `to` com o pagamento do período; `false` se o fim já mudou. */
  renew(renewal: Renewal): Promise<boolean>;
  /** As que terminaram sem renovação no intervalo (`from`, `to`]. */
  countEndedBetween(from: Date, to: Date): Promise<number>;
  /** SPEC-034: as assinaturas e os pagamentos, para "Baixar meus dados". */
  exportForUser(userId: string): Promise<PersonalDataExport['subscriptions']>;
}
