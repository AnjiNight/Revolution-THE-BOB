import { isIsoDate, type IsoDate } from '@simulador/shared';

/**
 * Leitor do arquivo de séries históricas da B3 (COTAHIST, SPEC-008 §4.1). Cada linha tem 245
 * caracteres em posições fixas; só as de tipo `01` são cotações. Puro: recebe a linha, não sabe de
 * arquivo nem de rede.
 */

/** Fechamento de um papel num pregão. Preços por ação, já divididos pelo fator de cotação. */
export interface CotahistQuote {
  date: IsoDate;
  ticker: string;
  /** Decimais em texto, com 6 casas (preços) e 2 casas (volume): nada passa por ponto flutuante. */
  open: string;
  high: string;
  low: string;
  close: string;
  average: string;
  trades: number;
  volume: string;
}

/** Linha de cotação que não dá para ler; a execução registra o erro e segue com o resto. */
export class CotahistLineError extends Error {
  constructor(
    message: string,
    readonly ticker: string | null = null,
    readonly date: IsoDate | null = null,
  ) {
    super(message);
    this.name = 'CotahistLineError';
  }
}

const LINE_LENGTH = 245;
const QUOTE_RECORD = '01';
/** Mercado à vista, lote padrão. Fracionário (020), opções e termo ficam de fora. */
const SPOT_MARKET = '010';

/** Posições do leiaute da B3, contadas a partir de 1, como no documento oficial. */
const FIELD = {
  recordType: [1, 2],
  date: [3, 10],
  ticker: [13, 24],
  market: [25, 27],
  open: [57, 69],
  high: [70, 82],
  low: [83, 95],
  average: [96, 108],
  close: [109, 121],
  trades: [148, 152],
  volume: [171, 188],
  quoteFactor: [211, 217],
} as const satisfies Record<string, readonly [number, number]>;

function field(line: string, name: keyof typeof FIELD): string {
  const [start, end] = FIELD[name];
  return line.slice(start - 1, end);
}

/**
 * Lê uma linha do arquivo. Devolve `null` para o que não interessa (cabeçalho, rodapé, outros
 * mercados) e lança CotahistLineError para uma cotação malformada.
 */
export function parseCotahistLine(rawLine: string): CotahistQuote | null {
  const line = rawLine.replace(/\r$/, '');
  if (field(line, 'recordType') !== QUOTE_RECORD) return null;
  if (line.length < LINE_LENGTH) {
    throw new CotahistLineError(`linha com ${line.length} caracteres (esperado ${LINE_LENGTH})`);
  }
  if (field(line, 'market') !== SPOT_MARKET) return null;

  const ticker = field(line, 'ticker').trim();
  const rawDate = field(line, 'date');
  const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  if (!/^\d{8}$/.test(rawDate) || !isIsoDate(date)) {
    throw new CotahistLineError(`data inválida "${rawDate}"`, ticker || null);
  }
  const fail = (message: string): never => {
    throw new CotahistLineError(message, ticker || null, date);
  };
  if (!ticker) fail('linha sem ticker');

  const factor = digits(field(line, 'quoteFactor'), 'FATCOT', fail);
  if (factor === 0n) fail('fator de cotação zero');
  const price = (name: 'open' | 'high' | 'low' | 'average' | 'close') =>
    perShare(digits(field(line, name), name, fail), factor);

  const quote: CotahistQuote = {
    date,
    ticker,
    open: price('open'),
    high: price('high'),
    low: price('low'),
    close: price('close'),
    average: price('average'),
    trades: Number(digits(field(line, 'trades'), 'TOTNEG', fail)),
    volume: formatScaled(digits(field(line, 'volume'), 'VOLTOT', fail), 2),
  };
  const problem = priceProblem(quote);
  if (problem) fail(problem);
  return quote;
}

/** Campo numérico só com dígitos (o leiaute completa com zeros à esquerda). */
function digits(value: string, name: string, fail: (message: string) => never): bigint {
  if (!/^\d+$/.test(value)) return fail(`campo ${name} não é numérico: "${value.trim()}"`);
  return BigInt(value);
}

/** Preço do arquivo (centavos do lote de `factor` ações) por ação, com 6 casas, meio para cima. */
function perShare(cents: bigint, factor: bigint): string {
  const scaled = cents * 10_000n;
  const micro = (scaled + factor / 2n) / factor;
  return formatScaled(micro, 6);
}

function formatScaled(value: bigint, decimals: number): string {
  const text = value.toString().padStart(decimals + 1, '0');
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

function toMicro(value: string): bigint {
  return BigInt(value.replace('.', ''));
}

/** Preços positivos e abertura e fechamento dentro da faixa do dia (igual ao CHECK do banco). */
function priceProblem(quote: CotahistQuote): string | null {
  const [open, high, low, close, average] = [
    quote.open,
    quote.high,
    quote.low,
    quote.close,
    quote.average,
  ].map(toMicro) as [bigint, bigint, bigint, bigint, bigint];
  if (low <= 0n || average <= 0n) return 'preço zero ou negativo';
  if (open < low || open > high || close < low || close > high) {
    return 'abertura ou fechamento fora da faixa entre a mínima e a máxima';
  }
  return null;
}
