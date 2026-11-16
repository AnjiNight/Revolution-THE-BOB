import {
  ASSET_PATHS,
  AUTH_PATHS,
  runPath,
  TASK_PATHS,
  taskPath,
  type AuthSession,
  type IngestionTaskCode,
  type TaskErrorPage,
  type TaskList,
  type TaskRunPage,
} from '@simulador/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../testing/test-app.js';
import { createCollaborator } from '../../identity/application/create-collaborator.js';
import type { RunResult } from '../application/ports.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

describe('tarefas de ingestão (SPEC-011)', () => {
  let now = new Date('2026-11-16T13:00:00Z');
  let t: TestApp;
  let collaborator: AuthSession;

  const call = (method: 'GET' | 'POST', url: string, session: AuthSession | null = collaborator) =>
    t.app.inject({
      method,
      url,
      ...(session ? { headers: { authorization: `Bearer ${session.accessToken}` } } : {}),
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

  /** Uma execução terminada da tarefa, começando em `at` e durando 2 minutos. */
  const finished = async (
    task: IngestionTaskCode,
    at: string,
    status: RunResult['status'],
    extra: Partial<RunResult> = {},
  ) => {
    const id = await t.runs.start(task, new Date(at));
    await t.runs.finish(id, result(status, extra), new Date(Date.parse(at) + 120_000));
    return id;
  };

  beforeEach(async () => {
    now = new Date('2026-11-16T13:00:00Z');
    t = await buildTestApp({ clock: () => now });
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'André Martins', email: 'andre@equipe.com' },
      () => 'senha-do-colaborador',
    );
    collaborator = (
      await t.app.inject({
        method: 'POST',
        url: AUTH_PATHS.collaboratorLogin,
        payload: { email: 'andre@equipe.com', password: 'senha-do-colaborador' },
      })
    ).json<AuthSession>();
    // No banco, o nome vem do módulo de identidade.
    t.taskMonitor.names.set(collaborator.user.id, 'André Martins');
  });

  afterEach(async () => {
    await t.app.close();
  });

  it('lista as 9 tarefas, as com falha ou parcial primeiro, com a fonte e quando rodam (CA01)', async () => {
    await finished('fechamento_diario', '2026-11-16T11:00:00Z', 'sucesso', {
      records: 712,
      affectedAssets: 712,
    });
    await finished('investidor10', '2026-11-16T06:00:00Z', 'falha', {
      errors: [{ message: 'Investidor10 indisponível: tempo esgotado' }],
    });
    await finished('cdi_diario', '2026-11-16T12:00:00Z', 'parcial');
    const res = await call('GET', TASK_PATHS.list);
    expect(res.statusCode).toBe(200);
    const body = res.json<TaskList>();
    expect(body.tasks.map((task) => task.task)).toEqual([
      'cdi_diario',
      'investidor10',
      'calendario_b3',
      'historico_retroativo',
      'fechamento_diario',
      'importacao_catalogo',
      'indices_b3',
      'eventos_b3',
      'cotacao_pregao',
    ]);
    const daily = body.tasks.find((task) => task.task === 'fechamento_diario');
    expect(daily).toMatchObject({
      sources: ['b3'],
      schedule: { kind: 'daily', times: ['08:00'] },
      lastRun: {
        status: 'sucesso',
        records: 712,
        affectedAssets: 712,
        errorCount: 0,
        startedAt: '2026-11-16T11:00:00.000Z',
        finishedAt: '2026-11-16T11:02:00.000Z',
      },
      runningSince: null,
      pendingRequestAt: null,
      blockedReason: null,
    });
    expect(body.tasks.find((task) => task.task === 'investidor10')?.lastRun?.errorCount).toBe(1);
    expect(body.tasks.find((task) => task.task === 'cotacao_pregao')?.schedule).toEqual({
      kind: 'session',
      minutes: 30,
    });
    expect(body.tasks.find((task) => task.task === 'calendario_b3')?.lastRun).toBeNull();
    // O processador nunca deu sinal.
    expect(body.processor).toEqual({ lastSeenAt: null, stopped: true });
  });

  it('o processador: ligado com sinal recente; parado depois de 3 minutos (CA04)', async () => {
    await t.taskMonitor.beat(new Date('2026-11-16T12:59:20Z'), 60);
    expect((await call('GET', TASK_PATHS.list)).json<TaskList>().processor).toEqual({
      lastSeenAt: '2026-11-16T12:59:20.000Z',
      stopped: false,
    });
    now = new Date('2026-11-16T13:02:21Z');
    expect((await call('GET', TASK_PATHS.list)).json<TaskList>().processor.stopped).toBe(true);
    // Com um intervalo maior que 1 minuto, vale três batidas.
    await t.taskMonitor.beat(new Date('2026-11-16T13:00:00Z'), 120);
    now = new Date('2026-11-16T13:05:59Z');
    expect((await call('GET', TASK_PATHS.list)).json<TaskList>().processor.stopped).toBe(false);
  });

  it('Executar agora: grava o pedido; um pendente por tarefa; recusado rodando (CA03)', async () => {
    const res = await call('POST', taskPath(TASK_PATHS.requests, 'fechamento_diario'));
    expect(res.statusCode, res.body).toBe(202);
    expect(res.json()).toEqual({ requestedAt: '2026-11-16T13:00:00.000Z' });
    expect(t.taskMonitor.requests[0]).toMatchObject({
      task: 'fechamento_diario',
      collaboratorId: collaborator.user.id,
      attendedAt: null,
    });
    const again = await call('POST', taskPath(TASK_PATHS.requests, 'fechamento_diario'));
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'run_already_requested' });
    const listed = (await call('GET', TASK_PATHS.list)).json<TaskList>();
    expect(listed.tasks.find((task) => task.task === 'fechamento_diario')).toMatchObject({
      pendingRequestAt: '2026-11-16T13:00:00.000Z',
      blockedReason: 'requested',
    });

    // Em andamento: recusado, e a lista diz desde quando.
    await t.runs.start('cdi_diario', new Date('2026-11-16T12:59:00Z'));
    const running = await call('POST', taskPath(TASK_PATHS.requests, 'cdi_diario'));
    expect(running.statusCode).toBe(409);
    expect(running.json()).toMatchObject({ error: 'run_in_progress' });
    expect(
      (await call('GET', TASK_PATHS.list))
        .json<TaskList>()
        .tasks.find((task) => task.task === 'cdi_diario'),
    ).toMatchObject({ runningSince: '2026-11-16T12:59:00.000Z', blockedReason: 'running' });
  });

  it('Investidor10 desligado: recusado, com o motivo na lista', async () => {
    await t.app.close();
    t = await buildTestApp({ clock: () => now, investidor10: false });
    await createCollaborator(
      t.users,
      t.hasher,
      { name: 'André Martins', email: 'andre@equipe.com' },
      () => 'senha-do-colaborador',
    );
    collaborator = (
      await t.app.inject({
        method: 'POST',
        url: AUTH_PATHS.collaboratorLogin,
        payload: { email: 'andre@equipe.com', password: 'senha-do-colaborador' },
      })
    ).json<AuthSession>();
    const res = await call('POST', taskPath(TASK_PATHS.requests, 'investidor10'));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'source_disabled' });
    expect(
      (await call('GET', TASK_PATHS.list))
        .json<TaskList>()
        .tasks.find((task) => task.task === 'investidor10')?.blockedReason,
    ).toBe('source_disabled');
  });

  it('histórico 50 por vez, com quem pediu; erros 100 por vez, com o ticker (CA02)', async () => {
    for (let day = 1; day <= 55; day += 1) {
      const at = new Date(Date.UTC(2026, 8, day, 11)).toISOString();
      await finished('fechamento_diario', at, 'sucesso', { records: day });
    }
    const first = await call('GET', taskPath(TASK_PATHS.runs, 'fechamento_diario'));
    expect(first.statusCode).toBe(200);
    const page = first.json<TaskRunPage>();
    expect(page).toMatchObject({ total: 55, hasMore: true });
    expect(page.runs).toHaveLength(50);
    // Das mais recentes para as mais antigas.
    expect(page.runs[0]?.records).toBe(55);
    const rest = (
      await call('GET', `${taskPath(TASK_PATHS.runs, 'fechamento_diario')}?offset=50`)
    ).json<TaskRunPage>();
    expect(rest).toMatchObject({ total: 55, hasMore: false });
    expect(rest.runs.map((run) => run.records)).toEqual([5, 4, 3, 2, 1]);

    // Uma execução pedida, com 120 erros, um deles de um ativo do catálogo.
    await call('POST', taskPath(TASK_PATHS.requests, 'importacao_catalogo'));
    const created = await t.app.inject({
      method: 'POST',
      url: ASSET_PATHS.catalog,
      headers: { authorization: `Bearer ${collaborator.accessToken}` },
      payload: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        class: 'stock',
        sector: 'petroleo_gas_biocombustiveis',
      },
    });
    const petr4 = created.json<{ asset: { id: string } }>().asset.id;
    const runId = await t.runs.start('importacao_catalogo', new Date('2026-11-16T13:00:05Z'));
    await t.runs.finish(
      runId,
      result('parcial', {
        records: 700,
        totals: { created: 3, deactivated: 1 },
        errors: [
          { assetId: petr4, date: '2026-11-13', message: 'logo não baixou' },
          ...Array.from({ length: 119 }, (_, index) => ({ message: `erro ${index + 1}` })),
        ],
      }),
      new Date('2026-11-16T13:01:00Z'),
    );
    await t.taskMonitor.attend('pedido-1', 'importacao_catalogo', now, new Date());
    const history = (
      await call('GET', taskPath(TASK_PATHS.runs, 'importacao_catalogo'))
    ).json<TaskRunPage>();
    expect(history.runs[0]).toMatchObject({
      status: 'parcial',
      records: 700,
      errorCount: 120,
      totals: { created: 3, deactivated: 1 },
      request: { name: 'André Martins' },
    });
    const errors = await call('GET', runPath(TASK_PATHS.errors, runId));
    expect(errors.statusCode, errors.body).toBe(200);
    const errorPage = errors.json<TaskErrorPage>();
    expect(errorPage).toMatchObject({ total: 120, hasMore: true });
    expect(errorPage.errors).toHaveLength(100);
    expect(errorPage.errors[0]).toEqual({
      ticker: 'PETR4',
      date: '2026-11-13',
      message: 'logo não baixou',
    });
    expect(errorPage.errors[1]).toEqual({ ticker: null, date: null, message: 'erro 1' });
    const more = (
      await call('GET', `${runPath(TASK_PATHS.errors, runId)}?offset=100`)
    ).json<TaskErrorPage>();
    expect(more).toMatchObject({ total: 120, hasMore: false });
    expect(more.errors).toHaveLength(20);
  });

  it('erros de quem não pode e do que não existe (CA06)', async () => {
    const user = await t.registerConfirmed();
    expect((await call('GET', TASK_PATHS.list, user)).statusCode).toBe(403);
    expect((await call('POST', taskPath(TASK_PATHS.requests, 'cdi_diario'), user)).statusCode).toBe(
      403,
    );
    expect((await call('GET', TASK_PATHS.list, null)).statusCode).toBe(401);
    const unknown = await call('GET', taskPath(TASK_PATHS.runs, 'limpeza'));
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: 'task_not_found' });
    expect((await call('POST', taskPath(TASK_PATHS.requests, 'limpeza'))).json()).toMatchObject({
      error: 'task_not_found',
    });
    const missing = await call(
      'GET',
      runPath(TASK_PATHS.errors, '0d9e1f7a-1111-4222-8333-000000000000'),
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'run_not_found' });
    expect((await call('GET', runPath(TASK_PATHS.errors, 'nao-e-uuid'))).statusCode).toBe(404);
  });
});
