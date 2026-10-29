import type { Logger } from 'pino';
import type { DatabaseProbe } from './modules/health/application/get-health.js';

/** Tarefa que roda ao iniciar e depois uma vez por dia; devolve quantos registros afetou. */
export interface DailyTask {
  name: string;
  run: () => Promise<number>;
}

/**
 * Tarefa com horário (SPEC-008): roda ao iniciar e depois a cada `everyMinutes` ou todo dia às
 * `dailyAtHour` horas de Brasília. Uma execução nunca começa enquanto a anterior não terminou.
 */
export interface ScheduledTask {
  name: string;
  run: () => Promise<number>;
  everyMinutes?: number;
  dailyAtHour?: number;
}

export interface WorkerOptions {
  logger: Logger;
  probe: DatabaseProbe;
  heartbeatSeconds: number;
  dailyTasks?: DailyTask[];
  scheduledTasks?: ScheduledTask[];
  now?: () => Date;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Brasília está em UTC−3 o ano todo desde 2019 (sem horário de verão). */
const BRASILIA_OFFSET_MS = -3 * 60 * MINUTE_MS;

/** Milissegundos até a próxima vez em que o relógio de Brasília marca `hour`:00. */
export function msUntilBrasiliaHour(now: Date, hour: number): number {
  const local = now.getTime() + BRASILIA_OFFSET_MS;
  const startOfDay = Math.floor(local / DAY_MS) * DAY_MS;
  let next = startOfDay + hour * 60 * MINUTE_MS;
  if (next <= local) next += DAY_MS;
  return next - local;
}

/**
 * Processador de tarefas (DA07): mesmo código do servidor, outro modo de execução.
 * Na SPEC-001 só registrava um heartbeat; a SPEC-039 trouxe a primeira tarefa diária (limpeza de
 * contas não confirmadas) e a SPEC-008, as tarefas de ingestão com horário.
 */
export function startWorker(options: WorkerOptions): { stop: () => void } {
  const now = options.now ?? (() => new Date());
  const intervals: Array<ReturnType<typeof setInterval>> = [];
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const beat = async (): Promise<void> => {
    const database = (await options.probe.isAvailable()) ? 'ok' : 'unavailable';
    options.logger.info({ database }, 'processador ativo');
  };

  /** Roda a tarefa, a não ser que a execução anterior ainda esteja em andamento. */
  const runner = (task: DailyTask | ScheduledTask, message: string) => {
    let running = false;
    return async (): Promise<void> => {
      if (running) {
        options.logger.info({ task: task.name }, 'tarefa ainda em andamento; esta vez foi pulada');
        return;
      }
      running = true;
      try {
        const affected = await task.run();
        options.logger.info({ task: task.name, affected }, message);
      } catch (error) {
        options.logger.error({ task: task.name, err: error }, 'tarefa falhou');
      } finally {
        running = false;
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

  for (const task of options.scheduledTasks ?? []) {
    const run = runner(task, 'tarefa concluída');
    void run();
    if (task.everyMinutes !== undefined) {
      intervals.push(setInterval(() => void run(), task.everyMinutes * MINUTE_MS));
    }
    const { dailyAtHour } = task;
    if (dailyAtHour !== undefined) {
      const schedule = () =>
        later(
          () => {
            void run();
            schedule();
          },
          msUntilBrasiliaHour(now(), dailyAtHour),
        );
      schedule();
    }
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
