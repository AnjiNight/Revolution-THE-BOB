import { isoDateInBrasilia } from '@simulador/shared';
import type {
  RunResult,
  TaskRunReader,
  TaskRunRepository,
} from '../../market-data/application/ports.js';
import type { SubscriptionService } from './subscription-service.js';

const TASK = 'renovacao_assinaturas' as const;
const DAY_MS = 24 * 60 * 60_000;

export interface SubscriptionRenewalDeps {
  subscriptions: Pick<SubscriptionService, 'renewDue' | 'endedSince'>;
  runs: TaskRunRepository & TaskRunReader;
  clock?: () => Date;
}

/**
 * SPEC-025: a tarefa "Renovar assinaturas" (todo dia às 00:15 e no "Executar agora"), registrada
 * como as tarefas de ingestão (SPEC-011): renovadas e as que terminaram sem renovação desde a
 * execução anterior.
 */
export class SubscriptionRenewal {
  private readonly clock: () => Date;

  constructor(private readonly deps: SubscriptionRenewalDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async run(): Promise<RunResult> {
    const startedAt = this.clock();
    const last = await this.deps.runs.lastRun(TASK);
    const runId = await this.deps.runs.start(TASK, startedAt);
    const today = isoDateInBrasilia(startedAt);
    try {
      const { renewed, payments } = await this.deps.subscriptions.renewDue();
      const ended = await this.deps.subscriptions.endedSince(
        last?.startedAt ?? new Date(startedAt.getTime() - DAY_MS),
      );
      const result: RunResult = {
        status: 'sucesso',
        records: payments,
        affectedAssets: 0,
        periodStart: today,
        periodEnd: today,
        errors: [],
        totals: { renovadas: renewed, pagamentos: payments, expiradas: ended },
      };
      await this.deps.runs.finish(runId, result, this.clock());
      return result;
    } catch (error) {
      const result: RunResult = {
        status: 'falha',
        records: 0,
        affectedAssets: 0,
        periodStart: null,
        periodEnd: null,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
            assetId: null,
            date: today,
          },
        ],
      };
      await this.deps.runs.finish(runId, result, this.clock());
      return result;
    }
  }
}
