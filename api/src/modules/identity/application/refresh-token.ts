import { createHash, randomBytes } from 'node:crypto';

/** Token de renovação: 256 bits aleatórios. Só o hash vai para o banco. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
