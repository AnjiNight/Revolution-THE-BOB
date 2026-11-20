import { addDays, type AssetNewsDay, type PricePoint } from '@simulador/shared';

/** Pregões à frente na segunda medida do painel (SPEC-029 §4.1, decisão 4). */
export const REACTION_SESSIONS = 5;

/**
 * Liga cada dia de referência ao primeiro pregão do gráfico nesse dia ou depois (SPEC-029 §4.1,
 * decisão 3): fim de semana e feriado passam para o próximo pregão. Fica de fora o que é anterior
 * ao primeiro pregão (o pregão dele está fora do período) e o que vem depois do último (o pregão
 * ainda não aconteceu). Devolve o índice do pregão → quantas notícias.
 */
export function newsSessions(
  points: readonly PricePoint[],
  days: readonly Pick<AssetNewsDay, 'day' | 'count'>[],
): Map<number, number> {
  const sessions = new Map<number, number>();
  const first = points[0]?.date;
  if (!first) return sessions;
  let index = 0;
  for (const { day, count } of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    if (day < first) continue;
    while (index < points.length && (points[index]?.date ?? '') < day) index += 1;
    if (index >= points.length) break;
    sessions.set(index, (sessions.get(index) ?? 0) + count);
  }
  return sessions;
}

/**
 * Os dias de referência do pregão `index`: depois do pregão anterior até o próprio pregão. No
 * primeiro pregão do gráfico, só o dia dele (como os marcadores).
 */
export function sessionRange(
  points: readonly PricePoint[],
  index: number,
): { after: string; until: string } | null {
  const until = points[index]?.date;
  if (!until) return null;
  return { after: points[index - 1]?.date ?? addDays(until, -1), until };
}

/** Variação em %, com 2 casas, como as outras da ficha (`formatChange`). */
function change(before: string, after: string): string {
  const ratio = Number(after) / Number(before) - 1;
  return (Math.round(ratio * 10_000) / 100).toFixed(2);
}

export interface PriceReaction {
  /** Fechamento do pregão sobre o anterior; `null` no primeiro pregão do gráfico. */
  session: string | null;
  /** Fechamento 5 pregões à frente sobre o anterior; `null` se ainda não há 5 pregões. */
  later: string | null;
}

/** O que o preço fez a partir do pregão da notícia (SPEC-029 §4.1, decisão 4). */
export function priceReaction(points: readonly PricePoint[], index: number): PriceReaction {
  const before = points[index - 1]?.close;
  const close = points[index]?.close;
  const later = points[index + REACTION_SESSIONS]?.close;
  if (!before || !close) return { session: null, later: null };
  return { session: change(before, close), later: later ? change(before, later) : null };
}

/** O próximo (ou o anterior) pregão com notícia a partir de `from`; `null` se não houver. */
export function nextNewsSession(
  sessions: ReadonlyMap<number, number>,
  from: number,
  direction: 1 | -1,
): number | null {
  const indexes = [...sessions.keys()].sort((a, b) => a - b);
  const found =
    direction === 1
      ? indexes.find((index) => index > from)
      : indexes.reverse().find((index) => index < from);
  return found ?? null;
}
