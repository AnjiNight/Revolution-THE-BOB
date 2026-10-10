import {
  AUTH_PATHS,
  PROFILE_PATHS,
  TERMS_VERSION,
  type AuthErrorCode,
  type AuthSession,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type ConsentList,
  type FieldErrors,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type TokenPair,
  type UpdateNameInput,
  type UserProfile,
} from '@simulador/shared';
import type { AuthResult, ClientAuthError, ClientResult } from '../shared/auth-ipc.js';
import type { SecretStore } from './secret-store.js';
import { validateServerUrl } from './server-health.js';

export interface AuthClientOptions {
  serverUrl: () => string;
  allowInsecureLocalhost: boolean;
  store: SecretStore;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const KNOWN_ERRORS: readonly AuthErrorCode[] = [
  'validation_error',
  'email_in_use',
  'invalid_credentials',
  'invalid_refresh_token',
  'unauthorized',
  'rate_limited',
  'wrong_account_type',
  'terms_required',
  'google_login_unavailable',
  'google_token_invalid',
  'google_email_not_verified',
  'invalid_password',
  'email_change_not_allowed',
  'password_change_not_allowed',
];

class RequestFailed extends Error {
  constructor(
    readonly error: ClientAuthError,
    readonly fields?: FieldErrors,
  ) {
    super(error);
  }
}

/**
 * Cliente de autenticação do processo principal (SPEC-002).
 * O token de acesso fica só na memória; o de renovação vai para o SecretStore (RNF08).
 */
export class AuthClient {
  private accessToken: string | null = null;
  private user: PublicUser | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly options: AuthClientOptions) {}

  /** Ao abrir o app: usa o token de renovação guardado para entrar sem pedir senha. */
  async restore(): Promise<AuthResult> {
    if (this.user) return { ok: true, user: this.user };
    const stored = await this.options.store.load();
    if (!stored) return { ok: false, error: 'unauthorized' };
    try {
      if (!(await this.refresh())) return { ok: false, error: 'unauthorized' };
      return await this.loadCurrentUser();
    } catch (error) {
      return failure(error);
    }
  }

  register(input: RegisterInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.register, input);
  }

  login(input: LoginInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.login, input);
  }

  /** Área do colaborador: só aceita contas criadas pela equipe (SPEC-002 §4). */
  collaboratorLogin(input: LoginInput): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.collaboratorLogin, input);
  }

  /** DA24: envia ao servidor o ID token obtido do Google. */
  loginWithGoogle(idToken: string, acceptedTerms?: boolean): Promise<AuthResult> {
    return this.startSession(AUTH_PATHS.google, {
      idToken,
      ...(acceptedTerms ? { acceptedTerms: true } : {}),
    });
  }

  /** Encerra a sessão no servidor (melhor esforço) e apaga tudo do dispositivo. */
  async logout(): Promise<void> {
    const refreshToken = await this.options.store.load();
    this.accessToken = null;
    this.user = null;
    await this.options.store.clear();
    if (refreshToken) {
      await this.request('POST', AUTH_PATHS.logout, { refreshToken }).catch(() => undefined);
    }
  }

  // --- Perfil (SPEC-003) ---

  getProfile(): Promise<ClientResult<UserProfile>> {
    return this.profileCall(async () => {
      const { user } = await this.authorizedRequest<{ user: UserProfile }>(
        'GET',
        PROFILE_PATHS.profile,
      );
      return user;
    });
  }

  updateName(input: UpdateNameInput): Promise<ClientResult<UserProfile>> {
    return this.profileCall(() => this.updateProfile('PATCH', PROFILE_PATHS.profile, input));
  }

  changeEmail(input: ChangeEmailInput): Promise<ClientResult<UserProfile>> {
    return this.profileCall(() => this.updateProfile('PUT', PROFILE_PATHS.email, input));
  }

  /** O servidor encerra todas as sessões e devolve uma nova, que passa a ser a deste dispositivo. */
  changePassword(input: ChangePasswordInput): Promise<ClientResult<null>> {
    return this.profileCall(async () => {
      const session = await this.authorizedRequest<AuthSession>(
        'PUT',
        PROFILE_PATHS.password,
        input,
      );
      await this.options.store.save(session.refreshToken);
      this.accessToken = session.accessToken;
      this.user = session.user;
      return null;
    });
  }

  listConsents(): Promise<ClientResult<ConsentList>> {
    return this.profileCall(() =>
      this.authorizedRequest<ConsentList>('GET', PROFILE_PATHS.consents),
    );
  }

  acceptTerms(): Promise<ClientResult<null>> {
    return this.profileCall(async () => {
      await this.authorizedRequest('POST', PROFILE_PATHS.consents, {
        type: 'terms',
        version: TERMS_VERSION,
      });
      return null;
    });
  }

  private async updateProfile(method: string, path: string, body: unknown): Promise<UserProfile> {
    const { user } = await this.authorizedRequest<{ user: UserProfile }>(method, path, body);
    this.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return user;
  }

  private async profileCall<T>(action: () => Promise<T>): Promise<ClientResult<T>> {
    try {
      return { ok: true, data: await action() };
    } catch (error) {
      const result = failure(error);
      return result.ok ? { ok: false, error: 'unexpected' } : result;
    }
  }

  /** Requisição autenticada; renova a sessão uma vez se o token de acesso tiver expirado (RF02). */
  async authorizedRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await this.request<T>(method, path, body, this.accessToken);
    } catch (error) {
      if (!(error instanceof RequestFailed) || error.error !== 'unauthorized') throw error;
      if (!(await this.refresh())) throw error;
      return this.request<T>(method, path, body, this.accessToken);
    }
  }

  private async startSession(path: string, input: unknown): Promise<AuthResult> {
    try {
      const session = await this.request<AuthSession>('POST', path, input);
      await this.options.store.save(session.refreshToken);
      this.accessToken = session.accessToken;
      this.user = session.user;
      return { ok: true, user: session.user };
    } catch (error) {
      return failure(error);
    }
  }

  private async loadCurrentUser(): Promise<AuthResult> {
    const { user } = await this.authorizedRequest<{ user: PublicUser }>('GET', AUTH_PATHS.me);
    this.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return { ok: true, user: this.user };
  }

  /** Troca o token de renovação; uma única troca por vez, mesmo com várias chamadas juntas. */
  private refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.options.store.load();
    if (!refreshToken) return false;
    try {
      const pair = await this.request<TokenPair>('POST', AUTH_PATHS.refresh, { refreshToken });
      await this.options.store.save(pair.refreshToken);
      this.accessToken = pair.accessToken;
      return true;
    } catch (error) {
      if (error instanceof RequestFailed && error.error === 'invalid_refresh_token') {
        this.accessToken = null;
        this.user = null;
        await this.options.store.clear();
        return false;
      }
      throw error;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    accessToken?: string | null,
  ): Promise<T> {
    const base = validateServerUrl(this.options.serverUrl(), this.options.allowInsecureLocalhost);
    if (!base) throw new RequestFailed('invalid_url');

    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(new URL(path, base), {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new RequestFailed('server_unavailable');
    }

    if (response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && json) return json as T;

    const code = json?.error as AuthErrorCode | undefined;
    if (code && KNOWN_ERRORS.includes(code)) {
      throw new RequestFailed(code, json?.fields as FieldErrors | undefined);
    }
    throw new RequestFailed(response.status >= 500 ? 'server_unavailable' : 'unexpected');
  }
}

function failure(error: unknown): AuthResult {
  if (error instanceof RequestFailed) {
    return error.fields
      ? { ok: false, error: error.error, fields: error.fields }
      : { ok: false, error: error.error };
  }
  return { ok: false, error: 'unexpected' };
}
