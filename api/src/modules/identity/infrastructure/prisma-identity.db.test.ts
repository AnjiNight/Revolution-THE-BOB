import { AUTH_PATHS, TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { AuthService } from '../application/auth-service.js';
import { PasswordResetService } from '../application/password-reset-service.js';
import { ProfileService } from '../application/profile-service.js';
import { createCollaborator } from '../application/create-collaborator.js';
import { hashRefreshToken } from '../application/refresh-token.js';
import { ResetCodeHasher } from '../application/reset-code.js';
import { EmailInUseError } from '../domain/errors.js';
import { BackgroundTasks, FakeEmailSender } from '../testing/fakes.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import { JwtAccessTokenService } from './jwt-access-token-service.js';
import { PrismaPasswordResetRepository } from './prisma-password-reset-repository.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token-repository.js';
import { PrismaUserRepository } from './prisma-user-repository.js';

/**
 * Testes contra PostgreSQL real (CA02, CA16). Rodam só com TEST_DATABASE_URL apontando para
 * um banco com as migrações aplicadas. ATENÇÃO: apagam os dados de identidade desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('identidade no PostgreSQL', () => {
  let prisma: PrismaClient;
  let users: PrismaUserRepository;
  let tokens: PrismaRefreshTokenRepository;
  let resets: PrismaPasswordResetRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    users = new PrismaUserRepository(prisma);
    tokens = new PrismaRefreshTokenRepository(prisma);
    resets = new PrismaPasswordResetRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE usuario CASCADE');
  });

  const newUser = {
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    role: 'user' as const,
    passwordHash: '$argon2id$fake',
    googleSub: null,
    termsVersion: TERMS_VERSION,
  };

  it('cria usuário com perfil usuario e registra o consentimento', async () => {
    const user = await users.create(newUser);
    expect(user).toMatchObject({ email: 'ana@exemplo.com', role: 'user' });
    const consents = await prisma.consentimento.findMany({ where: { usuarioId: user.id } });
    expect(consents).toEqual([
      expect.objectContaining({ tipo: 'termos_uso_privacidade', versao: TERMS_VERSION }),
    ]);
  });

  it('e-mail duplicado vira EmailInUseError (RB01)', async () => {
    await users.create(newUser);
    await expect(users.create({ ...newUser, name: 'Outra' })).rejects.toBeInstanceOf(
      EmailInUseError,
    );
  });

  it('o banco recusa e-mail com maiúsculas, mesmo sem passar pelo app', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO usuario (nome, email, senha_hash, atualizado_em) VALUES ('Ana', 'Ana@X.com', 'h', now())`,
      ),
    ).rejects.toThrow(/usuario_email_minusculas_chk/);
  });

  it('o banco recusa nome curto demais', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO usuario (nome, email, senha_hash, atualizado_em) VALUES (' A ', 'a@x.com', 'h', now())`,
      ),
    ).rejects.toThrow(/usuario_nome_tamanho_chk/);
  });

  it('rotate é atômico e só funciona uma vez por token', async () => {
    const user = await users.create(newUser);
    const family = '0d9e1f7a-1111-4222-8333-444455556666';
    const expiresAt = new Date(Date.now() + 86_400_000);
    await tokens.create({ userId: user.id, tokenHash: 'a'.repeat(64), family, expiresAt });
    const stored = await tokens.findByHash('a'.repeat(64));

    const next = { userId: user.id, tokenHash: 'b'.repeat(64), family, expiresAt };
    await expect(tokens.rotate(stored!.id, next, new Date())).resolves.toBe(true);
    await expect(
      tokens.rotate(stored!.id, { ...next, tokenHash: 'c'.repeat(64) }, new Date()),
    ).resolves.toBe(false);
    expect(await tokens.findByHash('c'.repeat(64))).toBeNull();

    await tokens.revokeFamily(family, new Date());
    expect((await tokens.findByHash('b'.repeat(64)))?.revokedAt).toBeInstanceOf(Date);
  });

  it('colaborador criado pela equipe fica com perfil colaborador e sem consentimento (CA11)', async () => {
    const result = await createCollaborator(users, new Argon2PasswordHasher(), {
      name: 'Nicoly',
      email: 'Nicoly@Exemplo.com',
    });
    expect(result.ok).toBe(true);
    const row = await prisma.usuario.findUnique({ where: { email: 'nicoly@exemplo.com' } });
    expect(row?.perfil).toBe('colaborador');
    expect(row?.senhaHash).toMatch(/^\$argon2id\$/);
    expect(await prisma.consentimento.count()).toBe(0);
  });

  it('conta só com Google, ligação por e-mail e busca pelo Google', async () => {
    const google = await users.create({
      ...newUser,
      email: 'g@gmail.com',
      passwordHash: null,
      googleSub: 'sub-google',
    });
    expect(await users.findByGoogleSub('sub-google')).toMatchObject({ id: google.id });

    const withPassword = await users.create(newUser);
    const linked = await users.linkGoogle(withPassword.id, 'sub-ligado');
    expect(linked).toMatchObject({ googleSub: 'sub-ligado', passwordHash: '$argon2id$fake' });
  });

  it('SPEC-003: atualiza nome, e-mail e senha; e-mail duplicado vira EmailInUseError', async () => {
    const ana = await users.create(newUser);
    await users.create({ ...newUser, email: 'bia@exemplo.com' });

    expect(await users.updateName(ana.id, 'Ana Lima')).toMatchObject({ name: 'Ana Lima' });
    expect(await users.updateEmail(ana.id, 'ana.lima@exemplo.com')).toMatchObject({
      email: 'ana.lima@exemplo.com',
    });
    await expect(users.updateEmail(ana.id, 'bia@exemplo.com')).rejects.toBeInstanceOf(
      EmailInUseError,
    );
    expect(await users.updatePasswordHash(ana.id, '$argon2id$nova')).toMatchObject({
      passwordHash: '$argon2id$nova',
    });
    expect(ana.createdAt).toBeInstanceOf(Date);
  });

  it('SPEC-003: novo aceite entra no histórico sem alterar o anterior', async () => {
    const ana = await users.create(newUser);
    const [first] = await users.listConsents(ana.id);
    await users.addConsent(ana.id, 'terms', TERMS_VERSION);
    const all = await users.listConsents(ana.id);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(first);
    expect(all[1]).toMatchObject({ type: 'terms', version: TERMS_VERSION });
  });

  it('SPEC-003: revokeAllForUser encerra só as sessões daquela conta', async () => {
    const ana = await users.create(newUser);
    const bia = await users.create({ ...newUser, email: 'bia@exemplo.com' });
    const expiresAt = new Date(Date.now() + 86_400_000);
    const family = (n: number) => `0d9e1f7a-1111-4222-8333-44445555666${n}`;
    await tokens.create({
      userId: ana.id,
      tokenHash: 'a'.repeat(64),
      family: family(1),
      expiresAt,
    });
    await tokens.create({
      userId: ana.id,
      tokenHash: 'b'.repeat(64),
      family: family(2),
      expiresAt,
    });
    await tokens.create({
      userId: bia.id,
      tokenHash: 'c'.repeat(64),
      family: family(3),
      expiresAt,
    });

    await tokens.revokeAllForUser(ana.id, new Date());
    expect((await tokens.findByHash('a'.repeat(64)))?.revokedAt).toBeInstanceOf(Date);
    expect((await tokens.findByHash('b'.repeat(64)))?.revokedAt).toBeInstanceOf(Date);
    expect((await tokens.findByHash('c'.repeat(64)))?.revokedAt).toBeNull();
  });

  describe('SPEC-004: códigos de redefinição de senha', () => {
    const MINUTE = 60_000;
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 12, 0) + minutes * MINUTE);
    const reset = (userId: string, minutes: number, hash = 'a') => ({
      userId,
      codeHash: hash.repeat(64),
      createdAt: at(minutes),
      expiresAt: at(minutes + 15),
      closedAt: null,
    });

    it('um código novo encerra o anterior, apaga os de mais de um dia e entra na contagem', async () => {
      const ana = await users.create(newUser);
      await resets.create(reset(ana.id, -2000, 'a'), at(-1440));
      await resets.create(reset(ana.id, 0, 'b'), at(-1440));
      await resets.create(reset(ana.id, 5, 'c'), at(5 - 1440));

      const rows = await prisma.redefinicaoSenha.findMany({ orderBy: { criadoEm: 'asc' } });
      expect(rows.map((r) => [r.codigoHash[0], r.encerradoEm !== null])).toEqual([
        ['b', true],
        ['c', false],
      ]);
      expect(await resets.countSince(ana.id, at(-60))).toBe(2);
      expect((await resets.findOpen(ana.id, at(6)))?.codeHash).toBe('c'.repeat(64));
      expect(await resets.findOpen(ana.id, at(21))).toBeNull();
    });

    it('tentativas simultâneas nunca passam do limite, e o código só se encerra uma vez', async () => {
      const ana = await users.create(newUser);
      await resets.create(reset(ana.id, 0), at(-1440));
      const open = await resets.findOpen(ana.id, at(1));

      const reserved = await Promise.all(
        Array.from({ length: 10 }, () => resets.reserveAttempt(open!.id, 5)),
      );
      expect(reserved.filter(Boolean)).toHaveLength(5);

      const closed = await Promise.all([
        resets.close(open!.id, at(2)),
        resets.close(open!.id, at(2)),
      ]);
      expect(closed.filter(Boolean)).toHaveLength(1);
    });

    it('o banco recusa mais de 5 tentativas e validade invertida; os códigos somem com a conta (CA15)', async () => {
      const ana = await users.create(newUser);
      await resets.create(reset(ana.id, 0), at(-1440));
      await expect(
        prisma.$executeRawUnsafe(`UPDATE redefinicao_senha SET tentativas = 6`),
      ).rejects.toThrow(/redefinicao_senha_tentativas_chk/);
      await expect(
        prisma.$executeRawUnsafe(`UPDATE redefinicao_senha SET expira_em = criado_em`),
      ).rejects.toThrow(/redefinicao_senha_validade_chk/);

      await prisma.usuario.delete({ where: { id: ana.id } });
      expect(await prisma.redefinicaoSenha.count()).toBe(0);
    });

    it('fluxo completo pela API com argon2id: pedir, redefinir e entrar com a senha nova', async () => {
      const mailer = new FakeEmailSender();
      const background = new BackgroundTasks();
      const hasher = new Argon2PasswordHasher();
      const accessTokens = new JwtAccessTokenService(
        'segredo-de-teste-com-mais-de-32-caracteres',
        15,
      );
      const auth = new AuthService({
        users,
        refreshTokens: tokens,
        hasher,
        accessTokens,
        refreshTokenTtlDays: 30,
      });
      const app = await buildApp({
        config: { env: 'test', logLevel: 'fatal', authRateLimitPerMinute: 1000 },
        probe: { isAvailable: () => Promise.resolve(true) },
        version: 'teste',
        auth,
        profile: new ProfileService({ users, refreshTokens: tokens, hasher, sessions: auth }),
        passwordReset: new PasswordResetService({
          users,
          resets,
          refreshTokens: tokens,
          hasher,
          codes: new ResetCodeHasher('segredo-de-teste-com-mais-de-32-caracteres'),
          mailer,
          runInBackground: background.run,
        }),
        accessTokens,
      });

      try {
        const registered = await app.inject({
          method: 'POST',
          url: AUTH_PATHS.register,
          payload: {
            name: 'Ana',
            email: 'ana@exemplo.com',
            password: 'senha-antiga-1',
            acceptedTerms: true,
          },
        });
        const { refreshToken } = registered.json<{ refreshToken: string }>();

        const requested = await app.inject({
          method: 'POST',
          url: AUTH_PATHS.passwordResetRequest,
          payload: { email: 'ana@exemplo.com' },
        });
        expect(requested.statusCode).toBe(202);
        await background.settle();
        const code = mailer.lastCode();
        const row = await prisma.redefinicaoSenha.findFirst();
        expect(row?.codigoHash).not.toContain(code);

        const confirmed = await app.inject({
          method: 'POST',
          url: AUTH_PATHS.passwordResetConfirm,
          payload: { email: 'ana@exemplo.com', code, newPassword: 'senha-nova-123' },
        });
        expect(confirmed.statusCode).toBe(204);
        await background.settle();

        const user = await prisma.usuario.findUnique({ where: { email: 'ana@exemplo.com' } });
        expect(user?.senhaHash).toMatch(/^\$argon2id\$/);
        const login = (password: string) =>
          app.inject({
            method: 'POST',
            url: AUTH_PATHS.login,
            payload: { email: 'ana@exemplo.com', password },
          });
        expect((await login('senha-nova-123')).statusCode).toBe(200);
        expect((await login('senha-antiga-1')).statusCode).toBe(401);
        const renewed = await app.inject({
          method: 'POST',
          url: AUTH_PATHS.refresh,
          payload: { refreshToken },
        });
        expect(renewed.statusCode).toBe(401);
        expect(mailer.sent.map((m) => m.subject)).toEqual([
          'Seu código para redefinir a senha',
          'Sua senha foi redefinida',
        ]);
      } finally {
        await app.close();
      }
    });
  });

  it('o banco recusa conta sem senha e sem Google', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO usuario (nome, email, atualizado_em) VALUES ('Ana', 'a@x.com', now())`,
      ),
    ).rejects.toThrow(/usuario_forma_de_acesso_chk/);
  });

  it('o banco recusa colaborador com Google ou sem senha', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO usuario (nome, email, senha_hash, google_sub, perfil, atualizado_em)
         VALUES ('Ana', 'a@x.com', 'h', 'sub', 'colaborador', now())`,
      ),
    ).rejects.toThrow(/usuario_colaborador_com_senha_chk/);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO usuario (nome, email, google_sub, perfil, atualizado_em)
         VALUES ('Ana', 'a@x.com', 'sub', 'colaborador', now())`,
      ),
    ).rejects.toThrow(/usuario_colaborador_com_senha_chk/);
  });

  it('fluxo completo pela API: cadastro → /me → renovação → logout', async () => {
    const accessTokens = new JwtAccessTokenService(
      'segredo-de-teste-com-mais-de-32-caracteres',
      15,
    );
    const auth = new AuthService({
      users,
      refreshTokens: tokens,
      hasher: new Argon2PasswordHasher(),
      accessTokens,
      refreshTokenTtlDays: 30,
    });
    const profile = new ProfileService({
      users,
      refreshTokens: tokens,
      hasher: new Argon2PasswordHasher(),
      sessions: auth,
    });
    const passwordReset = new PasswordResetService({
      users,
      resets,
      refreshTokens: tokens,
      hasher: new Argon2PasswordHasher(),
      codes: new ResetCodeHasher('segredo-de-teste-com-mais-de-32-caracteres'),
    });
    const app = await buildApp({
      config: { env: 'test', logLevel: 'fatal', authRateLimitPerMinute: 1000 },
      probe: { isAvailable: () => Promise.resolve(true) },
      version: 'teste',
      auth,
      profile,
      passwordReset,
      accessTokens,
    });

    try {
      const registered = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.register,
        payload: {
          name: 'Ana',
          email: 'ana@exemplo.com',
          password: 'senha-longa-1',
          acceptedTerms: true,
        },
      });
      expect(registered.statusCode).toBe(201);
      const session = registered.json<{ accessToken: string; refreshToken: string }>();

      const row = await prisma.usuario.findUnique({ where: { email: 'ana@exemplo.com' } });
      expect(row?.senhaHash).toMatch(/^\$argon2id\$/);
      const tokenRow = await prisma.tokenRenovacao.findFirst();
      expect(tokenRow?.tokenHash).toBe(hashRefreshToken(session.refreshToken));

      const me = await app.inject({
        method: 'GET',
        url: AUTH_PATHS.me,
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(me.json()).toMatchObject({ user: { email: 'ana@exemplo.com', role: 'user' } });

      const login = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.login,
        payload: { email: 'ana@exemplo.com', password: 'senha-longa-1' },
      });
      expect(login.statusCode).toBe(200);

      const renewed = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.refresh,
        payload: { refreshToken: session.refreshToken },
      });
      expect(renewed.statusCode).toBe(200);

      const { refreshToken } = renewed.json<{ refreshToken: string }>();
      const logout = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.logout,
        payload: { refreshToken },
      });
      expect(logout.statusCode).toBe(204);
      const after = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.refresh,
        payload: { refreshToken },
      });
      expect(after.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
