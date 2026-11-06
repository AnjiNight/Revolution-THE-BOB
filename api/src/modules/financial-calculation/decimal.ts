/**
 * Contas com preço em decimal (RNF12): os valores andam como texto e as contas usam inteiros
 * (milionésimos), nunca ponto flutuante.
 */
const SCALE = 6;
const ONE = 10n ** BigInt(SCALE);
const DECIMAL_PATTERN = /^-?\d+(\.\d{1,6})?$/;

export function isDecimalText(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

/** "52.71" → 52710000n. Aceita até 6 casas. */
export function toMicros(value: string): bigint {
  if (!isDecimalText(value)) throw new RangeError(`decimal inválido: "${value}"`);
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const micros = BigInt(whole) * ONE + BigInt(fraction.padEnd(SCALE, '0'));
  return negative ? -micros : micros;
}

/** Divide arredondando meio para cima, para longe do zero (RB13). */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twice < (denominator < 0n ? -denominator : denominator)) return quotient;
  return quotient + (numerator < 0n !== denominator < 0n ? -1n : 1n);
}

function format(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const text = (negative ? -scaled : scaled).toString().padStart(decimals + 1, '0');
  const body = decimals === 0 ? text : `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
  return negative ? `-${body}` : body;
}

/** Iguais em centavos (2 casas, meio para cima): o preço das fontes vem com 2 casas. */
export function sameAtCents(a: string, b: string): boolean {
  const cents = (value: string) => divideHalfUp(toMicros(value), 10n ** BigInt(SCALE - 2));
  return cents(a) === cents(b);
}

/** Variação percentual de `previous` para `price`, com 2 casas, meio para cima: "1.23", "-0.85". */
export function percentChange(price: string, previous: string): string {
  const base = toMicros(previous);
  if (base <= 0n) throw new RangeError('fechamento anterior precisa ser positivo');
  return format(divideHalfUp((toMicros(price) - base) * 10_000n, base), 2);
}

/** Número de uma resposta JSON → texto decimal, sem passar por conta em ponto flutuante. */
export function decimalFromJson(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const text = String(value);
  return isDecimalText(text) ? text : null;
}

/**
 * SPEC-042: soma de valores por ação com até 10 casas (proventos), sem arredondar: "0.20250435" +
 * "0.67407131" = "0.87657566". Zeros à direita saem.
 */
export function sumDecimals(values: readonly string[]): string {
  const scale = 10;
  const total = values.reduce((sum, value) => {
    if (!/^-?\d+(\.\d{1,10})?$/.test(value)) throw new RangeError(`decimal inválido: "${value}"`);
    const negative = value.startsWith('-');
    const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
    const scaled = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
    return sum + (negative ? -scaled : scaled);
  }, 0n);
  return format(total, scale).replace(/\.?0+$/, '');
}

export function compareDecimals(a: string, b: string): number {
  const difference = toMicros(a) - toMicros(b);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}
