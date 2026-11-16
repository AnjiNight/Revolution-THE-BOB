import { centsToAmount, type AssetClass, type SectorCode } from '@simulador/shared';
import { toCents } from './cash-ledger.js';
import { divideHalfUp, toMicros } from './decimal.js';

/**
 * Distribuição da carteira por classe, setor e ativo (SPEC-021), em centavos (RNF12): pura, recebe
 * as posições valorizadas e o caixa.
 */

export interface AllocationPosition {
  assetId: string;
  ticker: string;
  assetClass: AssetClass;
  sector: SectorCode;
  quantity: number;
  /** Preço médio com 6 casas, para o custo do ativo sem preço. */
  averagePrice: string;
  /** Valor de mercado das posições (SPEC-014); `null` sem nenhum preço. */
  marketValue: string | null;
}

export interface AllocationAsset {
  assetId: string;
  ticker: string;
  value: string;
  /** % da carteira. */
  percent: string;
}

export interface AllocationSector {
  sector: SectorCode;
  value: string;
  percent: string;
  percentOfClass: string;
  assets: AllocationAsset[];
}

export interface AllocationClass {
  kind: AssetClass | 'cash';
  value: string;
  percent: string;
  /** Só em Ações e FIIs. */
  sectors?: AllocationSector[];
}

export interface Allocation {
  /** Caixa positivo + ativos. */
  total: string;
  /** Ações, FIIs e Caixa, só as que têm valor. */
  classes: AllocationClass[];
  /** Ativos sem nenhum preço, que entraram pelo custo (§4.1, decisão 2). */
  atCost: string[];
  /** O caixa negativo, que fica fora das barras e das %; `null` sem ele. */
  negativeCash: string | null;
}

const CLASS_ORDER: ReadonlyArray<AssetClass> = ['stock', 'fii'];

export function allocation(input: {
  cash: string;
  positions: readonly AllocationPosition[];
}): Allocation {
  const cash = toCents(input.cash);
  const atCost: string[] = [];
  const valued = input.positions.map((position) => {
    if (position.marketValue !== null) return { ...position, cents: toCents(position.marketValue) };
    atCost.push(position.ticker);
    const cost = divideHalfUp(toMicros(position.averagePrice) * BigInt(position.quantity), 10_000n);
    return { ...position, cents: cost };
  });
  const assetsTotal = valued.reduce((sum, position) => sum + position.cents, 0n);
  const total = assetsTotal + (cash > 0n ? cash : 0n);
  const percent = (value: bigint, of: bigint) =>
    of > 0n ? centsToAmount(divideHalfUp(value * 10_000n, of)) : '0.00';

  const classes: AllocationClass[] = [];
  for (const kind of CLASS_ORDER) {
    const own = valued.filter((position) => position.assetClass === kind);
    const classValue = own.reduce((sum, position) => sum + position.cents, 0n);
    if (own.length === 0 || classValue <= 0n) continue;
    const bySector = new Map<SectorCode, typeof own>();
    for (const position of own) {
      bySector.set(position.sector, [...(bySector.get(position.sector) ?? []), position]);
    }
    const sectors = [...bySector].map(([sector, items]) => {
      const value = items.reduce((sum, position) => sum + position.cents, 0n);
      return {
        cents: value,
        sector,
        value: centsToAmount(value),
        percent: percent(value, total),
        percentOfClass: percent(value, classValue),
        assets: [...items]
          .sort((a, b) => compareDesc(a.cents, b.cents) || a.ticker.localeCompare(b.ticker))
          .map((position) => ({
            assetId: position.assetId,
            ticker: position.ticker,
            value: centsToAmount(position.cents),
            percent: percent(position.cents, total),
          })),
      };
    });
    // Do maior para o menor; "Outros" sempre no fim (§4.2).
    sectors.sort(
      (a, b) =>
        Number(a.sector === 'outros') - Number(b.sector === 'outros') ||
        compareDesc(a.cents, b.cents) ||
        a.sector.localeCompare(b.sector),
    );
    classes.push({
      kind,
      value: centsToAmount(classValue),
      percent: percent(classValue, total),
      sectors: sectors.map(({ cents: _cents, ...sector }) => sector),
    });
  }
  if (cash > 0n)
    classes.push({ kind: 'cash', value: centsToAmount(cash), percent: percent(cash, total) });

  return {
    total: centsToAmount(total),
    classes,
    atCost: atCost.sort(),
    negativeCash: cash < 0n ? centsToAmount(cash) : null,
  };
}

function compareDesc(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? -1 : 1;
}
