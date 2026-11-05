import {
  ASSET_PATHS,
  validateAssetUpdate,
  validateCatalogQuery,
  validateNewAsset,
  validatePriceHistoryQuery,
} from '@simulador/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { domainErrorRunner } from '../../../shared/http/domain-errors.js';
import { HttpError } from '../../../shared/http/http-error.js';
import { ensureValid } from '../../../shared/http/validation.js';
import type { AccessTokenService } from '../../identity/application/ports.js';
import {
  makeAuthenticate,
  requireAuth,
  requireCollaborator,
} from '../../identity/controllers/authenticate.js';
import type { AssetCatalogService } from '../application/asset-catalog-service.js';

export interface AssetRoutesOptions {
  catalog: AssetCatalogService;
  accessTokens: AccessTokenService;
}

const run = domainErrorRunner({
  ticker_in_use: { status: 409, message: 'Outro ativo já usa este ticker.' },
  asset_not_found: { status: 404, message: 'Ativo não encontrado.' },
  logo_not_found: { status: 404, message: 'Este ativo não tem logo.' },
  validation_error: { status: 400, message: 'Dados inválidos.' },
});

interface IdParams {
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id da rota: o que não é um UUID não existe (404, sem chegar ao banco). */
function assetId(request: FastifyRequest<{ Params: IdParams }>): string {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) throw new HttpError(404, 'asset_not_found', 'Ativo não encontrado.');
  return id.toLowerCase();
}

/** Logo no navegador de alguém que abriu o endereço direto: nenhum script roda (SPEC-040). */
const LOGO_HEADERS = {
  'cache-control': 'private, max-age=86400',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;

/**
 * Catálogo de ativos (SPECs 006, 010 e 040, §5.2): busca, setores, ficha, gráfico e logos para
 * qualquer pessoa conectada; manutenção só para colaborador, com o 403 antes de qualquer
 * validação (DA12).
 */
export function registerAssetRoutes(app: FastifyInstance, options: AssetRoutesOptions): void {
  const { catalog } = options;
  const authenticate = makeAuthenticate(options.accessTokens);
  const authenticated = { preHandler: authenticate };
  const collaboratorOnly = { preHandler: [authenticate, requireCollaborator] };

  // Usuário: só ativos ativos; o filtro de situação não vale aqui.
  app.get(ASSET_PATHS.search, authenticated, async (request, reply) => {
    const {
      q,
      class: assetClass,
      sector,
      offset,
    } = ensureValid(validateCatalogQuery(request.query));
    return reply.send(
      await catalog.search({
        q,
        ...(assetClass ? { class: assetClass } : {}),
        ...(sector ? { sector } : {}),
        ...(offset ? { offset } : {}),
      }),
    );
  });

  app.get(ASSET_PATHS.sectors, authenticated, async (_request, reply) => {
    return reply.send({ sectors: catalog.sectors() });
  });

  // SPEC-010: ficha e gráfico, também de ativo desativado (quem tem o ativo vê o ativo).
  app.get<{ Params: IdParams }>(ASSET_PATHS.detail, authenticated, async (request, reply) => {
    const id = assetId(request);
    return reply.send(await run(() => catalog.detail(id)));
  });

  app.get<{ Params: IdParams }>(ASSET_PATHS.history, authenticated, async (request, reply) => {
    const id = assetId(request);
    const { period, adjusted } = ensureValid(validatePriceHistoryQuery(request.query));
    return reply.send(await run(() => catalog.priceHistory(id, period, adjusted)));
  });

  app.get<{ Params: IdParams }>(ASSET_PATHS.logo, authenticated, async (request, reply) => {
    const id = assetId(request);
    const logo = await run(() => catalog.logo(id));
    return reply
      .headers({ ...LOGO_HEADERS, 'content-type': logo.type })
      .send(Buffer.from(logo.content));
  });

  app.get(ASSET_PATHS.catalog, collaboratorOnly, async (request, reply) => {
    const query = ensureValid(validateCatalogQuery(request.query));
    return reply.send(await catalog.catalog(query));
  });

  app.post(ASSET_PATHS.catalog, collaboratorOnly, async (request, reply) => {
    const input = ensureValid(validateNewAsset(request.body));
    const asset = await run(() => catalog.create(input, requireAuth(request).userId));
    return reply.status(201).send({ asset });
  });

  app.patch<{ Params: IdParams }>(ASSET_PATHS.asset, collaboratorOnly, async (request, reply) => {
    const id = assetId(request);
    const input = ensureValid(validateAssetUpdate(request.body));
    const asset = await run(() => catalog.update(id, input, requireAuth(request).userId));
    return reply.send({ asset });
  });

  app.post<{ Params: IdParams }>(
    ASSET_PATHS.deactivate,
    collaboratorOnly,
    async (request, reply) => {
      const id = assetId(request);
      const asset = await run(() => catalog.deactivate(id, requireAuth(request).userId));
      return reply.send({ asset });
    },
  );

  app.post<{ Params: IdParams }>(
    ASSET_PATHS.confirmClassification,
    collaboratorOnly,
    async (request, reply) => {
      const id = assetId(request);
      const asset = await run(() => catalog.confirmClassification(id, requireAuth(request).userId));
      return reply.send({ asset });
    },
  );

  app.post<{ Params: IdParams }>(
    ASSET_PATHS.reactivate,
    collaboratorOnly,
    async (request, reply) => {
      const id = assetId(request);
      const asset = await run(() => catalog.reactivate(id, requireAuth(request).userId));
      return reply.send({ asset });
    },
  );
}
