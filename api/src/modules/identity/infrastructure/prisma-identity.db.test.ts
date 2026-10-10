import { AUTH_PATHS, TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { AuthService } from '../application/auth-service.js';
import { createCollaborator } from '../application/create-collaborator.js';
import { hashRefreshToken } from '../application/refresh-token.js';
import { EmailInUseError } from '../domain/errors.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import { JwtAccessTokenService } from './jwt-access-token-service.js';
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

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    users = new PrismaUserRepository(prisma);
    tokens = new PrismaRefreshTokenRepository(prisma);
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
    const app = await buildApp({
      config: { env: 'test', logLevel: 'fatal', authRateLimitPerMinute: 1000 },
      probe: { isAvailable: () => Promise.resolve(true) },
      version: 'teste',
      auth,
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
