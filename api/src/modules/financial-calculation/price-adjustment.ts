import type { IsoDate, PricePoint } from '@simulador/shared';

/**
 * Ajuste do histórico de preços pelos eventos corporativos (SPEC-042 §4.3), em decimal com
 * inteiros (RNF12). O preço guardado não muda: o ajuste é só o que a tela mostra.
 */

export interface PriceEventInput {
  kind: 'desdobramento' | 'grupamento' | 'bonificacao';
  /** Data com: os preços até esse dia ficam antes do evento. */
  exDate: IsoDate;
  /** Fator como a B3 publica. */
  factor: string;
}

/** Fração exata, para multiplicar fatores sem arredondar no meio. */
interface Ratio {
  num: bigint;
  den: bigint;
}

const FACTOR_SCALE = 10n ** 10n;

function scaled(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,10}$/.test(fraction)) {
    throw new RangeError(`fator inválido: "${value}"`);
  }
  return BigInt(whole) * FACTOR_SCALE + BigInt(fraction.padEnd(10, '0'));
}

/**
 * Quantas ações passa a valer uma ação depois do evento. A B3 publica desdobramento e bonificação
 * em % de ações novas (desdobramento 300: 1 vira 4; bonificação 5: 1 vira 1,05) e o grupamento como
 * a própria razão (0,1: 10 viram 1), conferido com a Magalu (2020, 2024 e 2025).
 */
export function shareMultiplier(event: Pick<PriceEventInput, 'kind' | 'factor'>): Ratio {
  const factor = scaled(event.factor);
  if (factor <= 0n) throw new RangeError('fator precisa ser positivo');
  if (event.kind === 'grupamento') return { num: factor, den: FACTOR_SCALE };
  return { num: 100n * FACTOR_SCALE + factor, den: 100n * FACTOR_SCALE };
}

/** Multiplicador como texto, com até 6 casas ("4", "0.1", "1.05"), para a tela. */
export function multiplierText(event: Pick<PriceEventInput, 'kind' | 'factor'>): string {
  const { num, den } = shareMultiplier(event);
  const micros = (num * 1_000_000n + den / 2n) / den;
  const text = `${micros / 1_000_000n}.${(micros % 1_000_000n).toString().padStart(6, '0')}`;
  return text.replace(/\.?0+$/, '');
}

/** Preço em milionésimos × den ÷ num, meio para cima, de volta a texto com 6 casas. */
function divideByRatio(price: string, ratio: Ratio): string {
  const [whole = '0', fraction = ''] = price.split('.');
  const micros = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6));
  const numerator = micros * ratio.den;
  const result = (numerator * 2n + ratio.num) / (ratio.num * 2n);
  const text = `${result / 1_000_000n}.${(result % 1_000_000n).toString().padStart(6, '0')}`;
  return text;
}

/**
 * Cada fechamento dividido pelo multiplicador acumulado dos eventos com data com no mesmo dia ou
 * depois: o preço de antes de um desdobramento de 1 para 4 fica dividido por 4.
 */
export function adjustPrices(
  points: readonly PricePoint[],
  events: readonly PriceEventInput[],
): PricePoint[] {
  if (events.length === 0) return points.map((point) => ({ ...point }));
  const sorted = [...events].sort((a, b) => b.exDate.localeCompare(a.exDate));
  const result: PricePoint[] = [];
  // Do mais recente para o mais antigo, acumulando os eventos que ficam "depois" do ponto.
  let ratio: Ratio = { num: 1n, den: 1n };
  let next = 0;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i] as PricePoint;
    while (next < sorted.length && (sorted[next] as PriceEventInput).exDate >= point.date) {
      const multiplier = shareMultiplier(sorted[next] as PriceEventInput);
      ratio = { num: ratio.num * multiplier.num, den: ratio.den * multiplier.den };
      next += 1;
    }
    result.push(
      ratio.num === ratio.den
        ? { ...point }
        : { date: point.date, close: divideByRatio(point.close, ratio) },
    );
  }
  return result.reverse();
}

/** Um evento explica a mudança do pregão `previous` para `current` se a data com fica entre eles. */
export function eventBetween(
  events: readonly Pick<PriceEventInput, 'exDate'>[],
  previous: IsoDate,
  current: IsoDate,
): boolean {
  return events.some((event) => event.exDate >= previous && event.exDate < current);
}
