import type { AuthResult } from '../shared/auth-ipc.js';
import type { AuthClient } from './auth-client.js';
import type { GoogleOAuthClient } from './google-oauth.js';

/**
 * Orquestra o login com Google (DA24). No primeiro acesso o servidor pede o aceite dos termos:
 * o ID token fica guardado só na memória até a pessoa aceitar ou desistir.
 */
export class GoogleSignIn {
  private pendingIdToken: string | null = null;

  constructor(
    private readonly oauth: GoogleOAuthClient | null,
    private readonly auth: AuthClient,
  ) {}

  get available(): boolean {
    return this.oauth !== null;
  }

  async signIn(): Promise<AuthResult> {
    this.pendingIdToken = null;
    if (!this.oauth) return { ok: false, error: 'google_login_unavailable' };
    const google = await this.oauth.signIn();
    if (!google.ok) return { ok: false, error: google.error };
    const result = await this.auth.loginWithGoogle(google.idToken);
    if (!result.ok && result.error === 'terms_required') this.pendingIdToken = google.idToken;
    return result;
  }

  async acceptTermsAndContinue(): Promise<AuthResult> {
    const idToken = this.pendingIdToken;
    this.pendingIdToken = null;
    if (!idToken) return { ok: false, error: 'google_cancelled' };
    return this.auth.loginWithGoogle(idToken, true);
  }
}
