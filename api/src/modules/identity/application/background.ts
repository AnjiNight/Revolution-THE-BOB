import type { BackgroundRunner, TaskLog } from './ports.js';

/**
 * Roda uma tarefa (ex.: enviar e-mail) depois da resposta. Uma falha não derruba nada: vai para o
 * log só com o tipo do erro, porque a mensagem de um servidor SMTP pode citar o destinatário (DA13).
 */
export function runLogged(
  runner: BackgroundRunner,
  log: TaskLog,
  failure: string,
  task: () => Promise<void>,
): void {
  runner(async () => {
    try {
      await task();
    } catch (error) {
      log.error({ errorType: errorType(error) }, failure);
    }
  });
}

function errorType(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.name : 'unknown';
}
