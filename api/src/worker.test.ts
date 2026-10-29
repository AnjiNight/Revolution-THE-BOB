import { pino } from 'pino';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msUntilBrasiliaHour, startWorker } from './worker.js';

function silentLogger() {
  return pino(
    { level: 'info' },
    new Writable({
      write(_chunk: Buffer, _enc, cb) {
        cb();
      },
    }),
  );
}

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

  it('tarefa a cada 15 minutos roda ao iniciar e não começa de novo antes de terminar (SPEC-008)', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn<() => Promise<number>>(
      () => new Promise<number>((resolve) => (finish = () => resolve(1))),
    );
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      scheduledTasks: [{ name: 'retroativo', run, everyMinutes: 15 }],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    // A primeira ainda está rodando: os próximos 15 minutos são pulados.
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);
    worker.stop();
  });

  it('tarefa diária com hora roda ao iniciar e depois às 08:00 de Brasília (SPEC-008)', async () => {
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); // 09:00 em Brasília
    const run = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      scheduledTasks: [{ name: 'diária', run, dailyAtHour: 8 }],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    // Próxima às 08:00 de 30/10 em Brasília = 11:00 UTC, 23 horas depois.
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000 - 2000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(3);
    worker.stop();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe('msUntilBrasiliaHour', () => {
  it('conta até a próxima hora marcada no relógio de Brasília (UTC−3)', () => {
    const hour = 60 * 60 * 1000;
    expect(msUntilBrasiliaHour(new Date('2026-10-29T10:00:00Z'), 8)).toBe(hour); // 07:00
    expect(msUntilBrasiliaHour(new Date('2026-10-29T11:00:00Z'), 8)).toBe(24 * hour); // 08:00 em ponto
    expect(msUntilBrasiliaHour(new Date('2026-10-30T02:30:00Z'), 8)).toBe(8.5 * hour); // 23:30 de 29/10
  });
});
