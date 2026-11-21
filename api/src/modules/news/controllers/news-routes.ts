import {
  ASSET_NEWS_PATHS,
  NEWS_PATHS,
  SENTIMENT_PATHS,
  validateAssetNewsDaysQuery,
  validateAssetNewsQuery,
  validateNewNewsSource,
  validateNewsLabel,
  validateSentimentNextQuery,
  validateUpdateNewsSource,
} from '@simulador/shared';
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
import type { AssetNewsService } from '../application/asset-news-service.js';
import type { NewsSourcesService } from '../application/news-sources-service.js';
import type { SentimentService } from '../application/sentiment-service.js';

export interface NewsRoutesOptions {
  sources: NewsSourcesService;
  assetNews: AssetNewsService;
  sentiment: SentimentService;
  accessTokens: AccessTokenService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const run = domainErrorRunner({
  news_source_not_found: { status: 404, message: 'Fonte de notícias não encontrada.' },
  source_exists: { status: 409, message: 'Já existe uma fonte com este endereço.' },
  parent_source: { status: 409, message: 'A fonte pai não pode ser alterada pela tela.' },
  asset_not_found: { status: 404, message: 'Ativo não encontrado.' },
  news_not_found: { status: 404, message: 'Notícia não encontrada.' },
  no_model: { status: 409, message: 'O processador ainda não classificou nenhuma notícia.' },
  not_enough_labels: { status: 409, message: 'Poucas notícias rotuladas para avaliar.' },
  validation_error: { status: 400, message: 'Dados inválidos.' },
});

interface IdParams {
  id: string;
}

function assetId(params: IdParams): string {
  if (!UUID_PATTERN.test(params.id)) {
    throw new HttpError(404, 'asset_not_found', 'Ativo não encontrado.');
  }
  return params.id;
}

function newsId(params: IdParams): string {
  if (!UUID_PATTERN.test(params.id)) {
    throw new HttpError(404, 'news_not_found', 'Notícia não encontrada.');
  }
  return params.id;
}

/**
 * Fontes de notícias (SPEC-027 §5.1): só o colaborador (403 para o usuário). A coleta em si roda no
 * processador (DA11); aqui só a lista, o cadastro e a edição das fontes. E as notícias de cada
 * ativo, para a ficha (SPEC-029 §5.1).
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

  // SPEC-029: as notícias do ativo na ficha, para qualquer pessoa conectada, como a ficha.
  const authenticated = { preHandler: [makeAuthenticate(options.accessTokens)] };
  const { assetNews } = options;

  app.get<{ Params: IdParams }>(ASSET_NEWS_PATHS.list, authenticated, async (request, reply) => {
    const id = assetId(request.params);
    const query = ensureValid(validateAssetNewsQuery(request.query));
    return reply.send(await run(() => assetNews.page(id, query)));
  });

  app.get<{ Params: IdParams }>(ASSET_NEWS_PATHS.days, authenticated, async (request, reply) => {
    const id = assetId(request.params);
    const { period } = ensureValid(validateAssetNewsDaysQuery(request.query));
    return reply.send(await run(() => assetNews.days(id, period)));
  });

  // SPEC-044: a amostra rotulada e a avaliação do modelo de sentimento.
  const { sentiment } = options;

  app.get(SENTIMENT_PATHS.summary, collaboratorOnly, async (_request, reply) => {
    return reply.send(await sentiment.summary());
  });

  app.get(SENTIMENT_PATHS.next, collaboratorOnly, async (request, reply) => {
    const { skip } = ensureValid(validateSentimentNextQuery(request.query));
    return reply.send({ news: await sentiment.next(skip) });
  });

  app.post(SENTIMENT_PATHS.evaluate, collaboratorOnly, async (_request, reply) => {
    return reply.send({ version: await run(() => sentiment.evaluate()) });
  });

  app.put<{ Params: IdParams }>(SENTIMENT_PATHS.label, collaboratorOnly, async (request, reply) => {
    const id = newsId(request.params);
    const input = ensureValid(validateNewsLabel(request.body));
    await run(() => sentiment.label(id, input.sentiment));
    return reply.status(204).send();
  });

  app.delete<{ Params: IdParams }>(
    SENTIMENT_PATHS.label,
    collaboratorOnly,
    async (request, reply) => {
      const id = newsId(request.params);
      await run(() => sentiment.unlabel(id));
      return reply.status(204).send();
    },
  );

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
