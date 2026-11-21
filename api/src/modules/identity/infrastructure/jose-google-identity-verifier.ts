import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GoogleIdentity, GoogleIdentityVerifier } from '../application/ports.js';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/**
 * Verifica o ID token do Google (DA24): assinatura com as chaves públicas do Google,
 * emissor, validade e se foi emitido para o nosso app (aud = client ID).
 */
export class JoseGoogleIdentityVerifier implements GoogleIdentityVerifier {
  constructor(
    private readonly clientId: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_JWKS_URL),
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity | null> {
    try {
      const { payload } = await jwtVerify(idToken, this.keys, {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
        requiredClaims: ['sub', 'email', 'exp'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name : '',
      };
    } catch {
      return null;
    }
  }
}
