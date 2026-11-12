import type {
  AllocationClass,
  ComparisonPoint,
  IsoDate,
  PortfolioAllocation,
  SectorCode,
} from '@simulador/shared';

/**
 * Comparação de carteiras (SPEC-022 §4.2): o que a tela monta a partir da resposta do servidor,
 * sem conta de dinheiro (os números já vêm prontos, em decimal).
 */

/** Os marcadores das linhas, um por carteira, para não depender só da cor (RNF18). */
export const SERIES_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type SeriesShape = (typeof SERIES_SHAPES)[number];

/** Uma linha da tabela da composição: a % de cada carteira, ou `null` ("—"). */
export type CompositionRow =
  | { kind: 'class'; assetClass: AllocationClass['kind']; values: Array<string | null> }
  | {
      kind: 'sector';
      assetClass: 'stock' | 'fii';
      sector: SectorCode;
      values: Array<string | null>;
    };

const CLASS_ORDER: ReadonlyArray<AllocationClass['kind']> = ['stock', 'fii', 'cash'];

/**
 * §4.1, decisão 5: as classes (Ações, FIIs, Caixa) e, embaixo de Ações e de FIIs, os setores ou
 * segmentos, nas linhas; as carteiras nas colunas, em % de cada uma. Só entra o que alguma carteira
 * tem. Os setores vão do maior para o menor (pela maior % entre as carteiras), "Outros" no fim.
 */
export function compositionRows(allocations: readonly PortfolioAllocation[]): CompositionRow[] {
  const rows: CompositionRow[] = [];
  for (const assetClass of CLASS_ORDER) {
    const classes = allocations.map((allocation) =>
      allocation.classes.find((item) => item.kind === assetClass),
    );
    if (classes.every((item) => item === undefined)) continue;
    rows.push({ kind: 'class', assetClass, values: classes.map((item) => item?.percent ?? null) });
    if (assetClass === 'cash') continue;

    const sectors = new Map<SectorCode, Array<string | null>>();
    classes.forEach((item, column) => {
      for (const sector of item?.sectors ?? []) {
        const values =
          sectors.get(sector.sector) ?? Array<string | null>(allocations.length).fill(null);
        values[column] = sector.percent;
        sectors.set(sector.sector, values);
      }
    });
    const largest = (values: ReadonlyArray<string | null>) =>
      Math.max(...values.map((value) => (value === null ? 0 : Number(value))));
    const ordered = [...sectors].sort(([a, first], [b, second]) => {
      if ((a === 'outros') !== (b === 'outros')) return a === 'outros' ? 1 : -1;
      return largest(second) - largest(first) || a.localeCompare(b);
    });
    for (const [sector, values] of ordered) {
      rows.push({ kind: 'sector', assetClass, sector, values });
    }
  }
  return rows;
}

/** A rentabilidade da carteira em cada dia do gráfico; `null` onde ela não tem ponto. */
export function alignSeries(
  days: readonly IsoDate[],
  series: readonly ComparisonPoint[],
): Array<string | null> {
  const byDate = new Map(series.map((point) => [point.date, point.return]));
  return days.map((day) => byDate.get(day) ?? null);
}

/**
 * Onde desenhar os marcadores de uma linha: uns poucos pontos espalhados (cada carteira um pouco
 * deslocada, para os marcadores não se cobrirem) e sempre o último.
 */
export function markerSpots(
  values: ReadonlyArray<string | null>,
  series: number,
  total: number,
  count = 6,
): number[] {
  const defined = values.flatMap((value, index) => (value === null ? [] : [index]));
  if (defined.length === 0) return [];
  const spots = new Set<number>();
  const step = defined.length / count;
  const offset = (series + 1) / (total + 1);
  for (let k = 0; k < count; k += 1) {
    const position = Math.floor((k + offset) * step);
    if (position < defined.length) spots.add(defined[position] as number);
  }
  spots.add(defined.at(-1) as number);
  return [...spots].sort((a, b) => a - b);
}
