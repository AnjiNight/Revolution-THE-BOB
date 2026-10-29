import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { IsoDate } from '@simulador/shared';
import type { CotahistSource } from '../application/ports.js';
import { isZip, NotAZipError, zipLines } from './zip-lines.js';

/** Endereço público das séries históricas da B3. */
export const B3_HISTORY_BASE_URL = 'https://bvmf.bmfbovespa.com.br/InstDados/SerHist';

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export interface B3CotahistSourceOptions {
  /** Pasta onde ficam os arquivos anuais de anos fechados (não mudam mais). */
  cacheDir: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Adaptador dos arquivos COTAHIST da B3 (DA06, DA18). Baixa o ZIP para o disco e lê as linhas em
 * fluxo. Anuais de anos fechados ficam guardados em `cacheDir`; os outros são apagados depois de
 * lidos.
 */
export class B3CotahistSource implements CotahistSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: B3CotahistSourceOptions) {
    this.baseUrl = options.baseUrl ?? B3_HISTORY_BASE_URL;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async annual(year: number, closed: boolean): Promise<AsyncIterable<string> | null> {
    const name = `COTAHIST_A${year}.ZIP`;
    if (!closed) return this.temporary(name);
    const cached = join(this.options.cacheDir, name);
    if (existsSync(cached)) return zipLines(cached);
    const part = `${cached}.${randomUUID()}.part`;
    if (!(await this.download(name, part))) return null;
    await rename(part, cached);
    return zipLines(cached);
  }

  daily(date: IsoDate): Promise<AsyncIterable<string> | null> {
    const [year, month, day] = date.split('-');
    return this.temporary(`COTAHIST_D${day}${month}${year}.ZIP`);
  }

  /** Baixa, devolve as linhas e apaga o arquivo quando a leitura termina (ou é interrompida). */
  private async temporary(name: string): Promise<AsyncIterable<string> | null> {
    const path = join(this.options.cacheDir, `${randomUUID()}-${name}`);
    if (!(await this.download(name, path))) return null;
    return (async function* () {
      try {
        yield* zipLines(path);
      } finally {
        await rm(path, { force: true });
      }
    })();
  }

  /** `false` quando o arquivo ainda não existe na B3 (404). */
  private async download(name: string, path: string): Promise<boolean> {
    await mkdir(this.options.cacheDir, { recursive: true });
    const response = await this.fetch(`${this.baseUrl}/${name}`, {
      headers: { 'User-Agent': 'simulador-investimentos (projeto academico)' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (response.status === 404) return false;
    if (!response.ok || !response.body) {
      throw new Error(`B3 respondeu ${response.status} para ${name}`);
    }
    try {
      await pipeline(
        Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
        createWriteStream(path),
      );
      // Arquivo que não existe às vezes volta como uma página de erro com status 200.
      if (!(await isZip(path))) throw new NotAZipError(name);
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    return true;
  }
}
