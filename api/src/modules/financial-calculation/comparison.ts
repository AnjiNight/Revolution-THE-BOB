import type { ComparisonPeriod, IsoDate, PerformancePeriod } from '@simulador/shared';
import { periodStart } from './price-history.js';

/**
 * Comparação de carteiras (SPEC-022), no núcleo puro (DA10). A conta de cada carteira é a da
 * SPEC-019; aqui ficam só as regras novas: o período "Em comum", o dia-base das referências, o mesmo
 * para todas, e os dias do gráfico.
 */

/**
 * Início do período da rentabilidade (SPEC-019): o mesmo dia N meses antes (como a ficha, SPEC-010),
 * 1º de janeiro, ou o início da carteira.
 */
export function performanceStart(
  period: PerformancePeriod,
  today: IsoDate,
  start: IsoDate,
): IsoDate {
  if (period === 'all') return start;
  if (period === 'ytd') return `${today.slice(0, 4)}-01-01`;
  return periodStart(today, period === '12m' ? '1y' : period) ?? start;
}

/**
 * §4.1, decisão 4: "Em comum" é o trecho em que todas existem, do início da carteira mais nova até
 * hoje. Com uma carteira criada hoje, o período é só hoje.
 */
export function commonStart(starts: readonly IsoDate[]): IsoDate {
  const latest = [...starts].sort().at(-1);
  if (latest === undefined) throw new RangeError('a comparação precisa de carteiras');
  return latest;
}

/**
 * O início do período da comparação, o mesmo para todas as carteiras. Nos períodos da SPEC-019,
 * "Desde o início" é o da carteira mais antiga; a que começou depois conta desde o próprio início.
 */
export function comparisonStart(
  period: ComparisonPeriod,
  today: IsoDate,
  starts: readonly IsoDate[],
): IsoDate {
  if (period === 'common') return commonStart(starts);
  const earliest = [...starts].sort()[0];
  if (earliest === undefined) throw new RangeError('a comparação precisa de carteiras');
  return performanceStart(period, today, earliest);
}

/**
 * §4.2: as referências contam do mesmo dia-base para todas: o mais antigo entre os das carteiras
 * (o pregão antes do início do período, se alguma já tinha patrimônio; em "Desde o início", o da
 * carteira mais antiga). `null` sem carteira com lançamento.
 */
export function sharedBaseDate(bases: ReadonlyArray<IsoDate | null>): IsoDate | null {
  let earliest: IsoDate | null = null;
  for (const base of bases) {
    if (base !== null && (earliest === null || base < earliest)) earliest = base;
  }
  return earliest;
}

/** Os dias do gráfico: os de todas as carteiras, sem repetir, em ordem. */
export function chartDays(series: ReadonlyArray<readonly IsoDate[]>): IsoDate[] {
  return [...new Set(series.flat())].sort();
}
