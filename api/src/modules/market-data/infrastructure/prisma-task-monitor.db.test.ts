import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { uniqueTicker } from '../../../testing/unique-ticker.js';
import type { IngestionTask, RunResult } from '../application/ports.js';
import { INTERRUPTED_MESSAGE } from '../domain/task-errors.js';
import { PrismaTaskRunRepository } from './prisma-quote-repository.js';
import { PrismaTaskMonitorRepository } from './prisma-task-monitor-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-011). Rodam só com TEST_DATABASE_URL apontando para um banco
 * com as migrações aplicadas. ATENÇÃO: apagam as execuções, os pedidos e o sinal de vida.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('monitoramento das tarefas no PostgreSQL (SPEC-011)', () => {
  let prisma: PrismaClient;
  let runs: PrismaTaskRunRepository;
  let monitor: PrismaTaskMonitorRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    runs = new PrismaTaskRunRepository(prisma);
    monitor = new PrismaTaskMonitorRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE execucao_tarefa, pedido_execucao, estado_processador CASCADE',
    );
  });

  const result = (status: RunResult['status'], extra: Partial<RunResult> = {}): RunResult => ({
    status,
    records: 0,
    affectedAssets: 0,
    periodStart: null,
    periodEnd: null,
    errors: [],
    ...extra,
  });

  /** Uma execução terminada, começando em `at` e durando 1 minuto. */
  const finished = async (
    task: IngestionTask,
    at: string,
    status: RunResult['status'],
    extra: Partial<RunResult> = {},
  ) => {
    const id = await runs.start(task, new Date(at));
    await runs.finish(id, result(status, extra), new Date(Date.parse(at) + 60_000));
    return id;
  };

  const collaborator = () =>
    prisma.usuario.create({
      data: {
        nome: 'André Martins',
        email: `andre-${randomUUID()}@equipe.com`,
        perfil: 'colaborador',
        // O banco exige senha na conta de colaborador (SPEC-002).
        senhaHash: 'hash-de-teste',
        emailConfirmadoEm: new Date(),
      },
    });

  it('de cada tarefa, a última execução terminada e a que está em andamento (CA01)', async () => {
    await finished('cdi_diario', '2026-11-15T12:00:00Z', 'sucesso', { records: 1 });
    const last = await finished('cdi_diario', '2026-11-16T12:00:00Z', 'parcial', {
      records: 2,
      affectedAssets: 1,
      errors: [{ message: 'dia sem CDI' }, { message: 'outro' }],
    });
    await runs.start('cdi_diario', new Date('2026-11-16T21:00:00Z'));
    const latest = await monitor.latestRuns();
    expect(latest.size).toBe(9);
    expect(latest.get('cdi_diario')).toEqual({
      finished: {
        id: last,
        startedAt: new Date('2026-11-16T12:00:00Z'),
        finishedAt: new Date('2026-11-16T12:01:00Z'),
        status: 'parcial',
        records: 2,
        affectedAssets: 1,
        errorCount: 2,
      },
      runningSince: new Date('2026-11-16T21:00:00Z'),
    });
    expect(latest.get('eventos_b3')).toEqual({ finished: null, runningSince: null });
  });

  it('um pedido pendente por tarefa; atendido com a execução, ou "nada a fazer" (CA03)', async () => {
    const user = await collaborator();
    expect(await monitor.request('cdi_diario', user.id, new Date('2026-11-16T13:00:00Z'))).toBe(
      true,
    );
    expect(await monitor.request('cdi_diario', user.id, new Date('2026-11-16T13:00:05Z'))).toBe(
      false,
    );
    expect(await monitor.request('indices_b3', user.id, new Date('2026-11-16T13:00:05Z'))).toBe(
      true,
    );
    expect(await monitor.pendingRequests()).toEqual(
      new Map([
        ['cdi_diario', new Date('2026-11-16T13:00:00Z')],
        ['indices_b3', new Date('2026-11-16T13:00:05Z')],
      ]),
    );
    const pending = await monitor.pending();
    expect(pending.map((request) => request.task)).toEqual(['cdi_diario', 'indices_b3']);

    // O processador roda o CDI e marca o pedido; os índices não tinham o que fazer.
    const since = new Date('2026-11-16T13:00:15Z');
    const runId = await finished('cdi_diario', '2026-11-16T13:00:16Z', 'sucesso', { records: 1 });
    await monitor.attend(
      pending[0]?.id ?? '',
      'cdi_diario',
      since,
      new Date('2026-11-16T13:01:20Z'),
    );
    await monitor.attend(
      pending[1]?.id ?? '',
      'indices_b3',
      since,
      new Date('2026-11-16T13:00:20Z'),
    );
    const rows = await prisma.pedidoExecucao.findMany({ orderBy: { pedidoEm: 'asc' } });
    expect(rows.map((row) => [row.tarefa, row.resultado, row.execucaoId])).toEqual([
      ['cdi_diario', 'executada', runId],
      ['indices_b3', 'nada_a_fazer', null],
    ]);
    expect(await monitor.pending()).toEqual([]);
    // Atendido, a tarefa pode ser pedida de novo.
    expect(await monitor.request('cdi_diario', user.id, new Date('2026-11-16T13:02:00Z'))).toBe(
      true,
    );

    // O histórico diz quem pediu; com a conta removida pela equipe, o pedido fica, sem o nome.
    expect((await monitor.runs('cdi_diario', 0, 50)).runs[0]?.request).toEqual({
      name: 'André Martins',
    });
    await prisma.usuario.delete({ where: { id: user.id } });
    expect((await monitor.runs('cdi_diario', 0, 50)).runs[0]?.request).toEqual({ name: null });
    expect(await prisma.pedidoExecucao.count()).toBe(3);
  });

  it('histórico com período, cota e totais; erros com o ticker, os sem dia primeiro (CA02)', async () => {
    const ticker = await uniqueTicker(prisma, 'T', '3');
    const asset = await prisma.ativo.create({
      data: {
        ticker,
        nome: 'Teste',
        classe: 'acao',
        setor: 'bens_industriais',
        atualizadoEm: new Date(),
      },
    });
    const id = await finished('cotacao_pregao', '2026-11-16T14:30:00Z', 'parcial', {
      records: 700,
      affectedAssets: 700,
      periodStart: '2026-11-16',
      periodEnd: '2026-11-16',
      requests: 2,
      quota: { remaining: 14_000, limit: 15_000, resetsAt: new Date('2026-12-01T00:00:00Z') },
      totals: { missing: 1, missingTickers: [ticker] },
      errors: [
        { assetId: asset.id, date: '2026-11-16', message: 'sem preço na lista' },
        { message: 'lista de FIIs: tempo esgotado' },
      ],
    });
    const page = await monitor.runs('cotacao_pregao', 0, 50);
    expect(page.total).toBe(1);
    expect(page.runs[0]).toEqual({
      id,
      startedAt: new Date('2026-11-16T14:30:00Z'),
      finishedAt: new Date('2026-11-16T14:31:00Z'),
      status: 'parcial',
      records: 700,
      affectedAssets: 700,
      errorCount: 2,
      periodStart: '2026-11-16',
      periodEnd: '2026-11-16',
      requests: 2,
      quota: { remaining: 14_000, limit: 15_000, resetsAt: new Date('2026-12-01T00:00:00Z') },
      totals: { missing: 1, missingTickers: [ticker] },
      request: null,
    });
    expect(await monitor.errors(id, 0, 100)).toEqual({
      total: 2,
      errors: [
        { ticker: null, date: null, message: 'lista de FIIs: tempo esgotado' },
        { ticker, date: '2026-11-16', message: 'sem preço na lista' },
      ],
    });
    expect(await monitor.errors(id, 1, 100)).toMatchObject({ total: 2, errors: [{ ticker }] });
    expect(await monitor.errors(randomUUID(), 0, 100)).toBeNull();
  });

  it('o sinal de vida fica numa linha só, sempre o último (CA04)', async () => {
    expect(await monitor.processor()).toBeNull();
    await monitor.beat(new Date('2026-11-16T13:00:00Z'), 60);
    await monitor.beat(new Date('2026-11-16T13:01:00Z'), 60);
    expect(await monitor.processor()).toEqual({
      seenAt: new Date('2026-11-16T13:01:00Z'),
      intervalSeconds: 60,
    });
    expect(await prisma.estadoProcessador.count()).toBe(1);
  });

  it('ao iniciar, a execução que ficou sem fim vira falha, com a mensagem (CA04)', async () => {
    const open = await runs.start('historico_retroativo', new Date('2026-11-16T12:00:00Z'));
    await finished('fechamento_diario', '2026-11-16T11:00:00Z', 'sucesso');
    expect(await monitor.closeInterrupted(new Date('2026-11-16T13:00:00Z'))).toBe(1);
    const run = await prisma.execucaoTarefa.findUniqueOrThrow({
      where: { id: open },
      include: { erros: true },
    });
    expect(run).toMatchObject({ situacao: 'falha', terminadaEm: new Date('2026-11-16T13:00:00Z') });
    expect(run.erros.map((error) => error.mensagem)).toEqual([INTERRUPTED_MESSAGE]);
    expect(await monitor.closeInterrupted(new Date('2026-11-16T13:05:00Z'))).toBe(0);
  });

  it('limpeza: mais de 90 dias sai, menos a última execução de cada tarefa (CA05)', async () => {
    const user = await collaborator();
    const oldCdi = await finished('cdi_diario', '2026-07-01T12:00:00Z', 'falha', {
      errors: [{ message: 'fora do ar' }],
    });
    await finished('cdi_diario', '2026-07-02T12:00:00Z', 'sucesso');
    const recentCdi = await finished('cdi_diario', '2026-11-15T12:00:00Z', 'sucesso');
    // A única execução do calendário é antiga: fica, porque é a última dele.
    const onlyCalendar = await finished('calendario_b3', '2026-06-01T10:30:00Z', 'sucesso');
    // Um pedido atendido há muito tempo sai; um pendente, não.
    await monitor.request('cdi_diario', user.id, new Date('2026-07-01T11:59:00Z'));
    const [old] = await monitor.pending();
    await monitor.attend(
      old?.id ?? '',
      'cdi_diario',
      new Date('2026-07-01T11:59:30Z'),
      new Date('2026-07-01T12:01:00Z'),
    );
    await monitor.request('indices_b3', user.id, new Date('2026-07-01T12:00:00Z'));

    const deleted = await monitor.deleteBefore(new Date('2026-08-18T00:00:00Z'));
    expect(deleted).toBe(3); // duas execuções do CDI e o pedido atendido
    const left = await prisma.execucaoTarefa.findMany({ select: { id: true } });
    expect(left.map((run) => run.id).sort()).toEqual([recentCdi, onlyCalendar].sort());
    expect(await prisma.erroExecucao.count({ where: { execucaoId: oldCdi } })).toBe(0);
    expect(await prisma.pedidoExecucao.findMany({ select: { tarefa: true } })).toEqual([
      { tarefa: 'indices_b3' },
    ]);
  });
});
