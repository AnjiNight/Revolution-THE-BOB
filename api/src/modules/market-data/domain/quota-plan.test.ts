import { describe, expect, it } from 'vitest';
import { planCollection } from './quota-plan.js';

/**
 * Simula um ciclo inteiro: em cada dia, cada coleta pergunta ao plano se roda; quando roda, gasta
 * uma consulta por ativo. Devolve as consultas gastas e as coletas que rodaram em cada dia.
 */
function simulate(assets: number, available: number, days: number, slots: number) {
  let left = available;
  const ran: number[][] = [];
  for (let day = 0; day < days; day += 1) {
    const today: number[] = [];
    for (let slot = 0; slot < slots; slot += 1) {
      const decision = planCollection({
        assets,
        available: left,
        slotsPerDay: Array.from({ length: days - day }, () => slots),
        slotIndex: slot,
        doneToday: today.length,
      });
      if (!decision.run) continue;
      left -= assets;
      today.push(slot);
    }
    ran.push(today);
  }
  return { used: available - left, ran };
}

const plan = (assets: number, available: number, slotIndex = 0, days = 22) =>
  planCollection({
    assets,
    available,
    slotsPerDay: Array.from({ length: days }, () => 17),
    slotIndex,
    doneToday: 0,
  });

describe('regra do intervalo (SPEC-009 §4.2, CA03)', () => {
  it('com cota que sobra, coleta a cada 30 minutos', () => {
    const { ran } = simulate(30, 13_500, 22, 17);
    expect(ran.every((day) => day.length === 17)).toBe(true);
    expect(plan(30, 13_500, 3)).toEqual({ run: true, perDay: 17, intervalMinutes: 30 });
  });

  it('com 50 ativos: nunca passa da cota, usa quase toda e mantém o fechamento todo dia', () => {
    const { used, ran } = simulate(50, 13_500, 22, 17);
    expect(used).toBeLessThanOrEqual(13_500);
    expect(used).toBeGreaterThan(13_500 * 0.95);
    expect(ran.every((day) => day.includes(16))).toBe(true);
    // Cerca de 12 coletas por dia (a cada ~45 minutos), e não 17.
    expect(ran.every((day) => day.length >= 11 && day.length <= 14)).toBe(true);
    expect(plan(50, 13_500).intervalMinutes).toBe(45);
  });

  it('as coletas do dia ficam espaçadas, sem se amontoar no fim', () => {
    const { ran } = simulate(50, 13_500, 22, 17);
    for (const day of ran) {
      const gaps = day.slice(1).map((slot, i) => slot - (day[i] ?? 0));
      expect(Math.max(...gaps)).toBeLessThanOrEqual(2);
      expect(day[0]).toBeLessThanOrEqual(1);
    }
  });

  it('com muitos ativos para a cota, nunca passa dela, nem com 200 ativos', () => {
    for (const assets of [80, 120, 200]) {
      const { used, ran } = simulate(assets, 13_500, 22, 17);
      expect(used, String(assets)).toBeLessThanOrEqual(13_500);
      expect(
        ran.every((day) => day.includes(16)),
        String(assets),
      ).toBe(true);
    }
  });

  it('cota que não dá nem uma coleta por dia: só o fechamento, enquanto houver', () => {
    // 5 coletas de 50 ativos para 10 dias.
    const { used, ran } = simulate(50, 250, 10, 17);
    expect(used).toBe(250);
    expect(ran.map((day) => day.length)).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(ran.slice(0, 5).every((day) => day[0] === 16)).toBe(true);
  });

  it('sem ativos ou sem cota, não coleta', () => {
    expect(plan(0, 13_500, 16).run).toBe(false);
    expect(plan(10, 5, 16).run).toBe(false);
    expect(plan(10, -100, 16).run).toBe(false);
  });
});
