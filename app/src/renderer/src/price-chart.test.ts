import { describe, expect, it } from 'vitest';
import {
  chartLayout,
  cursorAfterKey,
  nearestIndex,
  niceStep,
  spaceTicks,
  timeTicks,
  valueAxis,
} from './price-chart';

/** Pregões de segunda a sexta, a partir de uma data. */
function weekdays(from: string, count: number): string[] {
  const dates: string[] = [];
  for (
    let day = new Date(`${from}T00:00:00Z`);
    dates.length < count;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

describe('eixo dos preços', () => {
  it('passos redondos', () => {
    expect(niceStep(4.31, 4)).toBe(2);
    expect(niceStep(0.12, 4)).toBe(0.05);
    expect(niceStep(1000, 4)).toBe(250);
    expect(niceStep(40, 4)).toBe(10);
  });

  it('do passo abaixo da mínima ao passo acima da máxima', () => {
    expect(valueAxis(49.1, 53.66)).toEqual({ low: 48, high: 54, step: 2, ticks: [48, 50, 52, 54] });
    expect(valueAxis(8.84, 8.96).ticks).toEqual([8.8, 8.85, 8.9, 8.95, 9]);
  });

  it('preço parado no período ainda tem eixo', () => {
    const axis = valueAxis(10, 10);
    expect(axis.low).toBeLessThan(10);
    expect(axis.high).toBeGreaterThan(10);
  });
});

describe('datas do eixo', () => {
  it('período curto: um a cada 5 pregões, a partir do primeiro', () => {
    const ticks = timeTicks(weekdays('2026-10-01', 21));
    expect(ticks.map((tick) => tick.index)).toEqual([0, 5, 10, 15, 20]);
    expect(ticks.every((tick) => tick.unit === 'day')).toBe(true);
  });

  it('1 ano: o primeiro pregão de cada mês, sem marcar o começo no meio do mês', () => {
    const ticks = timeTicks(weekdays('2025-10-30', 262));
    expect(ticks[0]).toMatchObject({ date: '2025-11-03', unit: 'month' });
    expect(ticks.map((tick) => tick.date.slice(0, 7))).toContain('2026-01');
  });

  it('5 anos ou mais: o primeiro pregão de cada ano', () => {
    const ticks = timeTicks(weekdays('2021-10-29', 1300));
    expect(ticks.map((tick) => tick.date)).toEqual([
      '2022-01-03',
      '2023-01-02',
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ]);
  });

  it('marcas apertadas demais saem', () => {
    const ticks = timeTicks(weekdays('2026-10-01', 21));
    expect(spaceTicks(ticks, (index) => index * 4, 30).map((tick) => tick.index)).toEqual([
      0, 10, 20,
    ]);
  });
});

describe('desenho e cursor', () => {
  const points = [
    { date: '2026-10-28', close: '50' },
    { date: '2026-10-29', close: '54' },
    { date: '2026-10-30', close: '52' },
  ];

  it('a linha vai de ponta a ponta da área, com o maior preço no alto', () => {
    const layout = chartLayout(points, 400, 240);
    expect(layout.x(0)).toBe(layout.box.left);
    expect(layout.x(2)).toBe(layout.box.right);
    expect(layout.y(54)).toBeLessThan(layout.y(50));
    expect(layout.line.startsWith('M')).toBe(true);
    expect(layout.area.endsWith('Z')).toBe(true);
  });

  it('o pregão mais perto do mouse, sem sair das pontas', () => {
    const { box } = chartLayout(points, 400, 240);
    expect(nearestIndex(box.left - 50, 3, box)).toBe(0);
    expect(nearestIndex((box.left + box.right) / 2 + 1, 3, box)).toBe(1);
    expect(nearestIndex(box.right + 50, 3, box)).toBe(2);
  });

  it('teclado: setas, Page Up e Page Down, Home e End; começa no último pregão', () => {
    expect(cursorAfterKey('ArrowLeft', null, 100)).toBe(98);
    expect(cursorAfterKey('ArrowRight', null, 100)).toBe(99);
    expect(cursorAfterKey('ArrowRight', 99, 100)).toBe(99);
    expect(cursorAfterKey('ArrowLeft', 0, 100)).toBe(0);
    expect(cursorAfterKey('PageDown', 50, 100)).toBe(29);
    expect(cursorAfterKey('PageUp', 90, 100)).toBe(99);
    expect(cursorAfterKey('Home', 50, 100)).toBe(0);
    expect(cursorAfterKey('End', 5, 100)).toBe(99);
    expect(cursorAfterKey('a', 5, 100)).toBeNull();
    expect(cursorAfterKey('Home', null, 0)).toBeNull();
  });
});
