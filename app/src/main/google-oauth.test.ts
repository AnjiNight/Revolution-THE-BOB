import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPkcePair, GoogleOAuthClient } from './google-oauth.js';

const config = { clientId: 'app.apps.googleusercontent.com', clientSecret: 'nao-e-segredo' };

/** Imita o navegador: lê a URL do Google e chama o endereço local de retorno. */
function fakeBrowser(answer: (params: URLSearchParams) => Record<string, string> | 'ignore') {
  const opened: URL[] = [];
  const openExternal = vi.fn(async (raw: string) => {
    const url = new URL(raw);
    opened.push(url);
    const reply = answer(url.searchParams);
    if (reply === 'ignore') return;
    const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
    callback.search = new URLSearchParams(reply).toString();
    setTimeout(() => void fetch(callback), 5);
  });
  return { openExternal, opened };
}

function fakeTokenEndpoint(idToken = 'id-token-do-google') {
  const bodies: URLSearchParams[] = [];
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(new URLSearchParams(init?.body as string));
    return Response.json({ id_token: idToken, access_token: 'x' });
  }) as unknown as typeof fetch;
  return { fetchFn, bodies };
}

describe('createPkcePair', () => {
  it('o desafio é o SHA-256 do verificador (S256)', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe('GoogleOAuthClient (DA24)', () => {
  it('abre o Google com PKCE, recebe o código no endereço local e troca pelo ID token', async () => {
    const browser = fakeBrowser((params) => ({
      code: 'codigo-123',
      state: params.get('state') ?? '',
    }));
    const token = fakeTokenEndpoint();
    const client = new GoogleOAuthClient(config, {
      openExternal: browser.openExternal,
      fetchFn: token.fetchFn,
    });

    await expect(client.signIn()).resolves.toEqual({ ok: true, idToken: 'id-token-do-google' });

    const auth = browser.opened[0];
    expect(`${auth?.origin}${auth?.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth?.searchParams.get('client_id')).toBe(config.clientId);
    expect(auth?.searchParams.get('scope')).toBe('openid email profile');
    expect(auth?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth?.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const exchange = token.bodies[0];
    expect(exchange?.get('code')).toBe('codigo-123');
    expect(exchange?.get('grant_type')).toBe('authorization_code');
    expect(exchange?.get('redirect_uri')).toBe(auth?.searchParams.get('redirect_uri'));
    // O verificador enviado no fim corresponde ao desafio enviado no começo.
    expect(
      createHash('sha256')
        .update(exchange?.get('code_verifier') ?? '')
        .digest('base64url'),
    ).toBe(auth?.searchParams.get('code_challenge'));
  });

  it('recusa retorno com "state" diferente (proteção contra falsificação)', async () => {
    const browser = fakeBrowser(() => ({ code: 'codigo-falso', state: 'outro-state' }));
    const token = fakeTokenEndpoint();
    const client = new GoogleOAuthClient(config, {
      openExternal: browser.openExternal,
      fetchFn: token.fetchFn,
    });
    await expect(client.signIn()).resolves.toEqual({ ok: false, error: 'google_cancelled' });
    expect(token.fetchFn).not.toHaveBeenCalled();
  });

  it('pessoa recusou no Google → cancelado', async () => {
    const browser = fakeBrowser((params) => ({
      error: 'access_denied',
      state: params.get('state') ?? '',
    }));
    const client = new GoogleOAuthClient(config, { openExternal: browser.openExternal });
    await expect(client.signIn()).resolves.toEqual({ ok: false, error: 'google_cancelled' });
  });

  it('ninguém concluiu o login a tempo → cancelado', async () => {
    const browser = fakeBrowser(() => 'ignore');
    const client = new GoogleOAuthClient(config, {
      openExternal: browser.openExternal,
      timeoutMs: 50,
    });
    await expect(client.signIn()).resolves.toEqual({ ok: false, error: 'google_cancelled' });
  });

  it('Google fora do ar na troca do código → server_unavailable', async () => {
    const browser = fakeBrowser((params) => ({ code: 'c', state: params.get('state') ?? '' }));
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const client = new GoogleOAuthClient(config, {
      openExternal: browser.openExternal,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(client.signIn()).resolves.toEqual({ ok: false, error: 'server_unavailable' });
  });
});
