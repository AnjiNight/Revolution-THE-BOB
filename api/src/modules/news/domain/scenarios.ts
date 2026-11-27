import {
  newsReferenceDay,
  NEWS_SENTIMENTS,
  SCENARIO_HORIZONS,
  SCENARIO_MIN_OCCURRENCES,
  SCENARIO_STABLE_LIMIT,
  sentimentBand,
  type IsoDate,
  type NewsSentiment,
  type PricePoint,
  type ScenarioCell,
  type ScenarioHorizon,
  type ScenarioToday,
} from '@simulador/shared';

/**
 * Cenários por sentimento (SPEC-031, DA21): contar o que o preço fez depois dos pregões em que o
 * sentimento das notícias sobre o ativo foi positivo, neutro ou negativo, e em todos os pregões
 * (a taxa-base). Função pura: recebe a série ajustada e as notícias oficiais já classificadas.
 */

export interface ScenarioNews {
  publishedAt: Date;
  /** Pontuação da notícia, de −1 a 1 (SPEC-044). */
  score: number;
}

export interface ScenarioResult {
  bands: Record<NewsSentiment, ScenarioCell[]>;
  base: ScenarioCell[];
  /** Pregões com notícia no período. */
  newsSessions: number;
  /** Os pregões do período (o primeiro e o último fechamento usados, e quantos). */
  period: { from: IsoDate; to: IsoDate; sessions: number } | null;
  /** O pregão depois do último fechamento: as notícias que ainda não têm preço. */
  today: ScenarioToday | null;
}

type Outcome = 'down' | 'flat' | 'up';

/** Variação do fechamento anterior até o do horizonte, classificada pela faixa de estável. */
export function scenarioOutcome(before: string, after: string, horizon: ScenarioHorizon): Outcome {
  const change = (Number(after) / Number(before) - 1) * 100;
  const limit = SCENARIO_STABLE_LIMIT[horizon];
  if (change > limit) return 'up';
  if (change < -limit) return 'down';
  return 'flat';
}

/** O índice do primeiro pregão no dia ou depois (`points` em ordem); `-1` se não há. */
function sessionIndex(points: readonly PricePoint[], day: IsoDate): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((points[middle] as PricePoint).date < day) low = middle + 1;
    else high = middle;
  }
  return low < points.length ? low : -1;
}

function cells(counts: ReadonlyMap<ScenarioHorizon, Record<Outcome, number>>): ScenarioCell[] {
  return SCENARIO_HORIZONS.map((horizon) => {
    const c = counts.get(horizon) ?? { down: 0, flat: 0, up: 0 };
    const occurrences = c.down + c.flat + c.up;
    const insufficient = occurrences < SCENARIO_MIN_OCCURRENCES;
    return {
      horizon,
      occurrences,
      insufficient,
      down: insufficient ? null : c.down / occurrences,
      flat: insufficient ? null : c.flat / occurrences,
      up: insufficient ? null : c.up / occurrences,
    };
  });
}

/**
 * `points`: a série ajustada do ativo, em ordem de data. `news`: as notícias oficiais em que o
 * ativo é principal ou citado, classificadas pela versão em uso. `from`: o primeiro dia do
 * período (o da primeira notícia oficial classificada no banco).
 */
export function computeScenarios(
  points: readonly PricePoint[],
  news: readonly ScenarioNews[],
  from: IsoDate,
): ScenarioResult {
  // O pregão de cada notícia (a regra das 18h da SPEC-029); as de depois do último fechamento são
  // do pregão de hoje, que ainda não tem preço.
  const bySession = new Map<number, number[]>();
  const pending: number[] = [];
  for (const item of news) {
    const index = sessionIndex(points, newsReferenceDay(item.publishedAt));
    if (index < 0) pending.push(item.score);
    else bySession.set(index, [...(bySession.get(index) ?? []), item.score]);
  }
  const mean = (scores: readonly number[]) => scores.reduce((a, b) => a + b, 0) / scores.length;

  const start = Math.max(1, sessionIndex(points, from));
  const empty = () =>
    new Map<ScenarioHorizon, Record<Outcome, number>>(
      SCENARIO_HORIZONS.map((h) => [h, { down: 0, flat: 0, up: 0 }]),
    );
  const byBand = Object.fromEntries(NEWS_SENTIMENTS.map((band) => [band, empty()])) as Record<
    NewsSentiment,
    ReturnType<typeof empty>
  >;
  const base = empty();
  let newsSessions = 0;
  const firstIndex = sessionIndex(points, from);

  if (firstIndex >= 0) {
    for (let i = start; i < points.length; i += 1) {
      const before = (points[i - 1] as PricePoint).close;
      const scores = bySession.get(i);
      const band = scores ? sentimentBand(mean(scores)) : null;
      if (band) newsSessions += 1;
      for (const horizon of SCENARIO_HORIZONS) {
        const after = points[i + horizon]?.close;
        // O preço do horizonte ainda não existe: o pregão não conta para ele.
        if (!after) continue;
        const outcome = scenarioOutcome(before, after, horizon);
        (base.get(horizon) as Record<Outcome, number>)[outcome] += 1;
        if (band) (byBand[band].get(horizon) as Record<Outcome, number>)[outcome] += 1;
      }
    }
  }

  const last = points.at(-1);
  const first = firstIndex >= 0 ? points[start] : undefined;
  return {
    bands: {
      positive: cells(byBand.positive),
      neutral: cells(byBand.neutral),
      negative: cells(byBand.negative),
    },
    base: cells(base),
    newsSessions,
    period:
      first && last && first.date <= last.date
        ? { from: first.date, to: last.date, sessions: points.length - start }
        : null,
    today:
      pending.length > 0
        ? { band: sentimentBand(mean(pending)), news: pending.length, score: mean(pending) }
        : null,
  };
}
