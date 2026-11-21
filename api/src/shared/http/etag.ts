import { createHash } from 'node:crypto';
import { HEALTH_PATH } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';

/**
 * SPEC-032 (RNF19): toda leitura bem-sucedida leva um ETag, a impressão digital do corpo. O app
 * guarda o ETag com a resposta e o manda de volta em `If-None-Match`: se nada mudou, o servidor
 * responde 304 sem corpo, e o app usa o que já tem.
 *
 * Fica num gancho só, sem tocar nas rotas: as regras de cada rota não mudam.
 */
export function registerEtag(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'GET' || reply.statusCode !== 200) return payload;
    if (!request.url.startsWith('/api/') || pathOf(request.url) === HEALTH_PATH) return payload;
    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return payload;

    const etag = etagOf(payload);
    reply.header('etag', etag);
    // `private`: nenhum proxy guarda dado de um usuário. `no-cache`: reaproveitar só depois de
    // conferir com o servidor. Uma rota que já definiu o dela (o logo) fica com o dela.
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'private, no-cache');

    if (!matches(request.headers['if-none-match'], etag)) return payload;
    reply.code(304);
    reply.removeHeader('content-type');
    reply.removeHeader('content-length');
    return null;
  });
}

/** `W/"…"`: SHA-256 do corpo em base64url. Fraco porque o corpo só precisa ser igual em conteúdo. */
export function etagOf(payload: string | Buffer): string {
  return `W/"${createHash('sha256').update(payload).digest('base64url')}"`;
}

/** Comparação fraca (RFC 9110 §13.1.2): ignora o `W/` e aceita uma lista ou `*`. */
function matches(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const wanted = opaque(etag);
  const values = (Array.isArray(header) ? header.join(',') : header).split(',');
  return values.some((value) => {
    const tag = value.trim();
    return tag === '*' || opaque(tag) === wanted;
  });
}

function opaque(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
