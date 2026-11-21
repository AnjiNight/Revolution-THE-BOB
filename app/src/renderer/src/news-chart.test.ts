import { describe, expect, it } from 'vitest';
import { newsSessions, nextNewsSession, priceReaction, sessionRange } from './news-chart';

// Pregões de segunda 09/11 a sexta 20/11/2026, sem feriado no meio (a sexta 13 é pregão).
const points = [
  ['2026-11-09', '30.00'],
  ['2026-11-10', '30.60'],
  ['2026-11-11', '31.00'],
  ['2026-11-12', '30.38'],
  ['2026-11-13', '31.20'],
  ['2026-11-16', '31.50'],
  ['2026-11-17', '30.90'],
  ['2026-11-18', '32.00'],
].map(([date, close]) => ({ date: date as string, close: close as string }));

describe('pregão de cada notícia (SPEC-029 §4.1, decisão 3)', () => {
  it('o dia vai para o primeiro pregão nesse dia ou depois; fim de semana passa para a segunda', () => {
    const sessions = newsSessions(points, [
      { day: '2026-11-11', count: 2 },
      { day: '2026-11-14', count: 1 },
      { day: '2026-11-15', count: 2 },
      { day: '2026-11-16', count: 1 },
    ]);
    expect([...sessions]).toEqual([
      [2, 2],
      [5, 4],
    ]);
  });

  it('antes do primeiro pregão e depois do último ficam de fora; sem pontos, nada', () => {
    expect([
      ...newsSessions(points, [
        { day: '2026-11-08', count: 3 },
        { day: '2026-11-09', count: 1 },
        { day: '2026-11-19', count: 2 },
      ]),
    ]).toEqual([[0, 1]]);
    expect(newsSessions([], [{ day: '2026-11-09', count: 1 }]).size).toBe(0);
  });

  it('o painel pede os dias depois do pregão anterior até o pregão', () => {
    expect(sessionRange(points, 5)).toEqual({ after: '2026-11-13', until: '2026-11-16' });
    expect(sessionRange(points, 0)).toEqual({ after: '2026-11-08', until: '2026-11-09' });
    expect(sessionRange(points, 99)).toBeNull();
  });
});

describe('o que o preço fez depois (SPEC-029 §4.1, decisão 4)', () => {
  it('no pregão e 5 pregões depois, sobre o fechamento anterior', () => {
    // 31,00 / 30,60 − 1 = +1,31%; 32,00 / 30,60 − 1 = +4,58% (a quarta 11 → a quarta 18).
    expect(priceReaction(points, 2)).toEqual({ session: '1.31', later: '4.58' });
    // 30,38 / 31,00 − 1 = −2,00%.
    expect(priceReaction(points, 3)).toMatchObject({ session: '-2.00' });
  });

  it('sem 5 pregões à frente: só o do pregão; no primeiro pregão, nenhum', () => {
    expect(priceReaction(points, 5)).toEqual({ session: '0.96', later: null });
    expect(priceReaction(points, 0)).toEqual({ session: null, later: null });
  });
});

describe('pular de um pregão com notícia para outro (N e Shift+N)', () => {
  const sessions = new Map([
    [2, 1],
    [5, 3],
    [7, 1],
  ]);
  it('o próximo e o anterior; sem mais nenhum, null', () => {
    expect(nextNewsSession(sessions, 2, 1)).toBe(5);
    expect(nextNewsSession(sessions, 3, -1)).toBe(2);
    expect(nextNewsSession(sessions, 7, 1)).toBeNull();
    expect(nextNewsSession(sessions, 2, -1)).toBeNull();
  });
});
