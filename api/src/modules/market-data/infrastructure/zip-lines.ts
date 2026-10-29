import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const LOCAL_HEADER_SIZE = 30;
const STORED = 0;
const DEFLATE = 8;
/** Bit 3: os tamanhos só aparecem depois dos dados (o cabeçalho traz zero). */
const SIZES_AFTER_DATA = 0x08;

export class NotAZipError extends Error {
  constructor(path: string) {
    super(`o arquivo baixado não é um ZIP: ${path}`);
    this.name = 'NotAZipError';
  }
}

/** Confere a assinatura do ZIP nos primeiros bytes. */
export async function isZip(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await file.read(head, 0, 4, 0);
    return bytesRead === 4 && head.readUInt32LE(0) === LOCAL_HEADER_SIGNATURE;
  } finally {
    await file.close();
  }
}

/**
 * Linhas do primeiro (e único) arquivo de um ZIP, sem descompactar no disco: lê o cabeçalho local
 * e passa os dados pelo inflate em fluxo. Os arquivos da B3 têm um arquivo de texto só, em
 * ISO-8859-1. Sem dependência nova: o ZIP de um arquivo só precisa do cabeçalho local.
 */
export async function* zipLines(path: string): AsyncGenerator<string> {
  const file = await open(path, 'r');
  let start: number;
  let compressedSize: number;
  let method: number;
  try {
    const header = Buffer.alloc(LOCAL_HEADER_SIZE);
    const { bytesRead } = await file.read(header, 0, LOCAL_HEADER_SIZE, 0);
    if (bytesRead < LOCAL_HEADER_SIZE || header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
      throw new NotAZipError(path);
    }
    const flags = header.readUInt16LE(6);
    method = header.readUInt16LE(8);
    compressedSize = flags & SIZES_AFTER_DATA ? 0 : header.readUInt32LE(18);
    start = LOCAL_HEADER_SIZE + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await file.close();
  }
  if (method !== DEFLATE && method !== STORED) {
    throw new Error(`compressão ${method} não suportada em ${path}`);
  }
  if (method === STORED && compressedSize === 0) {
    throw new Error(`ZIP sem tamanho no cabeçalho em ${path}`);
  }

  const raw = createReadStream(path, {
    start,
    ...(compressedSize > 0 ? { end: start + compressedSize - 1 } : {}),
  });
  // Depois do fim do fluxo deflate, o inflate ignora o resto (diretório central).
  const data: Readable = method === DEFLATE ? raw.pipe(createInflateRaw()) : raw;
  raw.on('error', (error) => data.destroy(error));
  data.setEncoding('latin1');
  const lines = createInterface({ input: data, crlfDelay: Infinity });
  try {
    for await (const line of lines) yield line;
  } finally {
    lines.close();
    data.destroy();
    raw.destroy();
  }
}
