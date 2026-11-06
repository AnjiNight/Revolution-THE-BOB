import { describe, expect, it } from 'vitest';
import { summarizeSessions } from './session-summary.js';

const at = (hour: number) => new Date(Date.UTC(2026, 9, 13, hour));

describe('resumo das sessões para a exportação (SPEC-034)', () => {
  it('uma sessão por login; renovações só avançam as datas; encerrada quando tudo foi revogado', () => {
    const sessions = summarizeSessions([
      { family: 'b', createdAt: at(12), expiresAt: at(20), revokedAt: at(13) },
      { family: 'a', createdAt: at(10), expiresAt: at(18), revokedAt: at(11) },
      { family: 'a', createdAt: at(11), expiresAt: at(19), revokedAt: null },
    ]);
    expect(sessions).toEqual([
      { startedAt: at(10), lastRenewedAt: at(11), expiresAt: at(19), ended: false },
      { startedAt: at(12), lastRenewedAt: at(12), expiresAt: at(20), ended: true },
    ]);
  });

  it('sem tokens, sem sessões', () => {
    expect(summarizeSessions([])).toEqual([]);
  });
});
