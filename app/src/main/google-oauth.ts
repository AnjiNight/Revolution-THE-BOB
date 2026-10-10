import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Login com Google no app desktop (DA24): OAuth 2.0 com PKCE e redirecionamento para um
 * endereço local temporário (127.0.0.1), como o Google recomenda para "apps instalados".
 * O resultado é o ID token, que o servidor verifica antes de criar a sessão.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleOAuthConfig {
  clientId: string;
  /** Em apps desktop o Google exige o "client secret", mas ele não é tratado como segredo. */
  clientSecret: string;
}

export interface GoogleOAuthDeps {
  openExternal: (url: string) => Promise<void>;
  fetchFn?: typeof fetch;
  /** Tempo máximo esperando a pessoa concluir o login no navegador. */
  timeoutMs?: number;
}

export type GoogleOAuthResult =
  { ok: true; idToken: string } | { ok: false; error: 'google_cancelled' | 'server_unavailable' };

const DONE_PAGE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>Simulador de Investimentos</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center">
<h1>Pronto!</h1><p>Você já pode fechar esta aba e voltar ao Simulador de Investimentos.</p>
</body></html>`;

export function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/** Par PKCE: o verificador fica no app; só o desafio (hash) vai para o navegador. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export class GoogleOAuthClient {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly deps: GoogleOAuthDeps,
  ) {}

  async signIn(): Promise<GoogleOAuthResult> {
    const pkce = createPkcePair();
    const state = base64url(randomBytes(16));

    const callback = await this.waitForCallback(state);
    const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state,
      prompt: 'select_account',
    }).toString();

    try {
      await this.deps.openExternal(authUrl.toString());
    } catch {
      callback.close();
      return { ok: false, error: 'google_cancelled' };
    }

    const code = await callback.code;
    if (!code) return { ok: false, error: 'google_cancelled' };
    return this.exchange(code, pkce.verifier, redirectUri);
  }

  private async exchange(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<GoogleOAuthResult> {
    try {
      const response = await (this.deps.fetchFn ?? fetch)(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
      if (!response.ok || typeof json?.id_token !== 'string') {
        return { ok: false, error: 'google_cancelled' };
      }
      return { ok: true, idToken: json.id_token };
    } catch {
      return { ok: false, error: 'server_unavailable' };
    }
  }

  /** Servidor local de uso único que recebe o retorno do Google e confere o "state". */
  private waitForCallback(
    expectedState: string,
  ): Promise<{ port: number; code: Promise<string | null>; close: () => void }> {
    return new Promise((resolveServer, rejectServer) => {
      let finish: (code: string | null) => void = () => undefined;
      const code = new Promise<string | null>((resolve) => {
        finish = resolve;
      });

      const server: Server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') {
          response.writeHead(404).end();
          return;
        }
        const ok = url.searchParams.get('state') === expectedState;
        const received = ok ? url.searchParams.get('code') : null;
        response.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
        response.end(ok ? DONE_PAGE : 'Requisição inválida.');
        done(received);
      });

      const timer = setTimeout(() => done(null), this.deps.timeoutMs ?? 5 * 60_000);
      const done = (value: string | null) => {
        clearTimeout(timer);
        server.close();
        finish(value);
      };

      server.on('error', rejectServer);
      server.listen(0, '127.0.0.1', () => {
        resolveServer({
          port: (server.address() as AddressInfo).port,
          code,
          close: () => done(null),
        });
      });
    });
  }
}
