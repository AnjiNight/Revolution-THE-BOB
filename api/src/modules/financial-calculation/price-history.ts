import {
  isoDate,
  type IsoDate,
  type PriceExtreme,
  type PriceHistoryPeriod,
  type PriceJump,
  type PricePoint,
  type PriceSummary,
} from '@simulador/shared';
import { compareDecimals, percentChange, toMicros } from './decimal.js';

const PERIOD_MONTHS: Readonly<Record<Exclude<PriceHistoryPeriod, 'max'>, number>> = {
  '1m': 1,
  '6m': 6,
  '1y': 12,
  '5y': 60,
};

/** Salto: fechamento pelo menos 1,8 vez maior ou menor que o anterior (SPEC-010, decisão 1). */
const JUMP_FACTOR_TENTHS = 18n;

/**
 * Início do período que termina em `end`, o último fechamento guardado (SPEC-010 §4.2): o mesmo
 * dia, N meses antes. Sem esse dia no mês (31/03 menos 1 mês), o último dia do mês. Tudo: `null`.
 */
export function periodStart(end: IsoDate, period: PriceHistoryPeriod): IsoDate | null {
  if (period === 'max') return null;
  const [year = 0, month = 1, day = 1] = end.split('-').map(Number);
  const months = year * 12 + (month - 1) - PERIOD_MONTHS[period];
  const startYear = Math.floor(months / 12);
  const startMonth = (months % 12) + 1;
  // Dia 0 do mês seguinte é o último dia deste.
  const lastDay = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
  return isoDate(startYear, startMonth, Math.min(day, lastDay));
}

/** O fechamento ficou pelo menos 1,8 vez maior ou menor que o do pregão anterior. */
export function isPriceJump(previous: string, close: string): boolean {
  const before = toMicros(previous);
  const after = toMicros(close);
  return after * 10n >= before * JUMP_FACTOR_TENTHS || before * 10n >= after * JUMP_FACTOR_TENTHS;
}

/**
 * Resumo do período (SPEC-010 §4.2), em decimal (RNF12): variação do primeiro ao último
 * fechamento, mínima e máxima (no empate, a data mais antiga) e os saltos entre pregões seguidos.
 * Com salto no período, a variação não é calculada. Com menos de dois pregões, sem resumo.
 */
export function summarizePeriod(points: readonly PricePoint[]): {
  summary: PriceSummary | null;
  jumps: PriceJump[];
} {
  const jumps: PriceJump[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1] as PricePoint;
    const current = points[i] as PricePoint;
    if (isPriceJump(previous.close, current.close)) {
      jumps.push({ date: current.date, change: percentChange(current.close, previous.close) });
    }
  }
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return { summary: null, jumps };

  let min: PriceExtreme = { date: first.date, price: first.close };
  let max: PriceExtreme = { ...min };
  for (const point of points) {
    if (compareDecimals(point.close, min.price) < 0) min = { date: point.date, price: point.close };
    if (compareDecimals(point.close, max.price) > 0) max = { date: point.date, price: point.close };
  }
  const change = jumps.length > 0 ? null : percentChange(last.close, first.close);
  return { summary: { change, min, max }, jumps };
}
