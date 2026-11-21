import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtAccessTokenService } from './jwt-access-token-service.js';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const claims = { userId: '6f1c0e2a-0000-4000-8000-000000000001', role: 'user' as const };

afterEach(() => vi.useRealTimers());

describe('JwtAccessTokenService (CA06)', () => {
  it('emite e verifica um token válido', () => {
    const service = new JwtAccessTokenService(SECRET, 15);
    expect(service.verify(service.issue(claims))).toEqual(claims);
  });

  it('recusa token adulterado', () => {
    const service = new JwtAccessTokenService(SECRET, 15);
    const [header, , signature] = service.issue(claims).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'outro', role: 'admin' })).toString(
      'base64url',
    );
    expect(service.verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('recusa token assinado com outro segredo', () => {
    const other = new JwtAccessTokenService('outro-segredo-tambem-com-mais-de-32-chars', 15);
    expect(new JwtAccessTokenService(SECRET, 15).verify(other.issue(claims))).toBeNull();
  });

  it('recusa token expirado', () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    const service = new JwtAccessTokenService(SECRET, 15);
    const token = service.issue(claims);
    vi.setSystemTime(new Date('2026-10-08T12:14:00Z'));
    expect(service.verify(token)).toEqual(claims);
    vi.setSystemTime(new Date('2026-10-08T12:16:00Z'));
    expect(service.verify(token)).toBeNull();
  });

  it('recusa lixo', () => {
    expect(new JwtAccessTokenService(SECRET, 15).verify('nao.e.jwt')).toBeNull();
  });
});
