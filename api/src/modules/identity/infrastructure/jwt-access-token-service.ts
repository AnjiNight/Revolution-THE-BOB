import type { Role } from '@simulador/shared';
import { createSigner, createVerifier } from 'fast-jwt';
import type { AccessTokenClaims, AccessTokenService } from '../application/ports.js';

const ISSUER = 'simulador-api';
const AUDIENCE = 'simulador-app';
const ROLES: readonly Role[] = ['user', 'collaborator'];

/** Token de acesso JWT (HS256) de curta duração (DA05). */
export class JwtAccessTokenService implements AccessTokenService {
  private readonly sign: (payload: Record<string, unknown>) => string;
  private readonly decode: (token: string) => Record<string, unknown>;

  constructor(secret: string, ttlMinutes: number) {
    this.sign = createSigner({
      key: secret,
      algorithm: 'HS256',
      expiresIn: ttlMinutes * 60 * 1000,
      iss: ISSUER,
      aud: AUDIENCE,
    });
    this.decode = createVerifier({
      key: secret,
      algorithms: ['HS256'],
      allowedIss: ISSUER,
      allowedAud: AUDIENCE,
      requiredClaims: ['sub', 'role', 'exp'],
      cache: false,
    }) as (token: string) => Record<string, unknown>;
  }

  issue(claims: AccessTokenClaims): string {
    return this.sign({ sub: claims.userId, role: claims.role });
  }

  verify(token: string): AccessTokenClaims | null {
    try {
      const payload = this.decode(token);
      const role = payload.role as Role;
      if (typeof payload.sub !== 'string' || !ROLES.includes(role)) return null;
      return { userId: payload.sub, role };
    } catch {
      return null;
    }
  }
}
