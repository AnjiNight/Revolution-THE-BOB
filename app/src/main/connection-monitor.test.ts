import { describe, expect, it } from 'vitest';
import type { ReconnectResult } from '../shared/auth-ipc.js';
import type { ServerStatus } from '../shared/server-status.js';
import { ConnectionMonitor, RECONNECT_INTERVAL_MS } from './connection-monitor.js';

function setup(status: ServerStatus, result: ReconnectResult = 'online') {
  const timers: Array<{ task: () => void; ms: number; stopped: boolean }> = [];
  let checks = 0;
  let reconnects = 0;
  const monitor = new ConnectionMonitor({
    check: () => {
      checks += 1;
      return Promise.resolve(status);
    },
    reconnect: () => {
      reconnects += 1;
      return Promise.resolve(result);
    },
    setInterval: (task, ms) => {
      const timer = { task, ms, stopped: false };
      timers.push(timer);
      return timer;
    },
    clearInterval: (handle) => {
      (handle as { stopped: boolean }).stopped = true;
    },
  });
  return { monitor, timers, counts: () => ({ checks, reconnects }) };
}

describe('volta da conexão (SPEC-032)', () => {
  it('em modo consulta confere a cada 30 s; ao sair, para (CA07)', async () => {
    const { monitor, timers, counts } = setup({ kind: 'unavailable' });
    monitor.setOffline(true);
    monitor.setOffline(true); // uma conferência periódica só
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(RECONNECT_INTERVAL_MS);
    timers[0]?.task();
    await Promise.resolve();
    expect(counts().checks).toBe(1);
    monitor.setOffline(false);
    expect(timers[0]?.stopped).toBe(true);
  });

  it('servidor respondendo: reconecta; fora do ar ou sem banco: continua em modo consulta', async () => {
    await expect(setup({ kind: 'connected', version: '1' }).monitor.checkNow()).resolves.toBe(
      'online',
    );
    const down = setup({ kind: 'unavailable' });
    await expect(down.monitor.checkNow()).resolves.toBe('offline');
    expect(down.counts().reconnects).toBe(0);
    const degraded = setup({ kind: 'degraded', version: '1' });
    await expect(degraded.monitor.checkNow()).resolves.toBe('offline');
    expect(degraded.counts().reconnects).toBe(0);
    const expired = setup({ kind: 'connected', version: '1' }, 'signed-out');
    await expect(expired.monitor.checkNow()).resolves.toBe('signed-out');
  });

  it('"Tentar agora" junto com a conferência periódica faz uma conferência só', async () => {
    const { monitor, counts } = setup({ kind: 'connected', version: '1' });
    await Promise.all([monitor.checkNow(), monitor.checkNow()]);
    expect(counts()).toEqual({ checks: 1, reconnects: 1 });
  });
});
