import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher (CA04, RNF07)', () => {
  const hasher = new Argon2PasswordHasher();

  it('gera hash argon2id que não contém a senha', async () => {
    const hash = await hasher.hash('senha-bem-longa');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('senha-bem-longa');
  });

  it('verifica a senha correta e recusa a errada', async () => {
    const hash = await hasher.hash('senha-bem-longa');
    await expect(hasher.verify(hash, 'senha-bem-longa')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'senha-errada')).resolves.toBe(false);
  });

  it('dois hashes da mesma senha são diferentes (sal aleatório)', async () => {
    expect(await hasher.hash('igual')).not.toBe(await hasher.hash('igual'));
  });

  it('hash corrompido não lança, só recusa', async () => {
    await expect(hasher.verify('lixo', 'x')).resolves.toBe(false);
  });

  it('verificação falsa não lança', async () => {
    await expect(hasher.verifyDummy('qualquer')).resolves.toBeUndefined();
  });
});
