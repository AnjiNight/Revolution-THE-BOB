import type { MySubscription } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { endingSoon, formatPlanPrice } from './plan';

const NOW = new Date('2026-12-20T12:00:00Z');

const mine = (endsAt: string, autoRenew: boolean): MySubscription => ({
  active: true,
  collaborator: false,
  subscription: {
    plan: 'assinante_mensal',
    startedAt: '2026-11-22T13:00:00.000Z',
    endsAt,
    autoRenew,
    cancelledAt: autoRenew ? null : '2026-11-30T12:00:00.000Z',
  },
  payments: [],
});

describe('tela Plano (SPEC-025)', () => {
  it('preço em reais no idioma', () => {
    expect(formatPlanPrice(1990, 'pt-BR')).toBe('R$ 19,90');
    expect(formatPlanPrice(19900, 'en')).toBe('R$199.00');
  });

  it('o aviso do Início: só cancelada e nos 3 dias antes do fim', () => {
    const end = '2026-12-22T13:00:00.000Z';
    expect(endingSoon(mine(end, false), NOW, 3)).toBe(end);
    expect(endingSoon(mine(end, true), NOW, 3)).toBeNull();
    expect(endingSoon(mine('2026-12-30T13:00:00.000Z', false), NOW, 3)).toBeNull();
    expect(endingSoon(mine('2026-12-19T13:00:00.000Z', false), NOW, 3)).toBeNull();
    expect(endingSoon(null, NOW, 3)).toBeNull();
  });
});
