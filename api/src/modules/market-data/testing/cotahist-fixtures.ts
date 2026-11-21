import { deflateRawSync } from 'node:zlib';

/** Uma linha de cotação do COTAHIST, com os campos do leiaute da B3 (SPEC-008 §4.1). */
export interface CotahistLineFields {
  /** AAAAMMDD. */
  date: string;
  ticker: string;
  codbdi?: string;
  market?: string;
  /** Centavos do lote, como no arquivo (2 casas implícitas). */
  open: number;
  high: number;
  low: number;
  average: number;
  close: number;
  trades?: number;
  /** Centavos, como no arquivo. */
  volume?: number;
  quoteFactor?: number;
  shortName?: string;
}

const num = (value: number, width: number) => String(value).padStart(width, '0');
const text = (value: string, width: number) => value.padEnd(width, ' ').slice(0, width);

/** Monta a linha de 245 caracteres em posições fixas, como a B3 publica. */
export function cotahistLine(fields: CotahistLineFields): string {
  const line = [
    '01', // 1–2 TIPREG
    fields.date, // 3–10 DATA
    text(fields.codbdi ?? '02', 2), // 11–12 CODBDI
    text(fields.ticker, 12), // 13–24 CODNEG
    text(fields.market ?? '010', 3), // 25–27 TPMERC
    text(fields.shortName ?? 'EMPRESA', 12), // 28–39 NOMRES
    text('ON      N2', 10), // 40–49 ESPECI
    text('', 3), // 50–52 PRAZOT
    text('R$', 4), // 53–56 MODREF
    num(fields.open, 13), // 57–69 PREABE
    num(fields.high, 13), // 70–82 PREMAX
    num(fields.low, 13), // 83–95 PREMIN
    num(fields.average, 13), // 96–108 PREMED
    num(fields.close, 13), // 109–121 PREULT
    num(fields.close, 13), // 122–134 PREOFC
    num(fields.close, 13), // 135–147 PREOFV
    num(fields.trades ?? 1000, 5), // 148–152 TOTNEG
    num(100000, 18), // 153–170 QUATOT
    num(fields.volume ?? 123456789, 18), // 171–188 VOLTOT
    num(0, 13), // 189–201 PREEXE
    '0', // 202 INDOPC
    '99991231', // 203–210 DATVEN
    num(fields.quoteFactor ?? 1, 7), // 211–217 FATCOT
    num(0, 13), // 218–230 PTOEXE
    text('BRXXXXACNOR0', 12), // 231–242 CODISI
    '100', // 243–245 DISMES
  ].join('');
  if (line.length !== 245) throw new Error(`linha de teste com ${line.length} caracteres`);
  return line;
}

export function cotahistHeader(): string {
  return `00COTAHIST.2026BOVESPA 20261029${' '.repeat(214)}`;
}

export function cotahistTrailer(lines: number): string {
  return `99COTAHIST.2026BOVESPA 20261029${num(lines + 2, 11)}${' '.repeat(203)}`;
}

/** Arquivo completo, com cabeçalho e rodapé, em linhas terminadas por CRLF (como a B3). */
export function cotahistFile(quotes: CotahistLineFields[]): string {
  return [cotahistHeader(), ...quotes.map(cotahistLine), cotahistTrailer(quotes.length), ''].join(
    '\r\n',
  );
}

/**
 * ZIP com um único arquivo comprimido (deflate), no formato que a B3 publica: cabeçalho local,
 * dados e diretório central.
 */
export function zipSingleFile(name: string, content: string): Buffer {
  const data = Buffer.from(content, 'latin1');
  const compressed = deflateRawSync(data);
  const fileName = Buffer.from(name, 'latin1');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 10);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + fileName.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
