import { centsToAmount, type IsoDate } from '@simulador/shared';
import { toCents } from './cash-ledger.js';
import { divideHalfUp } from './decimal.js';
import type { DailyClose } from './performance.js';

/**
 * Referências do mercado no período (SPEC-020), em inteiros (RNF12): a rentabilidade acumulada do
 * CDI, do Ibovespa e do IFIX em cada ponto do gráfico da rentabilidade (SPEC-019), desde o mesmo
 * dia-base da cota.
 */

/** Taxa do CDI de um dia, como o Banco Central publica: % ao dia com até 6 casas ("0.055131"). */
export interface CdiRate {
  date: IsoDate;
  rate: string;
}

export interface BenchmarkInput {
  /** O dia em que a referência vale 0% (§4.2). */
  base: IsoDate;
  /** Os dias dos pontos, em ordem, todos depois do dia-base ou iguais a ele. */
  days: readonly IsoDate[];
}

export interface BenchmarkSeries {
  /** Rentabilidade acumulada em cada ponto, em % com 2 casas; `null` sem dado até o ponto. */
  points: Array<string | null>;
  /** O mesmo, como fator exato desde o dia-base (12 casas: 10¹² é 0%), para "o mesmo dinheiro". */
  factors: Array<bigint | null>;
  /** A do último ponto com dado; `null` sem nenhum. */
  return: string | null;
  /** O último ponto com dado. */
  until: IsoDate | null;
}

/** O fator do CDI anda com 12 casas, como a cota da SPEC-019. */
const FACTOR_ONE = 10n ** 12n;
/** A taxa tem até 6 casas e é % ao dia: 1 + taxa ÷ 100 é exato com 8 casas. */
const RATE_SCALE = 10n ** 8n;

/**
 * §4.2: o CDI de cada dia rende do fechamento dele até o do dia útil seguinte. No ponto, entram as
 * taxas dos dias do anterior (o dia-base, no primeiro) até o do ponto, sem ele, com todos os dias da
 * série (24/12 e 31/12 também). O ponto só tem CDI se a série chega ao dia anterior a ele.
 */
export function cdiBenchmark(
  input: BenchmarkInput & { rates: readonly CdiRate[] },
): BenchmarkSeries {
  const rates = [...input.rates].sort((a, b) => a.date.localeCompare(b.date));
  const lastRate = rates.at(-1)?.date;
  if (lastRate === undefined) return empty(input.days.length);
  let factor = FACTOR_ONE;
  let cursor = 0;
  while (cursor < rates.length && (rates[cursor] as CdiRate).date < input.base) cursor += 1;
  let previous = input.base;
  const factors = input.days.map((day) => {
    // Sem taxa a juntar (o primeiro ponto no próprio dia-base), o ponto vale 0%.
    if (previous < day && lastRate < previous) return null;
    while (cursor < rates.length && (rates[cursor] as CdiRate).date < day) {
      const daily = RATE_SCALE + scaledRate((rates[cursor] as CdiRate).rate);
      factor = divideHalfUp(factor * daily, RATE_SCALE);
      cursor += 1;
    }
    previous = day;
    return factor;
  });
  return summarize(input.days, factors);
}

/**
 * §4.2: fechamento do dia do ponto ÷ fechamento do dia-base − 1. Dia sem fechamento: o último
 * antes. O ponto só tem o índice se a série chega até ele.
 */
export function indexBenchmark(
  input: BenchmarkInput & { closes: readonly DailyClose[] },
): BenchmarkSeries {
  const closes = [...input.closes].sort((a, b) => a.date.localeCompare(b.date));
  const base = lastOnOrBefore(closes, input.base);
  const last = closes.at(-1)?.date;
  if (!base || last === undefined) return empty(input.days.length);
  const baseCents = toCents(base.close);
  const factors = input.days.map((day) => {
    if (day > last) return null;
    const close = lastOnOrBefore(closes, day) as DailyClose;
    return divideHalfUp(toCents(close.close) * FACTOR_ONE, baseCents);
  });
  return summarize(input.days, factors);
}

/**
 * §4.1, decisão 4: rentabilidade da carteira ÷ a do CDI, sem casas ("61"), só com a carteira acima
 * de 0% e o CDI acima de 0% (o CDI nunca é negativo; fica em 0% sem nenhum dia de taxa).
 */
export function cdiShare(portfolioReturn: string, cdiReturn: string | null): string | null {
  if (cdiReturn === null) return null;
  const portfolio = toCents(portfolioReturn);
  const cdi = toCents(cdiReturn);
  if (portfolio <= 0n || cdi <= 0n) return null;
  return divideHalfUp(portfolio * 100n, cdi).toString();
}

/**
 * §4.1, decisão 3 (atualizada em 08/11/2026): "o mesmo dinheiro" no índice, para o gráfico em
 * reais. Começa no patrimônio do dia-base e recebe os aportes e retiradas da carteira nos mesmos
 * dias, contados antes do fechamento (como na cota): no ponto, (anterior + aportes − retiradas) ×
 * fator do ponto ÷ fator do anterior. Proventos não entram: no índice, eles já estão no preço (ou,
 * no CDI, não existem). Depois do último ponto com dado, `null`.
 */
export function sameMoney(input: {
  /** Patrimônio no fechamento do dia-base, em reais ("23321.46"). */
  startValue: string;
  /** Aportes − retiradas em cada ponto, em reais. */
  flows: readonly string[];
  factors: ReadonlyArray<bigint | null>;
}): Array<string | null> {
  // Em milionésimos de centavo: 10 anos de pontos sem desvio no centavo.
  const SCALE = 1_000_000n;
  let money = toCents(input.startValue) * SCALE;
  let previous = FACTOR_ONE;
  let stopped = false;
  return input.factors.map((factor, index) => {
    if (stopped || factor === null) {
      stopped = true;
      return null;
    }
    const flow = toCents(input.flows[index] ?? '0.00') * SCALE;
    money = divideHalfUp((money + flow) * factor, previous);
    previous = factor;
    return centsToAmount(divideHalfUp(money, SCALE));
  });
}

/** Fator desde o dia-base → variação em % com 2 casas, meio para cima: "14.29", "-3.90". */
function percent(factor: bigint): string {
  return centsToAmount(divideHalfUp((factor - FACTOR_ONE) * 10_000n, FACTOR_ONE));
}

/** A taxa em % com 6 casas é a taxa ÷ 100 com 8 casas: "0.055131" → 55.131 (0,00055131). */
function scaledRate(rate: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(rate);
  if (!match) throw new RangeError(`taxa do CDI inválida: "${rate}"`);
  return BigInt(match[1] ?? '0') * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}

function summarize(days: readonly IsoDate[], factors: Array<bigint | null>): BenchmarkSeries {
  const points = factors.map((factor) => (factor === null ? null : percent(factor)));
  let last = -1;
  points.forEach((value, index) => {
    if (value !== null) last = index;
  });
  return {
    points,
    factors,
    return: last >= 0 ? (points[last] as string) : null,
    until: last >= 0 ? (days[last] as IsoDate) : null,
  };
}

function empty(count: number): BenchmarkSeries {
  return {
    points: Array<string | null>(count).fill(null),
    factors: Array<bigint | null>(count).fill(null),
    return: null,
    until: null,
  };
}

function lastOnOrBefore(closes: readonly DailyClose[], day: IsoDate): DailyClose | undefined {
  let low = 0;
  let high = closes.length - 1;
  let found: DailyClose | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const close = closes[middle] as DailyClose;
    if (close.date <= day) {
      found = close;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}
