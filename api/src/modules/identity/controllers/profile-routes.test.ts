import { AUTH_PATHS, PROFILE_PATHS, TERMS_VERSION } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type LogCapture } from '../../../testing/test-app.js';

const PASSWORD = 'senha-bem-longa';

let app: FastifyInstance;
let logs: LogCapture;
let ctx: Awaited<ReturnType<typeof buildTestApp>>;

afterEach(async () => {
  await app.close();
});

async function start(rateLimitPerMinute?: number) {
  ctx = await buildTestApp(rateLimitPerMinute ? { rateLimitPerMinute } : {});
  ({ app, logs } = ctx);
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string };
}

/** Cadastro já confirmado (SPEC-039), com a sessão aberta pela confirmação. */
function register(email = 'ana@exemplo.com'): Promise<Session> {
  return ctx.registerConfirmed({ email, password: PASSWORD });
}

const call = (
  method: 'GET' | 'PATCH' | 'PUT' | 'POST',
  url: string,
  token?: string,
  payload?: object,
) =>
  app.inject({
    method,
    url,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    ...(payload ? { payload } : {}),
  });

describe('GET e PATCH /api/me (CA01, CA02)', () => {
  it('GET devolve o perfil com as formas de acesso', async () => {
    await start();
    const { accessToken } = await register();
    const res = await call('GET', PROFILE_PATHS.profile, accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: {
        id: expect.any(String),
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        role: 'user',
        hasPassword: true,
        hasGoogle: false,
        createdAt: expect.any(String),
        pendingEmail: null,
      },
    });
  });

  it('PATCH salva o nome; nome inválido → 400 com o campo', async () => {
    await start();
    const { accessToken } = await register();
    const ok = await call('PATCH', PROFILE_PATHS.profile, accessToken, { name: ' Ana Lima ' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ user: { name: 'Ana Lima' } });

    const bad = await call('PATCH', PROFILE_PATHS.profile, accessToken, { name: 'A' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: 'validation_error', fields: { name: 'too_short' } });
  });

  it.each([
    ['GET', PROFILE_PATHS.profile],
    ['PATCH', PROFILE_PATHS.profile],
    ['PUT', PROFILE_PATHS.email],
    ['POST', PROFILE_PATHS.emailConfirm],
    ['PUT', PROFILE_PATHS.password],
    ['GET', PROFILE_PATHS.consents],
    ['POST', PROFILE_PATHS.consents],
  ] as const)('%s %s sem token → 401', async (method, url) => {
    await start();
    const res = await call(method, url, undefined, {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });
});

describe('PUT /api/me/email e POST /api/me/email/confirm (CA03–CA05, CA09; SPEC-039 CA08)', () => {
  it('202 sem trocar ainda; com o código do e-mail novo, troca e o login passa a usar o novo', async () => {
    await start();
    const { accessToken } = await register();
    const res = await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'Ana.Lima@Exemplo.com',
      currentPassword: PASSWORD,
    });
    expect(res.statusCode).toBe(202);
    await ctx.background.settle();
    const pending = await call('GET', PROFILE_PATHS.profile, accessToken);
    expect(pending.json()).toMatchObject({
      user: { email: 'ana@exemplo.com', pendingEmail: 'ana.lima@exemplo.com' },
    });

    const confirmed = await call('POST', PROFILE_PATHS.emailConfirm, accessToken, {
      code: ctx.mailer.lastCode('ana.lima@exemplo.com'),
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      user: { email: 'ana.lima@exemplo.com', pendingEmail: null },
    });

    const login = await call('POST', AUTH_PATHS.login, undefined, {
      email: 'ana.lima@exemplo.com',
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
  });

  it('código errado → 400 invalid_confirmation_code e o e-mail não muda', async () => {
    await start();
    const { accessToken } = await register();
    await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'novo@exemplo.com',
      currentPassword: PASSWORD,
    });
    const res = await call('POST', PROFILE_PATHS.emailConfirm, accessToken, { code: 'ZZZZZZZZ' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_confirmation_code' });
    const profile = await call('GET', PROFILE_PATHS.profile, accessToken);
    expect(profile.json()).toMatchObject({ user: { email: 'ana@exemplo.com' } });
  });

  it('409 para e-mail de outra conta, 401 para senha atual errada', async () => {
    await start();
    const { accessToken } = await register();
    await register('bia@exemplo.com');

    const taken = await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'BIA@exemplo.com',
      currentPassword: PASSWORD,
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: 'email_in_use' });

    const wrong = await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'novo@exemplo.com',
      currentPassword: 'errada',
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'invalid_password', message: 'Senha atual incorreta.' });
  });

  it('só altera a conta do token: um id no corpo é ignorado (RB03)', async () => {
    await start();
    const ana = await register();
    const bia = await register('bia@exemplo.com');
    await call('PATCH', PROFILE_PATHS.profile, ana.accessToken, {
      name: 'Trocado',
      id: bia.user.id,
    });
    const biaProfile = await call('GET', PROFILE_PATHS.profile, bia.accessToken);
    expect(biaProfile.json()).toMatchObject({
      user: { name: 'Ana Souza', email: 'bia@exemplo.com' },
    });
  });

  it('conta só com Google → 403 email_change_not_allowed', async () => {
    await start();
    const google = await call('POST', AUTH_PATHS.google, undefined, {
      idToken: 'google:sub-1:gi@gmail.com',
      acceptedTerms: true,
    });
    const { accessToken } = google.json<Session>();
    const res = await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'novo@exemplo.com',
      currentPassword: 'qualquer',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'email_change_not_allowed' });

    const password = await call('PUT', PROFILE_PATHS.password, accessToken, {
      currentPassword: 'qualquer',
      newPassword: 'nova-senha-1',
    });
    expect(password.statusCode).toBe(403);
    expect(password.json()).toMatchObject({ error: 'password_change_not_allowed' });
  });
});

describe('PUT /api/me/password (CA07)', () => {
  it('devolve sessão nova e derruba as anteriores', async () => {
    await start();
    const first = await register();
    const res = await call('PUT', PROFILE_PATHS.password, first.accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-longa',
    });
    expect(res.statusCode).toBe(200);
    const session = res.json<Session>();
    expect(session.refreshToken).toEqual(expect.any(String));

    const old = await call('POST', AUTH_PATHS.refresh, undefined, {
      refreshToken: first.refreshToken,
    });
    expect(old.statusCode).toBe(401);
    const current = await call('POST', AUTH_PATHS.refresh, undefined, {
      refreshToken: session.refreshToken,
    });
    expect(current.statusCode).toBe(200);
  });

  it('nova igual à atual → 400 same_password', async () => {
    await start();
    const { accessToken } = await register();
    const res = await call('PUT', PROFILE_PATHS.password, accessToken, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ fields: { newPassword: 'same_password' } });
  });
});

describe('consentimentos (CA10, CA11)', () => {
  it('lista e registra novo aceite; versão diferente da vigente → 400', async () => {
    await start();
    const { accessToken } = await register();

    const list = await call('GET', PROFILE_PATHS.consents, accessToken);
    expect(list.json()).toEqual({
      consents: [{ type: 'terms', version: TERMS_VERSION, acceptedAt: expect.any(String) }],
      currentVersion: TERMS_VERSION,
    });

    const accepted = await call('POST', PROFILE_PATHS.consents, accessToken, {
      type: 'terms',
      version: TERMS_VERSION,
    });
    expect(accepted.statusCode).toBe(201);

    const wrong = await call('POST', PROFILE_PATHS.consents, accessToken, {
      type: 'terms',
      version: '0',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ fields: { version: 'invalid_version' } });

    const after = await call('GET', PROFILE_PATHS.consents, accessToken);
    expect(after.json<{ consents: unknown[] }>().consents).toHaveLength(2);
  });
});

describe('segurança (CA08, CA12)', () => {
  it('a 11ª tentativa em um minuto nas rotas com senha atual → 429', async () => {
    await start(10);
    const { accessToken } = await register();
    const attempt = () =>
      call('PUT', PROFILE_PATHS.password, accessToken, {
        currentPassword: 'errada',
        newPassword: 'nova-senha-1',
      });
    // O cadastro acima não conta: o limite é por rota.
    for (let i = 0; i < 10; i += 1) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
  });

  it('logs não contêm nome, e-mail, senhas nem tokens', async () => {
    await start();
    const { accessToken } = await register();
    await call('PATCH', PROFILE_PATHS.profile, accessToken, { name: 'Nome Secreto' });
    await call('PUT', PROFILE_PATHS.email, accessToken, {
      email: 'secreto@exemplo.com',
      currentPassword: PASSWORD,
    });
    await ctx.background.settle();
    const code = ctx.mailer.lastCode('secreto@exemplo.com');
    await call('POST', PROFILE_PATHS.emailConfirm, accessToken, { code });
    await ctx.background.settle();
    await call('PUT', PROFILE_PATHS.password, accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'senha-nova-secreta',
    });
    for (const secret of [
      'Nome Secreto',
      'secreto@exemplo.com',
      PASSWORD,
      'senha-nova-secreta',
      'hash:',
      accessToken,
      code,
    ]) {
      expect(logs.text).not.toContain(secret);
    }
  });
});
