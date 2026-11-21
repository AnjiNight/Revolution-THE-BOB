import {
  INGESTION_TASKS,
  isIngestionTask,
  TASK_ERRORS_PAGE,
  TASK_RUNS_PAGE,
  type IngestionTaskCode,
  type TaskErrorPage,
  type TaskList,
  type TaskOverview,
  type TaskRequestResult,
  type TaskRunDetail,
  type TaskRunPage,
  type TaskRunStatus,
  type TaskRunSummary,
} from '@simulador/shared';
import { INGESTION_SCHEDULE } from '../domain/task-schedule.js';
import {
  RunAlreadyRequestedError,
  RunInProgressError,
  RunNotFoundError,
  TaskNotFoundError,
  TaskSourceDisabledError,
} from '../domain/task-errors.js';
import type { StoredRunDetail, StoredRunSummary, TaskMonitorRepository } from './ports.js';

/** Sem sinal de vida há mais de 3 minutos (ou 3 batidas, se o intervalo for maior): parado. */
export const PROCESSOR_STOPPED_AFTER_MS = 3 * 60 * 1000;

/**
 * Quanto tempo as execuções, os erros e os pedidos atendidos ficam guardados (OPEN-40, §4.1
 * decisão 5). A última execução de cada tarefa fica sempre.
 */
export const RUN_RETENTION_DAYS = 90;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TaskMonitorServiceDeps {
  monitor: TaskMonitorRepository;
  /** O interruptor da autorização do Investidor10 (SPEC-041 §4.1). */
  investidor10Enabled: boolean;
  clock?: () => Date;
}

/**
 * Monitoramento e reexecução das tarefas de ingestão (SPEC-011): a tela Tarefas do colaborador.
 * O servidor só lê o registro e grava o pedido; quem roda a tarefa é o processador (DA07).
 */
export class TaskMonitorService {
  private readonly clock: () => Date;

  constructor(private readonly deps: TaskMonitorServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** As 9 tarefas, primeiro as com falha ou parcial (na ordem do dia), e o processador. */
  async overview(): Promise<TaskList> {
    const [latest, pending, processor] = await Promise.all([
      this.deps.monitor.latestRuns(),
      this.deps.monitor.pendingRequests(),
      this.deps.monitor.processor(),
    ]);
    const tasks: TaskOverview[] = INGESTION_TASKS.map((task) => {
      const { finished = null, runningSince = null } = latest.get(task) ?? {};
      const pendingAt = pending.get(task) ?? null;
      return {
        task,
        sources: INGESTION_SCHEDULE[task].sources,
        schedule: INGESTION_SCHEDULE[task].schedule,
        lastRun: finished ? toSummary(finished) : null,
        runningSince: runningSince?.toISOString() ?? null,
        pendingRequestAt: pendingAt?.toISOString() ?? null,
        blockedReason: this.disabled(task)
          ? 'source_disabled'
          : runningSince
            ? 'running'
            : pendingAt
              ? 'requested'
              : null,
      };
    });
    const attention = (item: TaskOverview) =>
      item.lastRun?.status === 'falha' || item.lastRun?.status === 'parcial';
    const now = this.clock().getTime();
    return {
      tasks: [...tasks.filter(attention), ...tasks.filter((item) => !attention(item))],
      processor: {
        lastSeenAt: processor?.seenAt.toISOString() ?? null,
        stopped:
          !processor ||
          now - processor.seenAt.getTime() >
            Math.max(PROCESSOR_STOPPED_AFTER_MS, 3 * processor.intervalSeconds * 1000),
      },
    };
  }

  /** O histórico da tarefa, 50 execuções por vez. */
  async runs(task: string, offset: unknown): Promise<TaskRunPage> {
    const code = this.taskOf(task);
    const start = offsetOf(offset);
    const page = await this.deps.monitor.runs(code, start, TASK_RUNS_PAGE);
    return {
      runs: page.runs.map(toDetail),
      total: page.total,
      hasMore: start + page.runs.length < page.total,
    };
  }

  /** Os erros de uma execução, 100 por vez. */
  async errors(runId: string, offset: unknown): Promise<TaskErrorPage> {
    if (!UUID_PATTERN.test(runId)) throw new RunNotFoundError('execução não encontrada');
    const start = offsetOf(offset);
    const page = await this.deps.monitor.errors(runId, start, TASK_ERRORS_PAGE);
    if (!page) throw new RunNotFoundError('execução não encontrada');
    return {
      errors: page.errors,
      total: page.total,
      hasMore: start + page.errors.length < page.total,
    };
  }

  /**
   * "Executar agora" (SPEC-011 §4.1, decisão 2): grava o pedido, que o processador atende. Um
   * pendente por tarefa; recusado com a tarefa rodando ou com a coleta desligada.
   */
  async request(task: string, collaboratorId: string): Promise<TaskRequestResult> {
    const code = this.taskOf(task);
    if (this.disabled(code)) throw new TaskSourceDisabledError('coleta desligada');
    const latest = await this.deps.monitor.latestRuns();
    if (latest.get(code)?.runningSince) throw new RunInProgressError('tarefa em andamento');
    const at = this.clock();
    const created = await this.deps.monitor.request(code, collaboratorId, at);
    if (!created) throw new RunAlreadyRequestedError('pedido pendente');
    return { requestedAt: at.toISOString() };
  }

  private taskOf(task: string): IngestionTaskCode {
    if (!isIngestionTask(task)) throw new TaskNotFoundError('tarefa não encontrada');
    return task;
  }

  /** Sem a autorização, nada que venha do Investidor10 roda: indicadores e notícias (SPEC-027). */
  private disabled(task: IngestionTaskCode): boolean {
    return (
      !this.deps.investidor10Enabled && INGESTION_SCHEDULE[task].sources.includes('investidor10')
    );
  }
}

function offsetOf(value: unknown): number {
  const number = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(number) ? number : 0;
}

function toSummary(run: StoredRunSummary): TaskRunSummary {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: (run.finishedAt ?? run.startedAt).toISOString(),
    status: (run.status ?? 'falha') as TaskRunStatus,
    records: run.records,
    affectedAssets: run.affectedAssets,
    errorCount: run.errorCount,
  };
}

function toDetail(run: StoredRunDetail): TaskRunDetail {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    status: run.status,
    records: run.records,
    affectedAssets: run.affectedAssets,
    errorCount: run.errorCount,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    requests: run.requests,
    quota: run.quota
      ? {
          remaining: run.quota.remaining,
          limit: run.quota.limit,
          resetsAt: run.quota.resetsAt.toISOString(),
        }
      : null,
    totals: run.totals,
    request: run.request,
  };
}
