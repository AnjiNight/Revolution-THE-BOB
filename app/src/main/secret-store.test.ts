import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EncryptedFileSecretStore, type OsEncryption } from './secret-store.js';

/** Imita o safeStorage: "criptografa" invertendo e marcando os bytes. */
function fakeEncryption(available: boolean): OsEncryption {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`ENC:${[...plain].reverse().join('')}`),
    decryptString: (data) => [...data.toString().replace(/^ENC:/, '')].reverse().join(''),
  };
}

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'sessao-')), 'sessao.bin');

describe('EncryptedFileSecretStore (CA12, RNF08)', () => {
  it('grava o token criptografado e lê de volta', async () => {
    const file = tempFile();
    const store = new EncryptedFileSecretStore(file, fakeEncryption(true));
    await store.save('token-secreto-123');

    expect(readFileSync(file, 'utf8')).not.toContain('token-secreto-123');
    // O Windows não tem permissões POSIX (sempre informa 0o666); lá a proteção é o cofre do SO.
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    await expect(new EncryptedFileSecretStore(file, fakeEncryption(true)).load()).resolves.toBe(
      'token-secreto-123',
    );
  });

  it('apaga o arquivo ao limpar', async () => {
    const file = tempFile();
    const store = new EncryptedFileSecretStore(file, fakeEncryption(true));
    await store.save('x');
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it('sem cofre do SO, não grava nada em disco: vale só na memória', async () => {
    const file = tempFile();
    const store = new EncryptedFileSecretStore(file, fakeEncryption(false));
    await store.save('token-secreto-123');

    expect(store.persistent).toBe(false);
    expect(() => readFileSync(file)).toThrow();
    await expect(store.load()).resolves.toBe('token-secreto-123');
    await expect(new EncryptedFileSecretStore(file, fakeEncryption(false)).load()).resolves.toBe(
      null,
    );
  });

  it('arquivo corrompido equivale a não ter sessão', async () => {
    const encryption = fakeEncryption(true);
    encryption.decryptString = () => {
      throw new Error('corrompido');
    };
    const file = tempFile();
    await new EncryptedFileSecretStore(file, fakeEncryption(true)).save('x');
    await expect(new EncryptedFileSecretStore(file, encryption).load()).resolves.toBeNull();
  });
});
