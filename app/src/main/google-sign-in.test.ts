import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from './auth-client.js';
import type { GoogleOAuthClient } from './google-oauth.js';
import { GoogleSignIn } from './google-sign-in.js';

const user = { id: 'u1', name: 'Ana', email: 'ana@gmail.com', role: 'user' as const };

function setup(firstResult: Awaited<ReturnType<AuthClient['loginWithGoogle']>>) {
  const oauth = { signIn: vi.fn().mockResolvedValue({ ok: true, idToken: 'id-token' }) };
  const loginWithGoogle = vi
    .fn()
    .mockResolvedValueOnce(firstResult)
    .mockResolvedValue({ ok: true, user });
  const auth = { loginWithGoogle } as unknown as AuthClient;
  return {
    google: new GoogleSignIn(oauth as unknown as GoogleOAuthClient, auth),
    loginWithGoogle,
  };
}

describe('GoogleSignIn', () => {
  it('sem configuração do Google, fica indisponível', async () => {
    const google = new GoogleSignIn(null, {} as AuthClient);
    expect(google.available).toBe(false);
    await expect(google.signIn()).resolves.toEqual({
      ok: false,
      error: 'google_login_unavailable',
    });
  });

  it('primeiro acesso: guarda o token até a pessoa aceitar os termos', async () => {
    const { google, loginWithGoogle } = setup({ ok: false, error: 'terms_required' });
    await expect(google.signIn()).resolves.toEqual({ ok: false, error: 'terms_required' });
    await expect(google.acceptTermsAndContinue()).resolves.toEqual({ ok: true, user });
    expect(loginWithGoogle).toHaveBeenLastCalledWith('id-token', true);
    // O token não fica guardado depois de usado.
    await expect(google.acceptTermsAndContinue()).resolves.toEqual({
      ok: false,
      error: 'google_cancelled',
    });
  });

  it('acesso normal não pede termos', async () => {
    const { google, loginWithGoogle } = setup({ ok: true, user });
    await expect(google.signIn()).resolves.toEqual({ ok: true, user });
    expect(loginWithGoogle).toHaveBeenCalledWith('id-token');
  });
});
