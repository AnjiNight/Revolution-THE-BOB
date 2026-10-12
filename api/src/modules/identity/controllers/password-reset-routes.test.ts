import { AUTH_PATHS } from '@simulador/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestAppOptions } from '../../../testing/test-app.js';

const PASSWORD = 'senha-bem-longa';

let built: Awaited<ReturnType<typeof buildTestApp>>;

afterEach(async () => {
  await built.app.close();
});

async function start(options: TestAppOptions = {}) {
  built = await buildTestApp(options);
  return built;
}

async function register(email = 'ana@exemplo.com') {
  const res = await built.app.inject({
    method: 'POST',
    url: AUTH_PATHS.register,
    payload: { name: 'Ana Souza', email, password: PASSWORD, acceptedTerms: true },
  });
  return res.json<{ refreshToken: string }>();
}

const requestCode = (payload: object) =>
  built.app.inject({ method: 'POST', url: AUTH_PATHS.passwordResetRequest, payload });

const confirm = (payload: object) =>
  built.app.inject({ method: 'POST', url: AUTH_PATHS.passwordResetConfirm, payload });

describe('POST /api/auth/password-reset/request', () => {
  it('responde 202 sem corpo, igual para conta com senha, sem conta e só Google (CA01, CA02)', async () => {
    const { mailer, background, users } = await start();
    await register();
    await users.create({
      name: 'Gil',
      email: 'gil@gmail.com',
      role: 'user',
      passwordHash: null,
      googleSub: 'sub',
      termsVersion: null,
    });

    const responses = await Promise.all(
      ['ana@exemplo.com', 'ninguem@exemplo.com', 'gil@gmail.com'].map((email) =>
        requestCode({ email }),
      ),
    );
    for (const res of responses) {
      expect(res.statusCode).toBe(202);
      expect(res.body).toBe('');
    }
    await background.settle();
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['ana@exemplo.com', 'gil@gmail.com']);
  });

  it('a resposta não espera a consulta nem o envio do e-mail (CA03)', async () => {
    const { mailer, background } = await start();
    await register();
    mailer.delayMs = 300;

    const res = await requestCode({ email: 'ana@exemplo.com' });
    expect(res.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(0);

    await background.settle();
    expect(mailer.sent).toHaveLength(1);
  });

  it('e-mail inválido → 400 com o campo', async () => {
    await start();
    const res = await requestCode({ email: 'sem-arroba' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'validation_error',
      fields: { email: 'invalid_email' },
    });
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  it('código certo → 204; a senha nova entra, a antiga não, e as sessões antigas caem (CA05)', async () => {
    const { mailer, background } = await start();
    const { refreshToken } = await register();
    await requestCode({ email: 'ana@exemplo.com', locale: 'en' });
    await background.settle();

    const res = await confirm({
      email: 'ana@exemplo.com',
      code: mailer.lastCode().toLowerCase(),
      newPassword: 'senha-nova-123',
      locale: 'en',
    });
    expect(res.statusCode).toBe(204);
    await background.settle();
    expect(mailer.sent.at(-1)?.subject).toBe('Your password was reset');

    const login = (password: string) =>
      built.app.inject({
        method: 'POST',
        url: AUTH_PATHS.login,
        payload: { email: 'ana@exemplo.com', password },
      });
    expect((await login('senha-nova-123')).statusCode).toBe(200);
    expect((await login(PASSWORD)).statusCode).toBe(401);
    const renewed = await built.app.inject({
      method: 'POST',
      url: AUTH_PATHS.refresh,
      payload: { refreshToken },
    });
    expect(renewed.statusCode).toBe(401);
  });

  it('código errado ou e-mail sem conta → 400 invalid_reset_code, a mesma resposta (CA06)', async () => {
    const { background } = await start();
    await register();
    await requestCode({ email: 'ana@exemplo.com' });
    await background.settle();

    const wrong = await confirm({
      email: 'ana@exemplo.com',
      code: 'ZZZZ-ZZZZ',
      newPassword: 'senha-nova-123',
    });
    const unknown = await confirm({
      email: 'ninguem@exemplo.com',
      code: 'ZZZZ-ZZZZ',
      newPassword: 'senha-nova-123',
    });
    for (const res of [wrong, unknown]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: 'invalid_reset_code',
        message: 'Código inválido ou vencido.',
      });
    }
  });

  it('código mal formatado e senha curta → 400 com os campos (CA10)', async () => {
    await start();
    const res = await confirm({ email: 'ana@exemplo.com', code: 'ABC', newPassword: 'curta' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'validation_error',
      fields: { code: 'invalid_code', newPassword: 'too_short' },
    });
  });

  it('colaborador redefine e continua entrando só pela Área do colaborador (CA13)', async () => {
    const { mailer, background, users, hasher } = await start();
    await users.create({
      name: 'Bia',
      email: 'bia@equipe.com',
      role: 'collaborator',
      passwordHash: await hasher.hash('senha-gerada-pela-equipe'),
      googleSub: null,
      termsVersion: null,
    });
    await requestCode({ email: 'bia@equipe.com' });
    await background.settle();
    const res = await confirm({
      email: 'bia@equipe.com',
      code: mailer.lastCode(),
      newPassword: 'senha-da-bia-1',
    });
    expect(res.statusCode).toBe(204);

    const payload = { email: 'bia@equipe.com', password: 'senha-da-bia-1' };
    const collaborator = await built.app.inject({
      method: 'POST',
      url: AUTH_PATHS.collaboratorLogin,
      payload,
    });
    expect(collaborator.statusCode).toBe(200);
    const user = await built.app.inject({ method: 'POST', url: AUTH_PATHS.login, payload });
    expect(user.statusCode).toBe(403);
  });
});

describe('limites, privacidade e SMTP', () => {
  it('a 11ª requisição em um minuto, do mesmo IP, recebe 429 em cada rota (CA09)', async () => {
    await start({ rateLimitPerMinute: 10 });
    for (const send of [
      () => requestCode({ email: 'ana@exemplo.com' }),
      () => confirm({ email: 'ana@exemplo.com', code: 'ZZZZZZZZ', newPassword: 'senha-nova-123' }),
    ]) {
      for (let i = 0; i < 10; i += 1) expect((await send()).statusCode).not.toBe(429);
      const blocked = await send();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ error: 'rate_limited' });
    }
  });

  it('nenhum log contém e-mail, código ou senha (CA11)', async () => {
    const { mailer, background, logs } = await start();
    await register();
    await requestCode({ email: 'ana@exemplo.com' });
    await requestCode({ email: 'ninguem@exemplo.com' });
    await background.settle();
    const code = mailer.lastCode();
    await confirm({ email: 'ana@exemplo.com', code: 'ZZZZZZZZ', newPassword: 'senha-errada-1' });
    await confirm({ email: 'ana@exemplo.com', code, newPassword: 'senha-nova-123' });
    await background.settle();

    expect(logs.text).toContain('senha redefinida');
    for (const secret of [
      'ana@exemplo.com',
      'ninguem@exemplo.com',
      code,
      'senha-nova-123',
      'senha-errada-1',
      PASSWORD,
    ]) {
      expect(logs.text).not.toContain(secret);
    }
  });

  it('sem SMTP, as duas rotas respondem 503, mesmo com dados inválidos (CA12)', async () => {
    await start({ passwordReset: false });
    for (const res of [
      await requestCode({ email: 'ana@exemplo.com' }),
      await confirm({ email: 'x', code: '', newPassword: '' }),
    ]) {
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: 'password_reset_unavailable' });
    }
  });
});
