import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JoseGoogleIdentityVerifier } from './jose-google-identity-verifier.js';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const CLIENT_ID = 'nosso-app.apps.googleusercontent.com';
let privateKey: PrivateKey;
let otherKey: PrivateKey;
let verifier: JoseGoogleIdentityVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'chave-1', alg: 'RS256' };
  verifier = new JoseGoogleIdentityVerifier(CLIENT_ID, createLocalJWKSet({ keys: [jwk] }));
});

function googleToken(
  claims: Record<string, unknown> = {},
  options: { key?: PrivateKey; audience?: string; issuer?: string; expiresIn?: string } = {},
) {
  return new SignJWT({
    email: 'ana@gmail.com',
    email_verified: true,
    name: 'Ana Souza',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'chave-1' })
    .setSubject('1234567890')
    .setIssuer(options.issuer ?? 'https://accounts.google.com')
    .setAudience(options.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? privateKey);
}

describe('JoseGoogleIdentityVerifier (DA24)', () => {
  it('aceita um ID token válido do Google', async () => {
    await expect(verifier.verify(await googleToken())).resolves.toEqual({
      sub: '1234567890',
      email: 'ana@gmail.com',
      emailVerified: true,
      name: 'Ana Souza',
    });
  });

  it('aceita o emissor sem https (formato antigo do Google)', async () => {
    await expect(
      verifier.verify(await googleToken({}, { issuer: 'accounts.google.com' })),
    ).resolves.not.toBeNull();
  });

  it('informa e-mail não verificado', async () => {
    const identity = await verifier.verify(await googleToken({ email_verified: false }));
    expect(identity?.emailVerified).toBe(false);
  });

  it.each([
    ['emitido para outro app', { audience: 'outro-app.apps.googleusercontent.com' }],
    ['de outro emissor', { issuer: 'https://falso.example.com' }],
    ['expirado', { expiresIn: '-1m' }],
  ])('recusa token %s', async (_label, options) => {
    await expect(verifier.verify(await googleToken({}, options))).resolves.toBeNull();
  });

  it('recusa token assinado com outra chave', async () => {
    await expect(verifier.verify(await googleToken({}, { key: otherKey }))).resolves.toBeNull();
  });

  it('recusa lixo', async () => {
    await expect(verifier.verify('nao.e.token')).resolves.toBeNull();
  });
});
