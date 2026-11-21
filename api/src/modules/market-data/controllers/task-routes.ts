import { TASK_PATHS } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireCollaborator,
} from '../../identity/controllers/authenticate.js';
import type { TaskMonitorService } from '../application/task-monitor-service.js';

export interface TaskRoutesOptions {
  tasks: TaskMonitorService;
  accessTokens: AccessTokenService;
}

const run = domainErrorRunner({
  task_not_found: { status: 404, message: 'Tarefa não encontrada.' },
  run_not_found: { status: 404, message: 'Execução não encontrada.' },
  run_already_requested: { status: 409, message: 'Esta tarefa já tem um pedido pendente.' },
  run_in_progress: { status: 409, message: 'Esta tarefa está rodando agora.' },
  source_disabled: { status: 409, message: 'A coleta do Investidor10 está desligada.' },
});

/**
 * Tarefas de ingestão (SPEC-011 §5.1): a situação de cada uma, o histórico com os erros e o pedido
 * de "Executar agora", só para o colaborador. Quem roda a tarefa é o processador (DA07).
 */
export function registerTaskRoutes(app: FastifyInstance, options: TaskRoutesOptions): void {
  const collaboratorOnly = {
    preHandler: [makeAuthenticate(options.accessTokens), requireCollaborator],
  };

  app.get(TASK_PATHS.list, collaboratorOnly, async (_request, reply) => {
    return reply.send(await options.tasks.overview());
  });

  app.get<{ Params: { task: string }; Querystring: { offset?: string } }>(
    TASK_PATHS.runs,
    collaboratorOnly,
    async (request, reply) => {
      const page = await run(() => options.tasks.runs(request.params.task, request.query.offset));
      return reply.send(page);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { offset?: string } }>(
    TASK_PATHS.errors,
    collaboratorOnly,
    async (request, reply) => {
      const page = await run(() => options.tasks.errors(request.params.id, request.query.offset));
      return reply.send(page);
    },
  );

  app.post<{ Params: { task: string } }>(
    TASK_PATHS.requests,
    collaboratorOnly,
    async (request, reply) => {
      const { userId } = requireAuth(request);
      const result = await run(() => options.tasks.request(request.params.task, userId));
      return reply.code(202).send(result);
    },
  );
}
