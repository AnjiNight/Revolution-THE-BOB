import { AUTH_PATHS } from '@simulador/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type LogCapture } from '../../../testing/test-app.js';
import { createCollaborator } from '../application/create-collaborator.js';

const body = {
  name: 'Ana Souza',
  email: 'Ana@Exemplo.com',
  password: 'senha-bem-longa',
  acceptedTerms: true,
};

let app: FastifyInstance;
let logs: LogCapture;

afterEach(async () => {
  await app.close();
});

async function start(rateLimitPerMinute?: number, google = true) {
  const ctx = await buildTestApp({ ...(rateLimitPerMinute ? { rateLimitPerMinute } : {}), google });
  ({ app, logs } = ctx);
  return ctx;
}

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });

describe('POST /api/auth/register', () => {
  it('201 com usuário e sessão (CA01)', async () => {
    await start();
    const res = await post(AUTH_PATHS.register, body);
    expect(res.statusCode).toBe(201);
    const json = res.json<Record<string, unknown>>();
    expect(json.user).toMatchObject({ name: 'Ana Souza', email: 'ana@exemplo.com', role: 'user' });
    expect(json.accessToken).toEqual(expect.any(String));
    expect(json.refreshToken).toEqual(expect.any(String));
  });

  it('409 para e-mail já usado, mesmo com maiúsculas diferentes (CA02)', async () => {
    await start();
    await post(AUTH_PATHS.register, body);
    const res = await post(AUTH_PATHS.register, { ...body, email: 'ANA@EXEMPLO.COM' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'email_in_use' });
  });

  it('400 com o problema de cada campo (CA03)', async () => {
    await start();
    const res = await post(AUTH_PATHS.register, {
      name: 'A',
      email: 'x',
      password: '123',
      acceptedTerms: false,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'validation_error',
      message: 'Dados inválidos.',
      fields: {
        name: 'too_short',
        email: 'invalid_email',
        password: 'too_short',
        acceptedTerms: 'terms_not_accepted',
      },
    });
  });

  it('400 para corpo que não é JSON', async () => {
    await start();
    const res = await app.inject({
      method: 'POST',
      url: AUTH_PATHS.register,
      headers: { 'content-type': 'application/json' },
      payload: '{quebrado',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('200 com credenciais corretas', async () => {
    await start();
    await post(AUTH_PATHS.register, body);
    const res = await post(AUTH_PATHS.login, {
      email: ' ana@EXEMPLO.com',
      password: body.password,
    });
    expect(res.statusCode).toBe(200);
  });

  it('mesma resposta para senha errada e e-mail inexistente (CA05)', async () => {
    await start();
    await post(AUTH_PATHS.register, body);
    const wrongPassword = await post(AUTH_PATHS.login, { email: body.email, password: 'errada' });
    const unknownEmail = await post(AUTH_PATHS.login, {
      email: 'ninguem@exemplo.com',
      password: body.password,
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toBe(unknownEmail.body);
    expect(wrongPassword.json()).toEqual({
      error: 'invalid_credentials',
      message: 'E-mail ou senha incorretos.',
    });
  });
});

describe('GET /api/me (CA06)', () => {
  it('200 com token válido', async () => {
    await start();
    const { accessToken } = (await post(AUTH_PATHS.register, body)).json<{
      accessToken: string;
    }>();
    const res = await app.inject({
      method: 'GET',
      url: AUTH_PATHS.me,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { email: 'ana@exemplo.com', role: 'user' } });
  });

  it.each([
    ['sem cabeçalho', undefined],
    ['esquema errado', 'Basic abc'],
    ['token inválido', 'Bearer abc.def.ghi'],
  ])('401 %s', async (_label, authorization) => {
    await start();
    const res = await app.inject({
      method: 'GET',
      url: AUTH_PATHS.me,
      ...(authorization ? { headers: { authorization } } : {}),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized', message: 'Autenticação necessária.' });
  });
});

describe('POST /api/auth/refresh e /logout (CA07, CA08, CA09)', () => {
  it('renova, recusa reuso e encerra com logout', async () => {
    await start();
    const first = (await post(AUTH_PATHS.register, body)).json<{ refreshToken: string }>();

    const renewed = await post(AUTH_PATHS.refresh, { refreshToken: first.refreshToken });
    expect(renewed.statusCode).toBe(200);
    const pair = renewed.json<{ accessToken: string; refreshToken: string }>();

    const reuse = await post(AUTH_PATHS.refresh, { refreshToken: first.refreshToken });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ error: 'invalid_refresh_token' });

    // O reuso derrubou a sessão inteira.
    expect((await post(AUTH_PATHS.refresh, { refreshToken: pair.refreshToken })).statusCode).toBe(
      401,
    );
  });

  it('logout responde 204 e invalida a renovação', async () => {
    await start();
    const { refreshToken } = (await post(AUTH_PATHS.register, body)).json<{
      refreshToken: string;
    }>();
    expect((await post(AUTH_PATHS.logout, { refreshToken })).statusCode).toBe(204);
    expect((await post(AUTH_PATHS.refresh, { refreshToken })).statusCode).toBe(401);
    expect((await post(AUTH_PATHS.logout, { refreshToken })).statusCode).toBe(204);
  });
});

describe('limite de tentativas (CA10, RNF10)', () => {
  it('a 11ª requisição em um minuto recebe 429', async () => {
    await start(10);
    const attempt = () => post(AUTH_PATHS.login, { email: 'a@b.com', password: 'x' });
    for (let i = 0; i < 10; i += 1) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      error: 'rate_limited',
      message: 'Muitas tentativas. Tente novamente em instantes.',
    });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('a rota de saúde não tem limite', async () => {
    await start(1);
    for (let i = 0; i < 5; i += 1) {
      expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    }
  });
});

describe('logs (CA04)', () => {
  it('nunca contêm senha, hash nem tokens', async () => {
    await start();
    const session = (await post(AUTH_PATHS.register, body)).json<{
      accessToken: string;
      refreshToken: string;
    }>();
    await post(AUTH_PATHS.login, { email: body.email, password: 'senha-errada-qualquer' });
    await app.inject({
      method: 'GET',
      url: AUTH_PATHS.me,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    await post(AUTH_PATHS.refresh, { refreshToken: session.refreshToken });

    expect(logs.lines.length).toBeGreaterThan(0);
    for (const secret of [
      body.password,
      'senha-errada-qualquer',
      'hash:',
      session.accessToken,
      session.refreshToken,
    ]) {
      expect(logs.text).not.toContain(secret);
    }
  });
});

describe('Área do colaborador (CA11)', () => {
  it('colaborador entra pela rota própria; usuário comum recebe 403', async () => {
    const ctx = await start();
    const created = await createCollaborator(ctx.users, ctx.hasher, {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    if (!created.ok) throw new Error('falhou');
    await post(AUTH_PATHS.register, body);

    const ok = await post(AUTH_PATHS.collaboratorLogin, {
      email: 'nicoly@exemplo.com',
      password: created.password,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ user: { role: 'collaborator' } });

    const userAtCollaboratorDoor = await post(AUTH_PATHS.collaboratorLogin, {
      email: body.email,
      password: body.password,
    });
    expect(userAtCollaboratorDoor.statusCode).toBe(403);
    expect(userAtCollaboratorDoor.json()).toMatchObject({ error: 'wrong_account_type' });

    const collaboratorAtUserDoor = await post(AUTH_PATHS.login, {
      email: 'nicoly@exemplo.com',
      password: created.password,
    });
    expect(collaboratorAtUserDoor.statusCode).toBe(403);
  });

  it('não existe cadastro de colaborador pela API', async () => {
    await start();
    const res = await post(AUTH_PATHS.register, { ...body, role: 'collaborator' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ user: { role: 'user' } });
  });
});

describe('POST /api/auth/google (CA17–CA20)', () => {
  it('primeiro acesso responde terms_required; com o aceite, cria a conta', async () => {
    await start();
    const first = await post(AUTH_PATHS.google, { idToken: 'google:sub-1:ana@gmail.com' });
    expect(first.statusCode).toBe(400);
    expect(first.json()).toMatchObject({ error: 'terms_required' });

    const second = await post(AUTH_PATHS.google, {
      idToken: 'google:sub-1:ana@gmail.com',
      acceptedTerms: true,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ user: { email: 'ana@gmail.com', role: 'user' } });
  });

  it('token inválido → 401', async () => {
    await start();
    const res = await post(AUTH_PATHS.google, { idToken: 'falso' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'google_token_invalid' });
  });

  it('sem GOOGLE_CLIENT_ID no servidor → 503 google_login_unavailable', async () => {
    await start(undefined, false);
    const res = await post(AUTH_PATHS.google, { idToken: 'google:sub-1:ana@gmail.com' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'google_login_unavailable' });
  });
});
