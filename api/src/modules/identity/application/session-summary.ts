import type { StoredSession } from './ports.js';

/**
 * Uma sessão por família (cada login); as renovações só avançam as datas. A sessão está encerrada
 * quando todos os tokens dela foram revogados (logout, troca de senha ou reuso detectado).
 */
export function summarizeSessions(
  tokens: Array<{ family: string; createdAt: Date; expiresAt: Date; revokedAt: Date | null }>,
): StoredSession[] {
  const byFamily = new Map<string, typeof tokens>();
  for (const token of tokens) {
    byFamily.set(token.family, [...(byFamily.get(token.family) ?? []), token]);
  }
  const pick = (dates: Date[], choose: (...values: number[]) => number) =>
    new Date(choose(...dates.map((d) => d.getTime())));
  return [...byFamily.values()]
    .map((family) => ({
      startedAt: pick(
        family.map((t) => t.createdAt),
        Math.min,
      ),
      lastRenewedAt: pick(
        family.map((t) => t.createdAt),
        Math.max,
      ),
      expiresAt: pick(
        family.map((t) => t.expiresAt),
        Math.max,
      ),
      ended: family.every((t) => t.revokedAt !== null),
    }))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
