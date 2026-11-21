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

describe('pedidos de execução e sinal de vida (SPEC-011)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Pedidos em memória: o processador lê os pendentes e marca os atendidos. */
  function requestsFake(initial: Array<{ id: string; task: string }>) {
    const pending = [...initial];
    const attended: Array<{ id: string; task: string; since: Date; at: Date }> = [];
    return {
      attended,
      add: (request: { id: string; task: string }) => pending.push(request),
      requests: {
        pending: () => Promise.resolve([...pending]),
        attend: (id: string, task: string, since: Date, at: Date) => {
          pending.splice(
            pending.findIndex((item) => item.id === id),
            1,
          );
          attended.push({ id, task, since, at });
          return Promise.resolve();
        },
      },
    };
  }

  it('grava o sinal de vida a cada batida, com o intervalo (CA04)', async () => {
    vi.setSystemTime(new Date('2026-11-16T13:00:00Z'));
    const heartbeat = vi.fn<(at: Date, interval: number) => Promise<void>>().mockResolvedValue();
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 60,
      heartbeat,
    });
    await vi.advanceTimersByTimeAsync(125_000);
    worker.stop();
    expect(heartbeat).toHaveBeenCalledTimes(3); // ao iniciar, 60 s e 120 s
    expect(heartbeat.mock.calls[0]).toEqual([new Date('2026-11-16T13:00:00Z'), 60]);
    expect(heartbeat.mock.calls[2]?.[0]).toEqual(new Date('2026-11-16T13:02:00Z'));
  });

  it('o sinal de vida que não grava não derruba o processador', async () => {
    const heartbeat = vi.fn(() => Promise.reject(new Error('banco fora')));
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(false) },
      heartbeatSeconds: 10,
      heartbeat,
    });
    await vi.advanceTimersByTimeAsync(25_000);
    worker.stop();
    expect(heartbeat).toHaveBeenCalledTimes(3);
  });

  it('atende o pedido em até 15 s com o "Executar agora" da tarefa (CA03)', async () => {
    const run = vi.fn<() => Promise<number>>().mockResolvedValue(1);
    const runNow = vi.fn<() => Promise<number>>().mockResolvedValue(5);
    const fake = requestsFake([]);
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      scheduledTasks: [{ key: 'cdi_diario', name: 'CDI', run, runNow, dailyAtHour: 9 }],
      requests: fake.requests,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1); // ao iniciar
    fake.add({ id: 'p1', task: 'cdi_diario' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(runNow).toHaveBeenCalledTimes(1);
    expect(fake.attended).toEqual([expect.objectContaining({ id: 'p1', task: 'cdi_diario' })]);
    // Atendido, não roda de novo.
    await vi.advanceTimersByTimeAsync(45_000);
    expect(runNow).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  it('com a tarefa rodando, o pedido espera; e o horário não roda junto com o pedido', async () => {
    let finishScheduled: () => void = () => undefined;
    const run = vi.fn<() => Promise<number>>(
      () => new Promise<number>((resolve) => (finishScheduled = () => resolve(1))),
    );
    let finishRequested: () => void = () => undefined;
    const runNow = vi.fn<() => Promise<number>>(
      () => new Promise<number>((resolve) => (finishRequested = () => resolve(2))),
    );
    const fake = requestsFake([{ id: 'p1', task: 'historico_retroativo' }]);
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      scheduledTasks: [
        { key: 'historico_retroativo', name: 'retroativo', run, runNow, everyMinutes: 1 },
      ],
      requests: fake.requests,
    });
    // A execução do início ainda roda: o pedido espera.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(runNow).not.toHaveBeenCalled();
    finishScheduled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(runNow).toHaveBeenCalledTimes(1);
    // O pedido roda: o horário de 1 minuto é pulado.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fake.attended).toHaveLength(0);
    finishRequested();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.attended).toHaveLength(1);
    worker.stop();
  });

  it('pedido de uma tarefa que este processador não conhece fica atendido sem rodar nada', async () => {
    const fake = requestsFake([{ id: 'p1', task: 'outra' }]);
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      requests: fake.requests,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fake.attended).toEqual([expect.objectContaining({ id: 'p1', task: 'outra' })]);
    worker.stop();
  });

  it('vários horários por dia: o CDI às 09:00 e às 18:00 de Brasília', async () => {
    vi.setSystemTime(new Date('2026-11-16T11:00:00Z')); // 08:00 em Brasília
    const run = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    const worker = startWorker({
      logger: silentLogger(),
      probe: { isAvailable: () => Promise.resolve(true) },
      heartbeatSeconds: 3600,
      scheduledTasks: [
        {
          key: 'cdi_diario',
          name: 'CDI',
          run,
          dailyAt: [
            { hour: 9, minute: 0 },
            { hour: 18, minute: 0 },
          ],
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1); // ao iniciar
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 09:00
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9 * 60 * 60 * 1000); // 18:00
    expect(run).toHaveBeenCalledTimes(3);
    worker.stop();
  });
});

describe('msUntilBrasiliaHour', () => {
  it('conta até a próxima hora marcada no relógio de Brasília (UTC−3)', () => {
    const hour = 60 * 60 * 1000;
    expect(msUntilBrasiliaHour(new Date('2026-10-29T10:00:00Z'), 8)).toBe(hour); // 07:00
    expect(msUntilBrasiliaHour(new Date('2026-10-29T11:00:00Z'), 8)).toBe(24 * hour); // 08:00 em ponto
    expect(msUntilBrasiliaHour(new Date('2026-10-30T02:30:00Z'), 8)).toBe(8.5 * hour); // 23:30 de 29/10
  });

  it('com minutos: a importação do catálogo às 08:30 (SPEC-040)', () => {
    const minute = 60 * 1000;
    expect(msUntilBrasiliaHour(new Date('2026-11-03T11:00:00Z'), 8, 30)).toBe(30 * minute); // 08:00
    expect(msUntilBrasiliaHour(new Date('2026-11-03T11:45:00Z'), 8, 30)).toBe(
      (24 * 60 - 15) * minute,
    ); // 08:45: amanhã
  });
});
