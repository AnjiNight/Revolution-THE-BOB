import { SCENARIO_MIN_OCCURRENCES, type PricePoint } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { computeScenarios, scenarioOutcome } from './scenarios.js';

/** Pregões seguidos a partir de 02/03/2026 (segunda), pulando sábado e domingo. */
function series(closes: readonly number[]): PricePoint[] {
  const points: PricePoint[] = [];
  const day = new Date('2026-03-02T12:00:00Z');
  for (const close of closes) {
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    points.push({ date: day.toISOString().slice(0, 10), close: close.toFixed(2) });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return points;
}

/** Notícia publicada às 10h de Brasília no dia do pregão. */
const at = (date: string, score: number) => ({
  publishedAt: new Date(`${date}T10:00:00-03:00`),
  score,
});

describe('cenários por sentimento (SPEC-031, DA21)', () => {
  it('classifica a variação pela faixa de estável de cada horizonte (CA02)', () => {
    // No pregão: ±1%; 5 pregões depois: ±2%; 20 pregões depois: ±4%.
    expect(scenarioOutcome('100.00', '101.50', 0)).toBe('up');
    expect(scenarioOutcome('100.00', '100.90', 0)).toBe('flat');
    expect(scenarioOutcome('100.00', '98.50', 0)).toBe('down');
    expect(scenarioOutcome('100.00', '101.50', 5)).toBe('flat');
    expect(scenarioOutcome('100.00', '97.90', 5)).toBe('down');
    expect(scenarioOutcome('100.00', '103.90', 20)).toBe('flat');
    expect(scenarioOutcome('100.00', '104.10', 20)).toBe('up');
  });

  it('o sentimento do pregão é a média das notícias, com os limites de 0,2 e a regra das 18h (CA01)', () => {
    const points = series([100, 100, 100, 100, 100, 100, 100]);
    const result = computeScenarios(
      points,
      [
        // 03/03: média (0,5 − 0,1) / 2 = 0,2: ainda neutro (só acima de 0,2 é positivo).
        at('2026-03-03', 0.5),
        at('2026-03-03', -0.1),
        // Terça às 19h: conta para quarta (04/03), que fica negativa.
        { publishedAt: new Date('2026-03-03T19:00:00-03:00'), score: -0.6 },
      ],
      '2026-03-02',
    );
    expect(result.newsSessions).toBe(2);
    expect(result.bands.neutral[0]?.occurrences).toBe(1);
    expect(result.bands.negative[0]?.occurrences).toBe(1);
    expect(result.bands.positive[0]?.occurrences).toBe(0);
  });

  it('conta o retorno sobre o fechamento anterior, na taxa-base e por faixa (CA02)', () => {
    // 41 pregões: o preço sobe 2% em cada pregão com notícia positiva e fica parado nos outros.
    const closes = [100];
    const positive: string[] = [];
    const points0 = series(Array(41).fill(100));
    for (let i = 1; i < 41; i += 1) {
      const isNews = i % 4 === 1; // 1, 5, 9, ... 37: 10 pregões com notícia
      closes.push((closes[i - 1] as number) * (isNews ? 1.02 : 1));
      if (isNews) positive.push((points0[i] as PricePoint).date);
    }
    const points = series(closes);
    const result = computeScenarios(
      points,
      positive.map((date) => at(date, 0.8)),
      (points[0] as PricePoint).date,
    );
    // No pregão: os 10 de notícia subiram 2% (> 1%); os outros 30 ficaram parados.
    const base0 = result.base[0];
    expect(base0).toMatchObject({ horizon: 0, occurrences: 40, insufficient: false });
    expect(base0?.up).toBeCloseTo(10 / 40);
    expect(base0?.flat).toBeCloseTo(30 / 40);
    expect(base0?.down).toBe(0);
    // Só 10 ocorrências positivas: abaixo de 30, sem as partes (RB31, CA03).
    expect(result.bands.positive[0]).toEqual({
      horizon: 0,
      occurrences: 10,
      insufficient: true,
      down: null,
      flat: null,
      up: null,
    });
    // 20 pregões depois só existe para os pregões até o 20º: 1, 5, 9, 13, 17 e o 21º pregão não.
    expect(result.bands.positive[2]?.occurrences).toBe(5);
    expect(result.base[2]?.occurrences).toBe(20);
    expect(result.period).toEqual({
      from: (points[1] as PricePoint).date,
      to: (points[40] as PricePoint).date,
      sessions: 40,
    });
    expect(SCENARIO_MIN_OCCURRENCES).toBe(30);
  });

  it('com 30 ou mais ocorrências, mostra as partes (CA03)', () => {
    const closes = Array.from({ length: 62 }, (_, i) => 100 * 0.97 ** Math.ceil(i / 2));
    // O preço cai 3% a cada dois pregões: nos pregões ímpares (1, 3, 5...) cai, nos pares fica.
    const points = series(closes);
    const odd = points.filter((_, i) => i % 2 === 1).map((p) => at(p.date, -0.7));
    const result = computeScenarios(points, odd, (points[0] as PricePoint).date);
    expect(result.bands.negative[0]).toMatchObject({
      occurrences: 31,
      insufficient: false,
      down: 1,
      flat: 0,
      up: 0,
    });
  });

  it('as notícias de depois do último fechamento são o pregão de hoje', () => {
    const points = series([100, 101]);
    const result = computeScenarios(
      points,
      [at('2026-03-04', -0.5), at('2026-03-04', -0.1), at('2026-03-03', 0.9)],
      '2026-03-02',
    );
    expect(result.today).toEqual({ band: 'negative', news: 2, score: -0.3 });
    expect(computeScenarios(points, [at('2026-03-03', 0.9)], '2026-03-02').today).toBeNull();
  });

  it('sem notícia classificada no banco, nada de período nem de ocorrências', () => {
    const points = series([100, 101, 102]);
    const result = computeScenarios(points, [], '2026-04-01');
    expect(result.period).toBeNull();
    expect(result.base.every((cell) => cell.occurrences === 0)).toBe(true);
  });
});
