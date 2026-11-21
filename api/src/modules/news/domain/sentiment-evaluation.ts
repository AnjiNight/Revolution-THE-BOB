import {
  NEWS_SENTIMENTS,
  SENTIMENT_MIN_F1,
  SENTIMENT_MIN_TEST,
  SENTIMENT_TEST_SHARE,
  type NewsSentiment,
  type SentimentHiddenReason,
} from '@simulador/shared';

/**
 * Avaliação de uma versão do modelo contra a amostra rotulada (SPEC-044 §4.1, decisão 3). Pura
 * (DA10): a divisão no tempo, a acurácia, a F1 macro e a tabela de erros.
 */

export interface LabeledSample {
  publishedAt: Date;
  label: NewsSentiment;
  /** O que a versão disse, ou `null` se ela ainda não classificou a notícia. */
  predicted: NewsSentiment | null;
}

export interface SampleSplit<T> {
  /** As mais antigas: para ajustar o dicionário. */
  tuning: T[];
  /** As mais novas: para a nota. */
  test: T[];
}

/** Separa no tempo, sem embaralhar (DA20): as 60% mais antigas e as 40% mais novas. */
export function splitByTime<T extends { publishedAt: Date }>(
  samples: readonly T[],
): SampleSplit<T> {
  const sorted = [...samples].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const cut = Math.floor(sorted.length * (1 - SENTIMENT_TEST_SHARE));
  return { tuning: sorted.slice(0, cut), test: sorted.slice(cut) };
}

export interface EvaluationResult {
  testSize: number;
  accuracy: number;
  macroF1: number;
  /** Linhas: o rótulo; colunas: o modelo; na ordem de `NEWS_SENTIMENTS`. */
  matrix: number[][];
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Só as notícias que a versão classificou contam. */
export function evaluate(test: readonly LabeledSample[]): EvaluationResult {
  const index = (sentiment: NewsSentiment) => NEWS_SENTIMENTS.indexOf(sentiment);
  const matrix = NEWS_SENTIMENTS.map(() => NEWS_SENTIMENTS.map(() => 0));
  let size = 0;
  for (const sample of test) {
    if (!sample.predicted) continue;
    const row = matrix[index(sample.label)] as number[];
    row[index(sample.predicted)] = (row[index(sample.predicted)] as number) + 1;
    size += 1;
  }
  const cell = (row: number, column: number) => (matrix[row] as number[])[column] as number;
  const correct = NEWS_SENTIMENTS.reduce((sum, _s, i) => sum + cell(i, i), 0);
  // F1 de cada classe que aparece no rótulo ou na resposta; a que não aparece em nenhum não conta.
  const scores: number[] = [];
  NEWS_SENTIMENTS.forEach((_s, i) => {
    const actual = NEWS_SENTIMENTS.reduce((sum, _t, j) => sum + cell(i, j), 0);
    const predicted = NEWS_SENTIMENTS.reduce((sum, _t, j) => sum + cell(j, i), 0);
    if (actual === 0 && predicted === 0) return;
    const hit = cell(i, i);
    const precision = predicted === 0 ? 0 : hit / predicted;
    const recall = actual === 0 ? 0 : hit / actual;
    scores.push(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall));
  });
  return {
    testSize: size,
    accuracy: size === 0 ? 0 : round(correct / size),
    macroF1: scores.length === 0 ? 0 : round(scores.reduce((a, b) => a + b, 0) / scores.length),
    matrix,
  };
}

/** Por que o usuário não vê o sentimento da versão em uso, ou `null` se ele vê (decisão 4). */
export function hiddenReason(
  current: { evaluation: { testSize: number; macroF1: number } | null } | null,
): SentimentHiddenReason | null {
  if (!current) return 'no_model';
  if (!current.evaluation) return 'not_evaluated';
  if (current.evaluation.testSize < SENTIMENT_MIN_TEST) return 'few_tests';
  if (current.evaluation.macroF1 < SENTIMENT_MIN_F1) return 'low_score';
  return null;
}
