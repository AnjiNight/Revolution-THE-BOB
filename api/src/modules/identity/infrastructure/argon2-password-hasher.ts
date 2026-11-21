import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { PasswordHasher } from '../application/ports.js';

/** Parâmetros mínimos recomendados pela OWASP para argon2id (RNF07). */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), OPTIONS);
    await this.verify(await this.dummyHash, password);
  }
}
