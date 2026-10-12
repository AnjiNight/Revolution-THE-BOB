import type { Logger } from 'pino';
import type { DatabaseProbe } from './modules/health/application/get-health.js';

/** Tarefa que roda ao iniciar e depois uma vez por dia; devolve quantos registros afetou. */
export interface DailyTask {
  name: string;
  run: () => Promise<number>;
}

export interface WorkerOptions {
  logger: Logger;
  probe: DatabaseProbe;
  heartbeatSeconds: number;
  dailyTasks?: DailyTask[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Processador de tarefas (DA07): mesmo código do servidor, outro modo de execução.
 * Na SPEC-001 só registrava um heartbeat; a SPEC-039 trouxe a primeira tarefa diária (limpeza de
 * contas não confirmadas). As tarefas de ingestão começam na SPEC-008.
 */
export function startWorker(options: WorkerOptions): { stop: () => void } {
  const beat = async (): Promise<void> => {
    const database = (await options.probe.isAvailable()) ? 'ok' : 'unavailable';
    options.logger.info({ database }, 'processador ativo');
  };

  const runDaily = async (task: DailyTask): Promise<void> => {
    try {
      const affected = await task.run();
      options.logger.info({ task: task.name, affected }, 'tarefa diária concluída');
    } catch (error) {
      options.logger.error({ task: task.name, err: error }, 'tarefa diária falhou');
    }
  };

  options.logger.info({ heartbeatSeconds: options.heartbeatSeconds }, 'processador iniciado');
  void beat();
  const timers = [setInterval(() => void beat(), options.heartbeatSeconds * 1000)];
  for (const task of options.dailyTasks ?? []) {
    void runDaily(task);
    timers.push(setInterval(() => void runDaily(task), DAY_MS));
  }

  return {
    stop: () => {
      for (const timer of timers) clearInterval(timer);
      options.logger.info('processador encerrado');
    },
  };
}
