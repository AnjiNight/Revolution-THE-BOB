import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../../../shared/http/http-error.js';
import type { AccessTokenClaims, AccessTokenService } from '../application/ports.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo preHandler `authenticate` nas rotas protegidas. */
    auth?: AccessTokenClaims;
  }
}

/** preHandler que exige um token de acesso válido (DA12). */
export function makeAuthenticate(accessTokens: AccessTokenService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const claims = token ? accessTokens.verify(token) : null;
    if (!claims) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    request.auth = claims;
  };
}

/**
 * preHandler das rotas da equipe, depois de `authenticate`: 403 para quem não é colaborador
 * (DA12: conferido no servidor, não só escondido na interface).
 */
export async function requireCollaborator(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (requireAuth(request).role !== 'collaborator') {
    throw new HttpError(403, 'forbidden', 'Esta área é só da equipe.');
  }
}

/**
 * preHandler das rotas só da conta de usuário (SPEC-033: avisos de variação), depois de
 * `authenticate`: 403 para o colaborador (DA12).
 */
export async function requireUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (requireAuth(request).role !== 'user') {
    throw new HttpError(403, 'forbidden', 'Esta área é só das contas de usuário.');
  }
}

/** Contas que têm carteiras: o usuário e, desde a SPEC-045, o colaborador (carteiras de teste). */
const PORTFOLIO_ROLES: ReadonlySet<AccessTokenClaims['role']> = new Set(['user', 'collaborator']);

/**
 * preHandler das rotas de carteira (SPEC-012), depois de `authenticate`. Desde a SPEC-045, o
 * colaborador também tem carteiras, as de teste da Visão do usuário; quem protege os dados é a
 * verificação de dono de cada carteira (DA12, RB03), que não muda.
 */
export async function requirePortfolioAccount(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!PORTFOLIO_ROLES.has(requireAuth(request).role)) {
    throw new HttpError(403, 'forbidden', 'Esta conta não tem carteiras.');
  }
}

/** Claims do usuário autenticado; só use em rotas com o preHandler `authenticate`. */
export function requireAuth(request: FastifyRequest): AccessTokenClaims {
  if (!request.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  return request.auth;
}
