import { pino } from 'pino';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWorker } from './worker.js';

describe('startWorker (CA09)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('registra heartbeat periódico com a situação do banco', async () => {
    const messages: Array<{ msg: string; database?: string }> = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        messages.push(JSON.parse(chunk.toString()) as { msg: string; database?: string });
        cb();
      },
    });
    const logger = pino({ level: 'info' }, stream);
    const isAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);

    const worker = startWorker({ logger, probe: { isAvailable }, heartbeatSeconds: 10 });
    await vi.advanceTimersByTimeAsync(25_000);
    worker.stop();

    expect(isAvailable).toHaveBeenCalledTimes(3); // imediato + 10 s + 20 s
    expect(messages[0]?.msg).toBe('processador iniciado');
    expect(messages.filter((m) => m.msg === 'processador ativo')).toHaveLength(3);
    expect(messages.at(-1)?.msg).toBe('processador encerrado');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(isAvailable).toHaveBeenCalledTimes(3);
  });

  it('roda as tarefas diárias ao iniciar e a cada 24 horas (SPEC-039)', async () => {
    const messages: Array<{ msg: string; affected?: number }> = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        messages.push(JSON.parse(chunk.toString()) as { msg: string; affected?: number });
        cb();
      },
    });
    const run = vi.fn<() => Promise<number>>().mockResolvedValue(2);
    const worker = startWorker({
      logger: pino({ level: 'info' }, stream),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      dailyTasks: [{ name: 'limpeza', run }],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);
    worker.stop();
    expect(messages.filter((m) => m.msg === 'tarefa diária concluída')).toHaveLength(2);
    expect(messages.find((m) => m.msg === 'tarefa diária concluída')?.affected).toBe(2);
  });
});
