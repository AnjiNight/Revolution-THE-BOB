import { AUTH_PATHS, PROFILE_PATHS } from '@simulador/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthClient } from './auth-client.js';
import { MemorySecretStore } from './secret-store.js';

const user = { id: 'u1', name: 'Ana', email: 'ana@exemplo.com', role: 'user' as const };
const profile = {
  ...user,
  hasPassword: true,
  hasGoogle: false,
  createdAt: '2026-10-10T12:00:00.000Z',
};

/** Servidor falso com o comportamento das rotas da SPEC-002. */
class FakeServer {
  calls: Array<{ method: string; path: string; authorization?: string }> = [];
  validAccess = new Set<string>();
  validRefresh = new Set<string>();
  counter = 0;
  down = false;

  issue() {
    this.counter += 1;
    const pair = { accessToken: `access-${this.counter}`, refreshToken: `refresh-${this.counter}` };
    this.validAccess.add(pair.accessToken);
    this.validRefresh.add(pair.refreshToken);
    return pair;
  }

  expireAccessTokens() {
    this.validAccess.clear();
  }

  fetch: typeof fetch = async (input, init) => {
    if (this.down) throw new TypeError('fetch failed');
    const url = new URL(input.toString());
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, string>) : {};
    this.calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      ...(headers.authorization ? { authorization: headers.authorization } : {}),
    });
    const json = (status: number, data: unknown) => Response.json(data, { status });

    switch (url.pathname) {
      case AUTH_PATHS.login:
        return body.password === 'certa'
          ? json(200, { user, ...this.issue() })
          : json(401, { error: 'invalid_credentials', message: 'x' });
      case AUTH_PATHS.collaboratorLogin:
        return body.email === 'nicoly@exemplo.com'
          ? json(200, { user: { ...user, role: 'collaborator' }, ...this.issue() })
          : json(403, { error: 'wrong_account_type', message: 'x' });
      case AUTH_PATHS.google:
        return body.acceptedTerms
          ? json(200, { user, ...this.issue() })
          : json(400, { error: 'terms_required', message: 'x' });
      case AUTH_PATHS.register:
        if (body.email === 'usado@exemplo.com')
          return json(409, { error: 'email_in_use', message: 'x' });
        if (body.password === 'x') {
          return json(400, {
            error: 'validation_error',
            message: 'x',
            fields: { password: 'too_short' },
          });
        }
        // SPEC-039: conta pendente, sem sessão.
        return new Response(null, { status: 202 });
      case AUTH_PATHS.emailConfirmationConfirm:
        return body.code === 'K7QM4XPD'
          ? json(200, { user, ...this.issue() })
          : json(400, { error: 'invalid_confirmation_code', message: 'x' });
      case AUTH_PATHS.emailConfirmationResend:
        return new Response(null, { status: 202 });
      case PROFILE_PATHS.emailConfirm:
        return body.code === 'K7QM4XPD'
          ? json(200, { user: { ...profile, email: 'novo@exemplo.com' } })
          : json(400, { error: 'invalid_confirmation_code', message: 'x' });
      case AUTH_PATHS.refresh:
        if (!this.validRefresh.delete(body.refreshToken ?? '')) {
          return json(401, { error: 'invalid_refresh_token', message: 'x' });
        }
        return json(200, this.issue());
      case AUTH_PATHS.logout:
        this.validRefresh.delete(body.refreshToken ?? '');
        return new Response(null, { status: 204 });
      case AUTH_PATHS.me: {
        const token = headers.authorization?.replace('Bearer ', '') ?? '';
        if (!this.validAccess.has(token)) return json(401, { error: 'unauthorized', message: 'x' });
        return init?.method === 'PATCH'
          ? json(200, { user: { ...profile, name: body.name } })
          : json(200, { user });
      }
      case PROFILE_PATHS.email:
        // SPEC-039: o e-mail só muda depois do código; o servidor responde 202 sem corpo.
        return body.currentPassword === 'certa'
          ? new Response(null, { status: 202 })
          : json(401, { error: 'invalid_password', message: 'x' });
      case PROFILE_PATHS.password:
        // O servidor encerra as sessões anteriores e devolve uma nova.
        this.validRefresh.clear();
        return json(200, { user, ...this.issue() });
      case AUTH_PATHS.passwordResetRequest:
        return new Response(null, { status: 202 });
      case AUTH_PATHS.passwordResetConfirm:
        return body.code === 'K7QM4XPD'
          ? new Response(null, { status: 204 })
          : json(400, { error: 'invalid_reset_code', message: 'x' });
      case PROFILE_PATHS.export:
        return json(200, { format: 'simulador-investimentos/dados-pessoais', version: 1 });
      case PROFILE_PATHS.deletionRequest:
        return new Response(null, { status: 202 });
      case PROFILE_PATHS.deletionConfirm:
        if (body.code !== 'K7QM4XPD') {
          return json(400, { error: 'invalid_confirmation_code', message: 'x' });
        }
        this.validRefresh.clear();
        return new Response(null, { status: 204 });
      case PROFILE_PATHS.consents:
        return this.validAccess.has(headers.authorization?.replace('Bearer ', '') ?? '')
          ? json(200, { consents: [], currentVersion: '1' })
          : json(401, { error: 'unauthorized', message: 'x' });
      default:
        return json(500, { error: 'internal_error', message: 'x' });
    }
  };
}

let server: FakeServer;
let store: MemorySecretStore;
let client: AuthClient;

beforeEach(() => {
  server = new FakeServer();
  store = new MemorySecretStore();
  client = new AuthClient({
    serverUrl: () => 'http://localhost:3333',
    allowInsecureLocalhost: true,
    store,
    fetchFn: server.fetch,
  });
});

describe('login e cadastro', () => {
  it('login guarda só o token de renovação no cofre (CA12)', async () => {
    await expect(client.login({ email: 'ana@exemplo.com', password: 'certa' })).resolves.toEqual({
      ok: true,
      user,
    });
    await expect(store.load()).resolves.toBe('refresh-1');
  });

  it('traduz os erros do servidor', async () => {
    await expect(client.login({ email: 'ana@exemplo.com', password: 'errada' })).resolves.toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
    await expect(
      client.register({
        name: 'A',
        email: 'usado@exemplo.com',
        password: 'x',
        acceptedTerms: true,
      }),
    ).resolves.toEqual({ ok: false, error: 'email_in_use' });
    await expect(
      client.register({ name: 'A', email: 'b@exemplo.com', password: 'x', acceptedTerms: true }),
    ).resolves.toEqual({ ok: false, error: 'validation_error', fields: { password: 'too_short' } });
    await expect(store.load()).resolves.toBeNull();
  });

  it('servidor fora do ar → server_unavailable', async () => {
    server.down = true;
    await expect(client.login({ email: 'a@b.com', password: 'certa' })).resolves.toEqual({
      ok: false,
      error: 'server_unavailable',
    });
  });

  it('endereço inválido → invalid_url, sem chamar a rede', async () => {
    const insecure = new AuthClient({
      serverUrl: () => 'http://servidor-remoto.com',
      allowInsecureLocalhost: true,
      store,
      fetchFn: server.fetch,
    });
    await expect(insecure.login({ email: 'a@b.com', password: 'certa' })).resolves.toEqual({
      ok: false,
      error: 'invalid_url',
    });
    expect(server.calls).toHaveLength(0);
  });
});

describe('sessão ao abrir o app (CA14)', () => {
  it('com token guardado válido, entra direto', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    const reopened = new AuthClient({
      serverUrl: () => 'http://localhost:3333',
      allowInsecureLocalhost: true,
      store,
      fetchFn: server.fetch,
    });
    await expect(reopened.restore()).resolves.toEqual({ ok: true, user });
    await expect(store.load()).resolves.toBe('refresh-2'); // o token foi trocado
  });

  it('com token guardado inválido, apaga a sessão e pede login', async () => {
    await store.save('refresh-revogado');
    await expect(client.restore()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    await expect(store.load()).resolves.toBeNull();
  });

  it('sem token guardado, pede login sem chamar o servidor', async () => {
    await expect(client.restore()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(server.calls).toHaveLength(0);
  });

  it('servidor fora do ar não apaga a sessão guardada', async () => {
    await store.save('refresh-guardado');
    server.down = true;
    await expect(client.restore()).resolves.toEqual({ ok: false, error: 'server_unavailable' });
    await expect(store.load()).resolves.toBe('refresh-guardado');
  });
});

describe('renovação automática (CA13, RF02)', () => {
  it('quando o token de acesso expira, renova e repete a requisição sem o usuário perceber', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    server.expireAccessTokens();

    await expect(client.authorizedRequest('GET', AUTH_PATHS.me)).resolves.toEqual({ user });
    expect(server.calls.map((c) => c.path)).toEqual([
      AUTH_PATHS.login,
      AUTH_PATHS.me,
      AUTH_PATHS.refresh,
      AUTH_PATHS.me,
    ]);
    expect(server.calls.at(-1)?.authorization).toBe('Bearer access-2');
  });

  it('várias requisições ao mesmo tempo fazem uma única renovação', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    server.expireAccessTokens();
    await Promise.all([
      client.authorizedRequest('GET', AUTH_PATHS.me),
      client.authorizedRequest('GET', AUTH_PATHS.me),
      client.authorizedRequest('GET', AUTH_PATHS.me),
    ]);
    expect(server.calls.filter((c) => c.path === AUTH_PATHS.refresh)).toHaveLength(1);
  });
});

describe('logout (CA09)', () => {
  it('apaga a sessão do dispositivo e avisa o servidor', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await client.logout();
    await expect(store.load()).resolves.toBeNull();
    expect(server.validRefresh.has('refresh-1')).toBe(false);
    await expect(client.restore()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });

  it('funciona mesmo com o servidor fora do ar', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    server.down = true;
    await expect(client.logout()).resolves.toBeUndefined();
    await expect(store.load()).resolves.toBeNull();
  });
});

describe('colaborador e Google', () => {
  it('Área do colaborador usa a rota própria', async () => {
    await expect(
      client.collaboratorLogin({ email: 'nicoly@exemplo.com', password: 'x' }),
    ).resolves.toMatchObject({ ok: true, user: { role: 'collaborator' } });
    expect(server.calls.at(-1)?.path).toBe(AUTH_PATHS.collaboratorLogin);
    await expect(
      client.collaboratorLogin({ email: 'ana@exemplo.com', password: 'x' }),
    ).resolves.toEqual({
      ok: false,
      error: 'wrong_account_type',
    });
  });

  it('Google sem aceite → terms_required; com aceite → sessão guardada', async () => {
    await expect(client.loginWithGoogle('id-token')).resolves.toEqual({
      ok: false,
      error: 'terms_required',
    });
    await expect(client.loginWithGoogle('id-token', true)).resolves.toEqual({ ok: true, user });
    await expect(store.load()).resolves.toBe('refresh-1');
  });
});

describe('perfil (SPEC-003)', () => {
  it('edita o nome e atualiza o usuário da sessão', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(client.updateName({ name: 'Ana Lima' })).resolves.toMatchObject({
      ok: true,
      data: { name: 'Ana Lima' },
    });
    await expect(client.restore()).resolves.toEqual({
      ok: true,
      user: { ...user, name: 'Ana Lima' },
    });
  });

  it('senha atual errada → invalid_password, sem derrubar a sessão', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(
      client.changeEmail({ email: 'novo@exemplo.com', currentPassword: 'errada' }),
    ).resolves.toEqual({ ok: false, error: 'invalid_password' });
    await expect(store.load()).resolves.toBe('refresh-1');
  });

  it('troca de senha guarda a sessão nova devolvida pelo servidor', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(
      client.changePassword({ currentPassword: 'certa', newPassword: 'nova-senha-1' }),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(store.load()).resolves.toBe('refresh-2');
    expect(server.validRefresh.has('refresh-1')).toBe(false);
  });

  it('sem sessão → unauthorized', async () => {
    await expect(client.listConsents()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('recuperação de senha (SPEC-004)', () => {
  it('pedido aceito (202, sem corpo) vira sucesso, sem abrir sessão', async () => {
    await expect(
      client.requestPasswordReset({ email: 'ana@exemplo.com', locale: 'pt-BR' }),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(store.load()).resolves.toBeNull();
  });

  it('código certo → sucesso; código errado → invalid_reset_code', async () => {
    const input = { email: 'ana@exemplo.com', newPassword: 'nova-senha-1', locale: 'en' as const };
    await expect(client.confirmPasswordReset({ ...input, code: 'K7QM4XPD' })).resolves.toEqual({
      ok: true,
      data: null,
    });
    await expect(client.confirmPasswordReset({ ...input, code: 'ZZZZZZZZ' })).resolves.toEqual({
      ok: false,
      error: 'invalid_reset_code',
    });
    await expect(store.load()).resolves.toBeNull();
  });

  it('servidor fora do ar → server_unavailable', async () => {
    server.down = true;
    await expect(
      client.requestPasswordReset({ email: 'ana@exemplo.com', locale: 'pt-BR' }),
    ).resolves.toEqual({ ok: false, error: 'server_unavailable' });
  });
});

describe('confirmação de e-mail (SPEC-039)', () => {
  const registration = {
    name: 'Ana',
    email: 'ana@exemplo.com',
    password: 'senha-bem-longa',
    acceptedTerms: true as const,
  };

  it('cadastro aceito (202) não abre sessão; a confirmação abre', async () => {
    await expect(client.register(registration)).resolves.toEqual({ ok: true, data: null });
    await expect(store.load()).resolves.toBeNull();

    await expect(
      client.confirmEmail({ email: 'ana@exemplo.com', code: 'ZZZZZZZZ' }),
    ).resolves.toEqual({ ok: false, error: 'invalid_confirmation_code' });
    await expect(
      client.confirmEmail({ email: 'ana@exemplo.com', code: 'K7QM4XPD' }),
    ).resolves.toEqual({ ok: true, user });
    await expect(store.load()).resolves.toBe('refresh-1');
  });

  it('reenviar código responde sucesso sem sessão', async () => {
    await expect(
      client.resendConfirmation({ email: 'ana@exemplo.com', locale: 'en' }),
    ).resolves.toEqual({ ok: true, data: null });
  });

  it('troca de e-mail em duas etapas', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(
      client.changeEmail({ email: 'novo@exemplo.com', currentPassword: 'certa' }),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(client.confirmEmailChange({ code: 'K7QM4XPD' })).resolves.toMatchObject({
      ok: true,
      data: { email: 'novo@exemplo.com' },
    });
    await expect(client.restore()).resolves.toMatchObject({
      ok: true,
      user: { email: 'novo@exemplo.com' },
    });
  });
});

describe('dados pessoais (SPEC-034)', () => {
  it('exporta com a sessão atual', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(client.exportData()).resolves.toMatchObject({
      ok: true,
      data: { format: 'simulador-investimentos/dados-pessoais', version: 1 },
    });
  });

  it('código errado não apaga nada; o certo apaga a conta e a sessão do dispositivo', async () => {
    await client.login({ email: 'ana@exemplo.com', password: 'certa' });
    await expect(client.requestDeletion({ locale: 'pt-BR' })).resolves.toEqual({
      ok: true,
      data: null,
    });
    await expect(client.confirmDeletion({ code: 'ZZZZZZZZ' })).resolves.toEqual({
      ok: false,
      error: 'invalid_confirmation_code',
    });
    await expect(store.load()).resolves.toBe('refresh-1');

    await expect(client.confirmDeletion({ code: 'K7QM4XPD' })).resolves.toEqual({
      ok: true,
      data: null,
    });
    await expect(store.load()).resolves.toBeNull();
    await expect(client.restore()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });
});
