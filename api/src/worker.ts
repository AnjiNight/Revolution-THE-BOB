import type { Logger } from 'pino';
import type { DatabaseProbe } from './modules/health/application/get-health.js';

/** Tarefa que roda ao iniciar e depois uma vez por dia; devolve quantos registros afetou. */
export interface DailyTask {
  name: string;
  run: () => Promise<number>;
}

/**
 * Tarefa com horário (SPEC-008): roda ao iniciar e depois a cada `everyMinutes` ou todo dia nos
 * horários de Brasília. Uma execução nunca começa enquanto a anterior da mesma tarefa não terminou.
 */
export interface ScheduledTask {
  name: string;
  run: () => Promise<number>;
  /** SPEC-011: a tarefa de ingestão desta entrada; os pedidos de execução chegam por ela. */
  key?: string;
  /** SPEC-011: o que "Executar agora" faz (padrão: o mesmo que `run`). */
  runNow?: () => Promise<number>;
  everyMinutes?: number;
  dailyAtHour?: number;
  /** SPEC-040: a importação do catálogo roda às 08:30. Padrão: na hora cheia. */
  dailyAtMinute?: number;
  /** SPEC-011: vários horários por dia (o CDI às 09:00 e às 18:00), no lugar de `dailyAtHour`. */
  dailyAt?: Array<{ hour: number; minute?: number }>;
}

/** SPEC-011: os pedidos de execução do colaborador, gravados pelo servidor. */
export interface RunRequests {
  pending(): Promise<Array<{ id: string; task: string }>>;
  /** Marca o pedido como atendido, com a execução da tarefa iniciada desde `since`, se houver. */
  attend(id: string, task: string, since: Date, at: Date): Promise<void>;
}

export interface WorkerOptions {
  logger: Logger;
  probe: DatabaseProbe;
  heartbeatSeconds: number;
  dailyTasks?: DailyTask[];
  scheduledTasks?: ScheduledTask[];
  /** SPEC-011: grava o sinal de vida a cada batida, para a tela Tarefas saber se ele está ligado. */
  heartbeat?: (at: Date, intervalSeconds: number) => Promise<void>;
  /** SPEC-011: os pedidos de "Executar agora", conferidos a cada `requestPollSeconds`. */
  requests?: RunRequests;
  requestPollSeconds?: number;
  now?: () => Date;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Brasília está em UTC−3 o ano todo desde 2019 (sem horário de verão). */
const BRASILIA_OFFSET_MS = -3 * 60 * MINUTE_MS;
/** SPEC-011: o processador confere os pedidos de execução a cada 15 segundos. */
export const REQUEST_POLL_SECONDS = 15;

/** Milissegundos até a próxima vez em que o relógio de Brasília marca `hour`:`minute`. */
export function msUntilBrasiliaHour(now: Date, hour: number, minute = 0): number {
  const local = now.getTime() + BRASILIA_OFFSET_MS;
  const startOfDay = Math.floor(local / DAY_MS) * DAY_MS;
  let next = startOfDay + (hour * 60 + minute) * MINUTE_MS;
  if (next <= local) next += DAY_MS;
  return next - local;
}

/**
 * Processador de tarefas (DA07): mesmo código do servidor, outro modo de execução.
 * Na SPEC-001 só registrava um heartbeat; a SPEC-039 trouxe a primeira tarefa diária (limpeza de
 * contas não confirmadas), a SPEC-008, as tarefas de ingestão com horário, e a SPEC-011, os pedidos
 * de execução do colaborador e o sinal de vida gravado no banco.
 */
export function startWorker(options: WorkerOptions): { stop: () => void } {
  const now = options.now ?? (() => new Date());
  const intervals: Array<ReturnType<typeof setInterval>> = [];
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  /** As tarefas rodando agora, pela chave: o horário e o pedido nunca rodam a mesma junto. */
  const busy = new Set<string>();
  let stopped = false;

  const beat = async (): Promise<void> => {
    const database = (await options.probe.isAvailable()) ? 'ok' : 'unavailable';
    options.logger.info({ database }, 'processador ativo');
    if (!options.heartbeat) return;
    try {
      await options.heartbeat(now(), options.heartbeatSeconds);
    } catch (error) {
      options.logger.warn({ err: error }, 'sinal de vida não gravado');
    }
  };

  const keyOf = (task: DailyTask | ScheduledTask): string =>
    ('key' in task && task.key) || task.name;

  /** Roda a tarefa, a não ser que ela já esteja em andamento (pelo horário ou por um pedido). */
  const runner = (task: DailyTask | ScheduledTask, message: string) => {
    const key = keyOf(task);
    return async (): Promise<void> => {
      if (busy.has(key)) {
        options.logger.info({ task: task.name }, 'tarefa ainda em andamento; esta vez foi pulada');
        return;
      }
      busy.add(key);
      try {
        const affected = await task.run();
        options.logger.info({ task: task.name, affected }, message);
      } catch (error) {
        options.logger.error({ task: task.name, err: error }, 'tarefa falhou');
      } finally {
        busy.delete(key);
      }
    };
  };

  const later = (fn: () => void, ms: number) => {
    const timeout = setTimeout(() => {
      timeouts.delete(timeout);
      if (!stopped) fn();
    }, ms);
    timeouts.add(timeout);
  };

  options.logger.info({ heartbeatSeconds: options.heartbeatSeconds }, 'processador iniciado');
  void beat();
  intervals.push(setInterval(() => void beat(), options.heartbeatSeconds * 1000));

  for (const task of options.dailyTasks ?? []) {
    const run = runner(task, 'tarefa diária concluída');
    void run();
    intervals.push(setInterval(() => void run(), DAY_MS));
  }

  const byKey = new Map<string, ScheduledTask>();
  for (const task of options.scheduledTasks ?? []) {
    if (task.key) byKey.set(task.key, task);
    const run = runner(task, 'tarefa concluída');
    void run();
    if (task.everyMinutes !== undefined) {
      intervals.push(setInterval(() => void run(), task.everyMinutes * MINUTE_MS));
    }
    const times =
      task.dailyAt ??
      (task.dailyAtHour !== undefined
        ? [{ hour: task.dailyAtHour, minute: task.dailyAtMinute ?? 0 }]
        : []);
    for (const { hour, minute = 0 } of times) {
      const schedule = () =>
        later(
          () => {
            void run();
            schedule();
          },
          msUntilBrasiliaHour(now(), hour, minute),
        );
      schedule();
    }
  }

  // SPEC-011: "Executar agora". Cada pedido roda quando a tarefa dele está parada; com ela em
  // andamento, espera a próxima conferência. O pedido só fica atendido depois de gravado.
  const requests = options.requests;
  if (requests) {
    const serve = async (request: { id: string; task: string }): Promise<void> => {
      const task = byKey.get(request.task);
      const since = now();
      try {
        if (task) {
          const affected = await (task.runNow ?? task.run)();
          options.logger.info(
            { task: task.name, affected, request: request.id },
            'pedido de execução atendido',
          );
        }
      } catch (error) {
        options.logger.error({ task: request.task, err: error }, 'tarefa pedida falhou');
      } finally {
        try {
          await requests.attend(request.id, request.task, since, now());
        } catch (error) {
          options.logger.error({ request: request.id, err: error }, 'pedido não marcado');
        }
        busy.delete(request.task);
      }
    };

    let polling = false;
    const poll = async (): Promise<void> => {
      if (polling || stopped) return;
      polling = true;
      try {
        for (const request of await requests.pending()) {
          if (busy.has(request.task)) continue;
          busy.add(request.task);
          void serve(request);
        }
      } catch (error) {
        options.logger.error({ err: error }, 'pedidos de execução não lidos');
      } finally {
        polling = false;
      }
    };
    intervals.push(
      setInterval(() => void poll(), (options.requestPollSeconds ?? REQUEST_POLL_SECONDS) * 1000),
    );
  }

  return {
    stop: () => {
      stopped = true;
      for (const interval of intervals) clearInterval(interval);
      for (const timeout of timeouts) clearTimeout(timeout);
      options.logger.info('processador encerrado');
    },
  };
}
