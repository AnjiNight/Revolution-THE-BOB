import type { ReconnectResult } from '../shared/auth-ipc.js';
import type { ServerStatus } from '../shared/server-status.js';

/** SPEC-032: de quanto em quanto tempo o app confere o servidor em modo consulta. */
export const RECONNECT_INTERVAL_MS = 30_000;

export interface ConnectionMonitorDeps {
  /** `GET /api/health`, sem sessão. */
  check: () => Promise<ServerStatus>;
  /** Renova a sessão e sai do modo consulta (ou apaga tudo, se a sessão foi recusada). */
  reconnect: () => Promise<ReconnectResult>;
  intervalMs?: number;
  setInterval?: (task: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/**
 * SPEC-032 §4.2 ("Volta da conexão"): em modo consulta, confere o servidor a cada 30 s e no
 * "Tentar agora". Quando ele responde, o cliente renova a sessão; uma conferência por vez.
 */
export class ConnectionMonitor {
  private timer: unknown = null;
  private checking: Promise<ReconnectResult> | null = null;

  constructor(private readonly deps: ConnectionMonitorDeps) {}

  /** Liga a conferência periódica ao entrar em modo consulta e desliga ao sair. */
  setOffline(offline: boolean): void {
    if (offline && this.timer === null) {
      const every = this.deps.setInterval ?? ((task, ms) => setInterval(task, ms));
      this.timer = every(() => void this.checkNow(), this.deps.intervalMs ?? RECONNECT_INTERVAL_MS);
    } else if (!offline && this.timer !== null) {
      const stop = this.deps.clearInterval ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
      stop(this.timer);
      this.timer = null;
    }
  }

  checkNow(): Promise<ReconnectResult> {
    this.checking ??= this.run().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  private async run(): Promise<ReconnectResult> {
    const status = await this.deps.check();
    // "degraded" é o servidor sem o banco: a sessão ainda não teria como ser renovada.
    if (status.kind !== 'connected') return 'offline';
    return this.deps.reconnect();
  }
}
