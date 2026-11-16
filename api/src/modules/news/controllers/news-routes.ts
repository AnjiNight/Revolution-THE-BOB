import { NEWS_PATHS, validateNewNewsSource, validateUpdateNewsSource } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import { HttpError } from '../../../shared/http/http-error.js';
import { ensureValid } from '../../../shared/http/validation.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireCollaborator,
} from '../../identity/controllers/authenticate.js';
import type { NewsSourcesService } from '../application/news-sources-service.js';

export interface NewsRoutesOptions {
  sources: NewsSourcesService;
  accessTokens: AccessTokenService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const run = domainErrorRunner({
  news_source_not_found: { status: 404, message: 'Fonte de notícias não encontrada.' },
  source_exists: { status: 409, message: 'Já existe uma fonte com este endereço.' },
  parent_source: { status: 409, message: 'A fonte pai não pode ser alterada pela tela.' },
  validation_error: { status: 400, message: 'Dados inválidos.' },
});

interface IdParams {
  id: string;
}

/**
 * Fontes de notícias (SPEC-027 §5.1): só o colaborador (403 para o usuário). A coleta em si roda no
 * processador (DA11); aqui só a lista, o cadastro e a edição das fontes.
 */
export function registerNewsRoutes(app: FastifyInstance, options: NewsRoutesOptions): void {
  const collaboratorOnly = {
    preHandler: [makeAuthenticate(options.accessTokens), requireCollaborator],
  };
  const { sources } = options;

  app.get(NEWS_PATHS.sources, collaboratorOnly, async (_request, reply) => {
    return reply.send(await sources.status());
  });

  // SPEC-028: as últimas notícias com os vínculos, para conferir a coleta e o vínculo.
  app.get(NEWS_PATHS.latest, collaboratorOnly, async (_request, reply) => {
    return reply.send(await sources.latest());
  });

  app.post(NEWS_PATHS.sources, collaboratorOnly, async (request, reply) => {
    const input = ensureValid(validateNewNewsSource(request.body));
    const created = await run(() => sources.create(requireAuth(request).userId, input));
    return reply.status(201).send(created);
  });

  app.patch<{ Params: IdParams }>(NEWS_PATHS.source, collaboratorOnly, async (request, reply) => {
    const { id } = request.params;
    if (!UUID_PATTERN.test(id)) {
      throw new HttpError(404, 'news_source_not_found', 'Fonte de notícias não encontrada.');
    }
    const input = ensureValid(validateUpdateNewsSource(request.body));
    const source = await run(() => sources.update(requireAuth(request).userId, id, input));
    return reply.send({ source });
  });
}
