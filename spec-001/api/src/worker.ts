import type { Logger } from 'pino';
import type { DatabaseProbe } from './modules/health/application/get-health.js';

export interface WorkerOptions {
  logger: Logger;
  probe: DatabaseProbe;
  heartbeatSeconds: number;
}

/**
 * Processador de tarefas (DA07): mesmo código do servidor, outro modo de execução.
 * Na SPEC-001 só registra um heartbeat; as tarefas reais começam na SPEC-008.
 */
export function startWorker(options: WorkerOptions): { stop: () => void } {
  const beat = async (): Promise<void> => {
    const database = (await options.probe.isAvailable()) ? 'ok' : 'unavailable';
    options.logger.info({ database }, 'processador ativo');
  };

  options.logger.info({ heartbeatSeconds: options.heartbeatSeconds }, 'processador iniciado');
  void beat();
  const timer = setInterval(() => void beat(), options.heartbeatSeconds * 1000);

  return {
    stop: () => {
      clearInterval(timer);
      options.logger.info('processador encerrado');
    },
  };
}
