import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_FORMAT,
  EncryptedFileOfflineCache,
  MemoryOfflineCache,
  type SavedRead,
} from './offline-cache.js';
import type { OsEncryption } from './secret-store.js';

const ana = { id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.com', role: 'user' as const };
const bia = { id: 'u2', name: 'Bia Lima', email: 'bia@exemplo.com', role: 'user' as const };

/** Cofre falso que embaralha os bytes: nada do texto original fica legível no arquivo. */
function fakeEncryption(available = true): OsEncryption {
  const flip = (bytes: Buffer) => Buffer.from(bytes.map((byte) => byte ^ 0x5a));
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.concat([Buffer.from('cofre:'), flip(Buffer.from(plain))]),
    decryptString: (encrypted) => {
      if (!encrypted.subarray(0, 6).equals(Buffer.from('cofre:'))) throw new Error('não decifra');
      return flip(encrypted.subarray(6)).toString('utf8');
    },
  };
}

const read = (body: unknown, savedAt = '2026-11-16T12:00:00.000Z'): SavedRead => ({
  body: JSON.stringify(body),
  etag: 'W/"abc"',
  savedAt,
});

const LIST = 'GET /api/portfolios';
const ITEM = 'GET /api/portfolios/0d9e1f7a-1111-4222-8333-00000000000a';

describe('cópia local cifrada (SPEC-032)', () => {
  let dir: string;
  let clock: number;

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'simulador-cache-')), 'cache');
    clock = 1_000;
  });

  afterEach(async () => {
    await rm(join(dir, '..'), { recursive: true, force: true });
  });

  const cache = (limit?: number, encryption = fakeEncryption()) =>
    new EncryptedFileOfflineCache(dir, encryption, limit, () => clock);

  it('guarda e devolve cada leitura; nada fica legível no disco (CA01)', async () => {
    const store = cache();
    await store.adopt(ana, new Date('2026-11-16T12:00:00Z'));
    await store.put(LIST, read({ portfolios: [{ name: 'Carteira Primeira' }] }));
    await expect(store.get(LIST)).resolves.toEqual(
      read({ portfolios: [{ name: 'Carteira Primeira' }] }),
    );
    await expect(store.get(ITEM)).resolves.toBeNull();

    const files = await readdir(dir);
    expect(files).toHaveLength(2); // o índice e uma leitura
    for (const file of files) {
      const bytes = (await readFile(join(dir, file))).toString('latin1');
      expect(bytes).not.toContain('Primeira');
      expect(bytes).not.toContain('ana@exemplo.com');
      expect(bytes).not.toContain('portfolios');
      // O nome do arquivo também não revela a chave.
      expect(file).not.toContain('portfolios');
    }
  });

  it('o dono e a última renovação sobrevivem a reabrir o app', async () => {
    await cache().adopt(ana, new Date('2026-11-16T12:00:00Z'));
    await cache().put(LIST, read({ portfolios: [] }));
    const reopened = cache();
    await expect(reopened.owner()).resolves.toEqual({
      user: ana,
      renewedAt: '2026-11-16T12:00:00.000Z',
    });
    await expect(reopened.get(LIST)).resolves.toEqual(read({ portfolios: [] }));
  });

  it('outro usuário: tudo é apagado antes de virar dele (CA08)', async () => {
    const store = cache();
    await store.adopt(ana, new Date('2026-11-16T12:00:00Z'));
    await store.put(LIST, read({ portfolios: [{ name: 'da Ana' }] }));
    await store.adopt(bia, new Date('2026-11-16T13:00:00Z'));
    await expect(store.get(LIST)).resolves.toBeNull();
    await expect(store.owner()).resolves.toMatchObject({ user: bia });
    // A mesma pessoa renovada só troca a data.
    await store.put(LIST, read({ portfolios: [] }));
    await store.adopt(bia, new Date('2026-11-16T14:00:00Z'));
    await expect(store.get(LIST)).resolves.not.toBeNull();
    await expect(store.owner()).resolves.toEqual({
      user: bia,
      renewedAt: '2026-11-16T14:00:00.000Z',
    });
  });

  it('limpar apaga a pasta inteira (CA08)', async () => {
    const store = cache();
    await store.adopt(ana, new Date());
    await store.put(LIST, read({ portfolios: [] }));
    await store.clear();
    await expect(readdir(dir)).rejects.toThrow();
    await expect(store.get(LIST)).resolves.toBeNull();
    await expect(store.owner()).resolves.toBeNull();
    await expect(cache().owner()).resolves.toBeNull();
  });

  it('passando do limite, saem as leituras usadas há mais tempo (CA09)', async () => {
    // Cada leitura ocupa uns 520 bytes cifrada: cabem 3 no limite.
    const big = 'x'.repeat(400);
    const store = cache(1_800);
    await store.adopt(ana, new Date());
    await store.put('GET /a', read({ big }));
    clock = 2_000;
    await store.put('GET /b', read({ big }));
    clock = 3_000;
    await store.get('GET /a'); // "a" foi usada agora: "b" passa a ser a mais antiga
    clock = 4_000;
    await store.put('GET /c', read({ big }));
    clock = 5_000;
    await store.put('GET /d', read({ big }));
    await expect(store.get('GET /b')).resolves.toBeNull();
    await expect(store.get('GET /a')).resolves.not.toBeNull();
    await expect(store.get('GET /d')).resolves.not.toBeNull();
    // Uma leitura maior que o limite nem é guardada.
    await store.put('GET /enorme', read({ big: 'y'.repeat(2_000) }));
    await expect(store.get('GET /enorme')).resolves.toBeNull();
    const files = await readdir(dir);
    expect(files.length).toBeLessThanOrEqual(4);
  });

  it('arquivo corrompido ou de outro formato vira "não consultado", sem erro (CA09)', async () => {
    const store = cache();
    await store.adopt(ana, new Date());
    await store.put(LIST, read({ portfolios: [] }));
    await store.put(ITEM, read({ portfolio: {} }));
    const [entry] = (await readdir(dir)).filter((file) => file !== 'index.bin');
    await writeFile(join(dir, entry ?? 'x'), 'lixo');
    const reopened = cache();
    const results = await Promise.all([reopened.get(LIST), reopened.get(ITEM)]);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    expect(await readdir(dir)).toHaveLength(2); // o índice e a que sobrou

    // Índice de outro formato: tudo começa do zero.
    const encryption = fakeEncryption();
    await writeFile(
      join(dir, 'index.bin'),
      encryption.encryptString(
        JSON.stringify({ format: CACHE_FORMAT + 1, owner: { user: ana }, entries: {} }),
      ),
    );
    const other = cache();
    await expect(other.owner()).resolves.toBeNull();
    await expect(other.get(LIST)).resolves.toBeNull();
  });

  it('arquivos que o índice não conhece saem ao abrir', async () => {
    const store = cache();
    await store.adopt(ana, new Date());
    await writeFile(join(dir, 'perdido.bin.123.tmp'), 'x');
    await writeFile(join(dir, 'orfao.bin'), 'x');
    await cache().owner();
    expect(await readdir(dir)).toEqual(['index.bin']);
  });

  it('sem cofre: nada vai para o disco, e a cópia vale com o app aberto (CA01)', async () => {
    const store = cache(undefined, fakeEncryption(false));
    expect(store.persistent).toBe(false);
    await store.adopt(ana, new Date('2026-11-16T12:00:00Z'));
    await store.put(LIST, read({ portfolios: [] }));
    await expect(store.get(LIST)).resolves.toEqual(read({ portfolios: [] }));
    await expect(store.owner()).resolves.toMatchObject({ user: ana });
    await expect(readdir(dir)).rejects.toThrow();
    await store.clear();
    await expect(store.get(LIST)).resolves.toBeNull();
  });
});

describe('cópia só na memória', () => {
  it('troca de usuário apaga, e o limite vale também', async () => {
    let clock = 0;
    const store = new MemoryOfflineCache(1_000, () => clock);
    await store.adopt(ana, new Date());
    await store.put('GET /a', read({ x: 'a'.repeat(300) }));
    clock = 1;
    await store.put('GET /b', read({ x: 'b'.repeat(300) }));
    clock = 2;
    await store.put('GET /c', read({ x: 'c'.repeat(300) }));
    clock = 3;
    await store.put('GET /d', read({ x: 'd'.repeat(300) }));
    await expect(store.get('GET /a')).resolves.toBeNull();
    await expect(store.get('GET /d')).resolves.not.toBeNull();
    await store.adopt(bia, new Date());
    await expect(store.get('GET /d')).resolves.toBeNull();
  });
});
