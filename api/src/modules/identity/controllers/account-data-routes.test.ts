import { AUTH_PATHS, PROFILE_PATHS } from '@simulador/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestAppOptions } from '../../../testing/test-app.js';
import { createCollaborator } from '../application/create-collaborator.js';

let ctx: Awaited<ReturnType<typeof buildTestApp>>;

afterEach(async () => {
  await ctx.app.close();
});

async function start(options: TestAppOptions = {}) {
  ctx = await buildTestApp(options);
  return ctx;
}

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: object) =>
  ctx.app.inject({
    method,
    url,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    ...(payload ? { payload } : {}),
  });

describe('GET /api/me/export (SPEC-034 CA01, CA02)', () => {
  it('200 com o JSON e o nome do arquivo para baixar', async () => {
    await start();
    const { accessToken } = await ctx.registerConfirmed();
    const res = await call('GET', PROFILE_PATHS.export, accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="simulador-meus-dados-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.json()).toMatchObject({
      format: 'simulador-investimentos/dados-pessoais',
      version: 1,
      account: { email: 'ana@exemplo.com', signInMethods: ['password'] },
      consents: [{ type: 'terms' }],
    });
    expect(res.body).not.toContain('hash:');
  });

  it('401 sem token', async () => {
    await start();
    expect((await call('GET', PROFILE_PATHS.export)).statusCode).toBe(401);
  });
});

describe('exclusão pela API (SPEC-034 CA03–CA06, CA08)', () => {
  it('pedido 202; confirmação 204; depois disso o token de acesso e o de renovação não valem (CA04)', async () => {
    await start();
    const { accessToken, refreshToken } = await ctx.registerConfirmed();
    const requested = await call('POST', PROFILE_PATHS.deletionRequest, accessToken, {});
    expect(requested.statusCode).toBe(202);
    await ctx.background.settle();

    const confirmed = await call('POST', PROFILE_PATHS.deletionConfirm, accessToken, {
      code: ctx.mailer.lastCode().toLowerCase(),
    });
    expect(confirmed.statusCode).toBe(204);

    expect((await call('GET', AUTH_PATHS.me, accessToken)).statusCode).toBe(401);
    expect((await call('GET', PROFILE_PATHS.profile, accessToken)).statusCode).toBe(401);
    expect((await call('POST', AUTH_PATHS.refresh, undefined, { refreshToken })).statusCode).toBe(
      401,
    );
    expect(ctx.users.users).toHaveLength(0);
  });

  it('código errado → 400 invalid_confirmation_code e nada é apagado (CA05)', async () => {
    await start();
    const { accessToken } = await ctx.registerConfirmed();
    await call('POST', PROFILE_PATHS.deletionRequest, accessToken, {});
    const res = await call('POST', PROFILE_PATHS.deletionConfirm, accessToken, {
      code: 'ZZZZZZZZ',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_confirmation_code' });
    expect(ctx.users.users).toHaveLength(1);
  });

  it('colaborador → 403 deletion_not_allowed (CA06)', async () => {
    await start();
    const created = await createCollaborator(ctx.users, ctx.hasher, {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    if (!created.ok) throw new Error('falhou');
    const login = await call('POST', AUTH_PATHS.collaboratorLogin, undefined, {
      email: 'nicoly@exemplo.com',
      password: created.password,
    });
    const { accessToken } = login.json<{ accessToken: string }>();
    for (const [url, body] of [
      [PROFILE_PATHS.deletionRequest, {}],
      [PROFILE_PATHS.deletionConfirm, { code: 'ZZZZZZZZ' }],
    ] as const) {
      const res = await call('POST', url, accessToken, body);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'deletion_not_allowed' });
    }
  });

  it('a 11ª requisição em um minuto a cada rota recebe 429 (CA08)', async () => {
    await start({ rateLimitPerMinute: 10 });
    const { accessToken } = await ctx.registerConfirmed();
    for (const send of [
      () => call('GET', PROFILE_PATHS.export, accessToken),
      () => call('POST', PROFILE_PATHS.deletionConfirm, accessToken, { code: 'ZZZZZZZZ' }),
    ]) {
      for (let i = 0; i < 10; i += 1) expect((await send()).statusCode).not.toBe(429);
      expect((await send()).statusCode).toBe(429);
    }
  });

  it('nenhum log contém nome, e-mail ou código (CA09)', async () => {
    await start();
    const { accessToken } = await ctx.registerConfirmed();
    await call('GET', PROFILE_PATHS.export, accessToken);
    await call('POST', PROFILE_PATHS.deletionRequest, accessToken, {});
    await ctx.background.settle();
    const code = ctx.mailer.lastCode();
    await call('POST', PROFILE_PATHS.deletionConfirm, accessToken, { code });
    await ctx.background.settle();
    expect(ctx.logs.text).toContain('conta excluída');
    for (const secret of ['Ana Souza', 'ana@exemplo.com', code]) {
      expect(ctx.logs.text).not.toContain(secret);
    }
  });
});
