import type { NewsSentiment } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { evaluate, hiddenReason, splitByTime, type LabeledSample } from './sentiment-evaluation.js';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const sample = (label: NewsSentiment, predicted: NewsSentiment | null, n = 0): LabeledSample => ({
  publishedAt: day(n),
  label,
  predicted,
});

describe('avaliação do modelo (SPEC-044 §4.1, decisão 3)', () => {
  it('separa no tempo: as 60% mais antigas para ajustar, as 40% mais novas para a nota', () => {
    const samples = [4, 0, 9, 2, 7, 1, 8, 3, 6, 5].map((n) => sample('neutral', 'neutral', n));
    const { tuning, test } = splitByTime(samples);
    expect(tuning.map((s) => s.publishedAt)).toEqual([0, 1, 2, 3, 4, 5].map(day));
    expect(test.map((s) => s.publishedAt)).toEqual([6, 7, 8, 9].map(day));
  });

  it('acerto total: acurácia e F1 macro 1', () => {
    const result = evaluate([
      sample('positive', 'positive'),
      sample('neutral', 'neutral'),
      sample('negative', 'negative'),
    ]);
    expect(result).toEqual({
      testSize: 3,
      accuracy: 1,
      macroF1: 1,
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    });
  });

  it('chamar tudo de neutro não parece bom na F1 macro', () => {
    const result = evaluate([
      ...Array.from({ length: 8 }, () => sample('neutral', 'neutral')),
      sample('positive', 'neutral'),
      sample('negative', 'neutral'),
    ]);
    expect(result.accuracy).toBe(0.8);
    // Neutro: precisão 0,8, revocação 1, F1 0,889; positivo e negativo: 0.
    expect(result.macroF1).toBe(0.296);
    expect(result.matrix).toEqual([
      [0, 1, 0],
      [0, 8, 0],
      [0, 1, 0],
    ]);
  });

  it('ignora as notícias que a versão ainda não classificou', () => {
    const result = evaluate([sample('positive', 'positive'), sample('negative', null)]);
    expect(result.testSize).toBe(1);
    // A classe que não aparece nem no rótulo nem na resposta não entra na média.
    expect(result.macroF1).toBe(1);
  });

  it('sem nada classificado, zero', () => {
    expect(evaluate([])).toMatchObject({ testSize: 0, accuracy: 0, macroF1: 0 });
  });

  it('o usuário só vê com 60 de teste e F1 macro de 0,60 (decisão 4)', () => {
    expect(hiddenReason(null)).toBe('no_model');
    expect(hiddenReason({ evaluation: null })).toBe('not_evaluated');
    expect(hiddenReason({ evaluation: { testSize: 59, macroF1: 0.9 } })).toBe('few_tests');
    expect(hiddenReason({ evaluation: { testSize: 60, macroF1: 0.599 } })).toBe('low_score');
    expect(hiddenReason({ evaluation: { testSize: 60, macroF1: 0.6 } })).toBeNull();
  });
});
