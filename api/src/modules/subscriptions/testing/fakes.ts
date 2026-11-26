import type { PersonalDataExport } from '@simulador/shared';
import type { NewSubscription, Renewal, SubscriptionRepository } from '../application/ports.js';
import {
  isActive,
  type StoredPayment,
  type StoredPlan,
  type StoredSubscription,
} from '../domain/subscription.js';

/** Os planos que a migração grava (SPEC-025, decisão 1). */
export const DEFAULT_PLANS: StoredPlan[] = [
  { code: 'gratuito', priceCents: 0, durationDays: null, active: true },
  { code: 'assinante_mensal', priceCents: 1990, durationDays: 30, active: true },
  { code: 'assinante_anual', priceCents: 19900, durationDays: 365, active: true },
];

interface PaymentRow extends StoredPayment {
  subscriptionId: string;
}

export class InMemorySubscriptions implements SubscriptionRepository {
  readonly planRows: StoredPlan[] = DEFAULT_PLANS.map((plan) => ({ ...plan }));
  readonly rows: StoredSubscription[] = [];
  readonly paymentRows: PaymentRow[] = [];
  private nextId = 1;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  plans(): Promise<StoredPlan[]> {
    return Promise.resolve(this.planRows.map((plan) => ({ ...plan })));
  }

  latest(userId: string): Promise<StoredSubscription | null> {
    const mine = this.rows
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    return Promise.resolve(mine[0] ? { ...mine[0] } : null);
  }

  create(input: NewSubscription, now: Date): Promise<StoredSubscription | null> {
    if (this.rows.some((row) => row.userId === input.userId && isActive(row, now))) {
      return Promise.resolve(null);
    }
    const row: StoredSubscription = {
      id: `assinatura-${this.nextId++}`,
      userId: input.userId,
      plan: input.plan,
      startedAt: input.startedAt,
      endsAt: input.endsAt,
      autoRenew: true,
      cancelledAt: null,
      createdAt: this.clock(),
    };
    this.rows.push(row);
    this.paymentRows.push({
      subscriptionId: row.id,
      plan: input.plan,
      amountCents: input.amountCents,
      periodStart: input.startedAt,
      periodEnd: input.endsAt,
      recordedAt: this.clock(),
    });
    return Promise.resolve({ ...row });
  }

  setAutoRenew(id: string, autoRenew: boolean, cancelledAt: Date | null): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) {
      row.autoRenew = autoRenew;
      row.cancelledAt = cancelledAt;
    }
    return Promise.resolve();
  }

  payments(userId: string): Promise<StoredPayment[]> {
    const ids = new Set(this.rows.filter((row) => row.userId === userId).map((row) => row.id));
    return Promise.resolve(
      this.paymentRows
        .filter((payment) => ids.has(payment.subscriptionId))
        .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
        .map(({ subscriptionId: _id, ...payment }) => payment),
    );
  }

  dueForRenewal(now: Date): Promise<StoredSubscription[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.autoRenew && row.endsAt.getTime() <= now.getTime())
        .map((row) => ({ ...row })),
    );
  }

  renew(renewal: Renewal): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === renewal.subscriptionId);
    if (!row?.autoRenew || row.endsAt.getTime() !== renewal.from.getTime()) {
      return Promise.resolve(false);
    }
    row.endsAt = renewal.to;
    this.paymentRows.push({
      subscriptionId: row.id,
      plan: renewal.plan,
      amountCents: renewal.amountCents,
      periodStart: renewal.from,
      periodEnd: renewal.to,
      recordedAt: this.clock(),
    });
    return Promise.resolve(true);
  }

  countEndedBetween(from: Date, to: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (row) =>
          !row.autoRenew &&
          row.endsAt.getTime() > from.getTime() &&
          row.endsAt.getTime() <= to.getTime(),
      ).length,
    );
  }

  exportForUser(userId: string): Promise<PersonalDataExport['subscriptions']> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((row) => ({
          plan: row.plan,
          startedAt: row.startedAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          autoRenew: row.autoRenew,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          payments: this.paymentRows
            .filter((payment) => payment.subscriptionId === row.id)
            .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
            .map((payment) => ({
              amountCents: payment.amountCents,
              periodStart: payment.periodStart.toISOString(),
              periodEnd: payment.periodEnd.toISOString(),
              recordedAt: payment.recordedAt.toISOString(),
            })),
        })),
    );
  }

  /** Remove tudo da pessoa (a exclusão da conta, que no banco é em cascata). */
  deleteUser(userId: string): void {
    const ids = new Set(this.rows.filter((row) => row.userId === userId).map((row) => row.id));
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (ids.has(this.rows[i]!.id)) this.rows.splice(i, 1);
    }
    for (let i = this.paymentRows.length - 1; i >= 0; i -= 1) {
      if (ids.has(this.paymentRows[i]!.subscriptionId)) this.paymentRows.splice(i, 1);
    }
  }
}
