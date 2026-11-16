import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PublicUser } from '@simulador/shared';
import type { OsEncryption } from './secret-store.js';

/**
 * Cópia local das leituras do usuário (SPEC-032, DA08): o que ele abriu neste computador, para
 * consultar sem conexão. Cifrada pelo cofre do SO, como o token de renovação (RNF08); sem cofre,
 * só na memória, valendo com o app aberto.
 */

/** Versão do formato dos arquivos: um formato diferente é apagado, não convertido. */
export const CACHE_FORMAT = 1;
/** Passando disso, saem as leituras usadas há mais tempo. */
export const CACHE_LIMIT_BYTES = 50 * 1024 * 1024;

/** Uma leitura guardada. */
export interface SavedRead {
  /** O corpo como veio do servidor (o JSON, ou o logo já como `data:`). */
  body: string;
  /** O ETag do servidor, para a próxima leitura perguntar "mudou?" (RNF19). */
  etag: string | null;
  /** Quando o servidor confirmou este corpo pela última vez (200 ou 304). */
  savedAt: string;
}

/** De quem é a cópia e quando a sessão foi renovada pela última vez. */
export interface CacheOwner {
  user: PublicUser;
  renewedAt: string;
}

export interface OfflineCache {
  /** false quando a cópia vive só na memória (sem cofre do sistema operacional). */
  readonly persistent: boolean;
  owner(): Promise<CacheOwner | null>;
  /** A cópia passa a ser deste usuário, renovado agora; se era de outro, tudo é apagado antes. */
  adopt(user: PublicUser, renewedAt: Date): Promise<void>;
  get(key: string): Promise<SavedRead | null>;
  put(key: string, read: SavedRead): Promise<void>;
  clear(): Promise<void>;
}

interface Entry {
  size: number;
  /** Quando uma tela usou esta leitura pela última vez (ms). */
  lastReadAt: number;
}

/** Quais entradas saem para o total caber no limite: as usadas há mais tempo primeiro. */
function overflow(entries: Map<string, Entry>, limit: number, keep: string): string[] {
  let total = 0;
  for (const entry of entries.values()) total += entry.size;
  const oldestFirst = [...entries]
    .filter(([name]) => name !== keep)
    .sort((a, b) => a[1].lastReadAt - b[1].lastReadAt);
  const out: string[] = [];
  for (const [name, entry] of oldestFirst) {
    if (total <= limit) break;
    total -= entry.size;
    out.push(name);
  }
  return out;
}

/** Fila de uma operação por vez: limpar, gravar e ler o índice nunca se cruzam. */
class Exclusive {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** Sem cofre do SO: a cópia vale só enquanto o app está aberto. */
export class MemoryOfflineCache implements OfflineCache {
  readonly persistent = false;
  private current: CacheOwner | null = null;
  private readonly reads = new Map<string, SavedRead & Entry>();

  constructor(
    private readonly limit = CACHE_LIMIT_BYTES,
    private readonly now: () => number = Date.now,
  ) {}

  owner(): Promise<CacheOwner | null> {
    return Promise.resolve(this.current);
  }

  async adopt(user: PublicUser, renewedAt: Date): Promise<void> {
    if (this.current && this.current.user.id !== user.id) await this.clear();
    this.current = { user, renewedAt: renewedAt.toISOString() };
  }

  get(key: string): Promise<SavedRead | null> {
    const read = this.reads.get(key);
    if (!read) return Promise.resolve(null);
    read.lastReadAt = this.now();
    return Promise.resolve({ body: read.body, etag: read.etag, savedAt: read.savedAt });
  }

  put(key: string, read: SavedRead): Promise<void> {
    const size = Buffer.byteLength(read.body) + Buffer.byteLength(key);
    if (size > this.limit) return Promise.resolve();
    this.reads.set(key, { ...read, size, lastReadAt: this.now() });
    for (const name of overflow(this.reads, this.limit, key)) this.reads.delete(name);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.current = null;
    this.reads.clear();
    return Promise.resolve();
  }
}

interface IndexFile {
  format: number;
  owner: CacheOwner | null;
  /** Por nome de arquivo (o SHA-256 da chave): nem o id da carteira aparece no nome. */
  entries: Record<string, Entry>;
}

interface ReadFile extends SavedRead {
  format: number;
  key: string;
}

const INDEX = 'index.bin';

/**
 * Arquivos cifrados na pasta de dados do app: um por leitura e um índice (dono, última renovação
 * e o tamanho e o último uso de cada leitura). Gravação num temporário e depois troca de nome,
 * para nunca ficar um arquivo pela metade.
 */
export class EncryptedFileOfflineCache implements OfflineCache {
  private readonly memory: MemoryOfflineCache;
  private readonly queue = new Exclusive();
  private index: { owner: CacheOwner | null; entries: Map<string, Entry> } | null = null;

  constructor(
    private readonly dir: string,
    private readonly encryption: OsEncryption,
    private readonly limit = CACHE_LIMIT_BYTES,
    private readonly now: () => number = Date.now,
  ) {
    this.memory = new MemoryOfflineCache(limit, now);
  }

  get persistent(): boolean {
    return this.encryption.isEncryptionAvailable();
  }

  owner(): Promise<CacheOwner | null> {
    if (!this.persistent) return this.memory.owner();
    return this.queue.run(async () => (await this.load()).owner);
  }

  adopt(user: PublicUser, renewedAt: Date): Promise<void> {
    if (!this.persistent) return this.memory.adopt(user, renewedAt);
    return this.queue.run(async () => {
      const index = await this.load();
      if (index.owner && index.owner.user.id !== user.id) await this.wipe();
      const fresh = await this.load();
      fresh.owner = { user, renewedAt: renewedAt.toISOString() };
      await this.saveIndex();
    });
  }

  get(key: string): Promise<SavedRead | null> {
    if (!this.persistent) return this.memory.get(key);
    return this.queue.run(async () => {
      const index = await this.load();
      const name = fileName(key);
      const entry = index.entries.get(name);
      if (!entry) return null;
      const read = await this.readEntry(name, key);
      if (!read) {
        index.entries.delete(name);
        await rm(join(this.dir, `${name}.bin`), { force: true });
        await this.saveIndex();
        return null;
      }
      entry.lastReadAt = this.now();
      await this.saveIndex();
      return read;
    });
  }

  put(key: string, read: SavedRead): Promise<void> {
    if (!this.persistent) return this.memory.put(key, read);
    return this.queue.run(async () => {
      const index = await this.load();
      const name = fileName(key);
      const content = this.encryption.encryptString(
        JSON.stringify({ format: CACHE_FORMAT, key, ...read } satisfies ReadFile),
      );
      if (content.length > this.limit) return;
      await this.writeAtomic(`${name}.bin`, content);
      index.entries.set(name, { size: content.length, lastReadAt: this.now() });
      for (const old of overflow(index.entries, this.limit, name)) {
        index.entries.delete(old);
        await rm(join(this.dir, `${old}.bin`), { force: true });
      }
      await this.saveIndex();
    });
  }

  clear(): Promise<void> {
    return this.queue.run(async () => {
      await this.memory.clear();
      await this.wipe();
    });
  }

  /** Apaga a pasta inteira; a próxima gravação começa do zero. */
  private async wipe(): Promise<void> {
    this.index = { owner: null, entries: new Map() };
    await rm(this.dir, { recursive: true, force: true });
  }

  /** O índice, lido uma vez. Ilegível ou de outro formato: começa do zero, sem erro na tela. */
  private async load(): Promise<{ owner: CacheOwner | null; entries: Map<string, Entry> }> {
    if (this.index) return this.index;
    let parsed: IndexFile | null = null;
    try {
      const raw = this.encryption.decryptString(await readFile(join(this.dir, INDEX)));
      const value = JSON.parse(raw) as IndexFile;
      if (value.format === CACHE_FORMAT && typeof value.entries === 'object') parsed = value;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      await this.wipe();
      return this.index ?? { owner: null, entries: new Map() };
    }
    this.index = { owner: parsed.owner ?? null, entries: new Map(Object.entries(parsed.entries)) };
    await this.sweep();
    return this.index;
  }

  /** Arquivos que o índice não conhece (uma gravação interrompida) saem na primeira leitura. */
  private async sweep(): Promise<void> {
    const known = new Set([...(this.index?.entries.keys() ?? [])].map((name) => `${name}.bin`));
    known.add(INDEX);
    const files = await readdir(this.dir).catch(() => [] as string[]);
    for (const file of files) {
      if (!known.has(file)) await rm(join(this.dir, file), { force: true, recursive: true });
    }
  }

  private async readEntry(name: string, key: string): Promise<SavedRead | null> {
    try {
      const raw = this.encryption.decryptString(await readFile(join(this.dir, `${name}.bin`)));
      const value = JSON.parse(raw) as Partial<ReadFile>;
      if (
        value.format !== CACHE_FORMAT ||
        value.key !== key ||
        typeof value.body !== 'string' ||
        typeof value.savedAt !== 'string' ||
        (value.etag !== null && typeof value.etag !== 'string')
      ) {
        return null;
      }
      return { body: value.body, etag: value.etag ?? null, savedAt: value.savedAt };
    } catch {
      return null;
    }
  }

  private async saveIndex(): Promise<void> {
    const index = this.index;
    if (!index) return;
    const file: IndexFile = {
      format: CACHE_FORMAT,
      owner: index.owner,
      entries: Object.fromEntries(index.entries),
    };
    await this.writeAtomic(INDEX, this.encryption.encryptString(JSON.stringify(file)));
  }

  private async writeAtomic(file: string, content: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temp = join(this.dir, `${file}.${process.pid}.tmp`);
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, join(this.dir, file));
  }
}

/** O nome do arquivo de uma leitura: o SHA-256 da chave, para o nome não revelar nada. */
function fileName(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
