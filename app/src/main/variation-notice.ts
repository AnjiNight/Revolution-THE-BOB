import type { VariationNotice } from '../shared/auth-ipc.js';

/** O que cabe num aviso do Windows; mais que isso o sistema corta. */
const MAX_TITLE = 120;
const MAX_BODY = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SPEC-033: confere o aviso que a interface pediu antes de mostrar: textos curtos e um destino
 * conhecido (a ficha de um ativo pelo id, ou a tela Carteiras). Qualquer outra coisa é ignorada.
 */
export function isVariationNotice(value: unknown): value is VariationNotice {
  if (typeof value !== 'object' || value === null) return false;
  const { title, body, target } = value as Record<string, unknown>;
  if (typeof title !== 'string' || title.length === 0 || title.length > MAX_TITLE) return false;
  if (typeof body !== 'string' || body.length > MAX_BODY) return false;
  if (typeof target !== 'object' || target === null) return false;
  const { kind, assetId } = target as Record<string, unknown>;
  if (kind === 'portfolios') return true;
  return kind === 'asset' && typeof assetId === 'string' && UUID.test(assetId);
}
