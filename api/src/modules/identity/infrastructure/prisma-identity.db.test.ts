import { AUTH_PATHS, PROFILE_PATHS, TERMS_VERSION } from '@simulador/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { createCollaborator } from '../application/create-collaborator.js';
import { EmailCodeHasher } from '../application/email-code.js';
import { deleteExpiredPendingAccounts } from '../application/email-confirmation-service.js';
import { hashRefreshToken } from '../application/refresh-token.js';
import { EmailInUseError } from '../domain/errors.js';
import { createIdentityServices } from '../identity-services.js';
import { CalendarService } from '../../market-data/application/calendar-service.js';
import { InMemoryCalendarRepository } from '../../market-data/testing/fakes.js';
import { AssetCatalogService } from '../../asset-catalog/application/asset-catalog-service.js';
import { InMemoryAssetRepository } from '../../asset-catalog/testing/fakes.js';
import { BackgroundTasks, FakeEmailSender } from '../testing/fakes.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import { JwtAccessTokenService } from './jwt-access-token-service.js';
import { PrismaEmailCodeRepository } from './prisma-email-code-repository.js';
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
  let codes: PrismaEmailCodeRepository;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    users = new PrismaUserRepository(prisma);
    tokens = new PrismaRefreshTokenRepository(prisma);
    codes = new PrismaEmailCodeRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE usuario, exclusao_conta CASCADE');
  });

  const newUser = {
    name: 'Ana Souza',
    email: 'ana@exemplo.com',
    role: 'user' as const,
    passwordHash: '$argon2id$fake',
    googleSub: null,
    termsVersion: TERMS_VERSION,
    emailConfirmedAt: new Date(),
  };

  const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

  type DbApp = Awaited<ReturnType<typeof buildDbApp>>;

  /** Cadastro + confirmação pela API (SPEC-039): devolve a sessão. */
  async function registerConfirmedThroughApi(
    app: DbApp['app'],
    mailer: FakeEmailSender,
    background: BackgroundTasks,
    fields: { password?: string } = {},
  ) {
    await app.inject({
      method: 'POST',
      url: AUTH_PATHS.register,
      payload: {
        name: 'Ana',
        email: 'ana@exemplo.com',
        password: fields.password ?? 'senha-longa-1',
        acceptedTerms: true,
      },
    });
    await background.settle();
    const confirmed = await app.inject({
      method: 'POST',
      url: AUTH_PATHS.emailConfirmationConfirm,
      payload: { email: 'ana@exemplo.com', code: mailer.lastCode('ana@exemplo.com') },
    });
    return confirmed.json<{ accessToken: string; refreshToken: string }>();
  }

  /** Servidor completo sobre o PostgreSQL, com argon2id e e-mail falso (SPEC-039, SPEC-004). */
  async function buildDbApp() {
    const mailer = new FakeEmailSender();
    const background = new BackgroundTasks();
    const accessTokens = new JwtAccessTokenService(SECRET, 15);
    const services = createIdentityServices({
      users,
      refreshTokens: tokens,
      emailCodes: codes,
      hasher: new Argon2PasswordHasher(),
      codeHasher: new EmailCodeHasher(SECRET),
      accessTokens,
      refreshTokenTtlDays: 30,
      mailer,
      runInBackground: background.run,
    });
    const app = await buildApp({
      config: { env: 'test', logLevel: 'fatal', authRateLimitPerMinute: 1000 },
      probe: { isAvailable: () => Promise.resolve(true) },
      version: 'teste',
      auth: services.auth,
      profile: services.profile,
      passwordReset: services.passwordReset,
      accountData: services.accountData,
      accessTokens,
      calendar: new CalendarService({ calendars: new InMemoryCalendarRepository() }),
      catalog: new AssetCatalogService({ assets: new InMemoryAssetRepository() }),
    });
    return { app, mailer, background };
  }

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

  it('SPEC-003/039: atualiza nome, e-mail (via e-mail pendente) e senha; duplicado vira EmailInUseError', async () => {
    const ana = await users.create(newUser);
    await users.create({ ...newUser, email: 'bia@exemplo.com' });

    expect(await users.updateName(ana.id, 'Ana Lima')).toMatchObject({ name: 'Ana Lima' });
    expect(await users.setPendingEmail(ana.id, 'ana.lima@exemplo.com')).toMatchObject({
      email: 'ana@exemplo.com',
      pendingEmail: 'ana.lima@exemplo.com',
    });
    expect(await users.applyPendingEmail(ana.id)).toMatchObject({
      email: 'ana.lima@exemplo.com',
      pendingEmail: null,
    });
    await users.setPendingEmail(ana.id, 'bia@exemplo.com');
    await expect(users.applyPendingEmail(ana.id)).rejects.toBeInstanceOf(EmailInUseError);
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

  describe('SPEC-004/039: códigos enviados por e-mail', () => {
    const MINUTE = 60_000;
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 12, 0) + minutes * MINUTE);
    const reset = (userId: string, minutes: number, hash = 'a') => ({
      userId,
      purpose: 'password_reset' as const,
      codeHash: hash.repeat(64),
      createdAt: at(minutes),
      expiresAt: at(minutes + 15),
      closedAt: null,
    });

    it('um código novo encerra o anterior, apaga os de mais de um dia e entra na contagem', async () => {
      const ana = await users.create(newUser);
      await codes.create(reset(ana.id, -2000, 'a'), at(-1440));
      await codes.create(reset(ana.id, 0, 'b'), at(-1440));
      await codes.create(reset(ana.id, 5, 'c'), at(5 - 1440));

      const rows = await prisma.codigoEmail.findMany({ orderBy: { criadoEm: 'asc' } });
      expect(rows.map((r) => [r.codigoHash[0], r.encerradoEm !== null])).toEqual([
        ['b', true],
        ['c', false],
      ]);
      expect(await codes.countSince(ana.id, at(-60))).toBe(2);
      expect((await codes.findOpen(ana.id, 'password_reset', at(6)))?.codeHash).toBe(
        'c'.repeat(64),
      );
      expect(await codes.findOpen(ana.id, 'password_reset', at(21))).toBeNull();
    });

    it('tentativas simultâneas nunca passam do limite, e o código só se encerra uma vez', async () => {
      const ana = await users.create(newUser);
      await codes.create(reset(ana.id, 0), at(-1440));
      const open = await codes.findOpen(ana.id, 'password_reset', at(1));

      const reserved = await Promise.all(
        Array.from({ length: 10 }, () => codes.reserveAttempt(open!.id, 5)),
      );
      expect(reserved.filter(Boolean)).toHaveLength(5);

      const closed = await Promise.all([
        codes.close(open!.id, at(2)),
        codes.close(open!.id, at(2)),
      ]);
      expect(closed.filter(Boolean)).toHaveLength(1);
    });

    it('o banco recusa mais de 5 tentativas e validade invertida; os códigos somem com a conta (CA15)', async () => {
      const ana = await users.create(newUser);
      await codes.create(reset(ana.id, 0), at(-1440));
      await expect(
        prisma.$executeRawUnsafe(`UPDATE codigo_email SET tentativas = 6`),
      ).rejects.toThrow(/codigo_email_tentativas_chk/);
      await expect(
        prisma.$executeRawUnsafe(`UPDATE codigo_email SET expira_em = criado_em`),
      ).rejects.toThrow(/codigo_email_validade_chk/);

      await prisma.usuario.delete({ where: { id: ana.id } });
      expect(await prisma.codigoEmail.count()).toBe(0);
    });

    it('fluxo completo pela API com argon2id: pedir, redefinir e entrar com a senha nova', async () => {
      const { app, mailer, background } = await buildDbApp();

      try {
        const { refreshToken } = await registerConfirmedThroughApi(app, mailer, background, {
          password: 'senha-antiga-1',
        });
        mailer.sent.length = 0;

        const requested = await app.inject({
          method: 'POST',
          url: AUTH_PATHS.passwordResetRequest,
          payload: { email: 'ana@exemplo.com' },
        });
        expect(requested.statusCode).toBe(202);
        await background.settle();
        const code = mailer.lastCode();
        const row = await prisma.codigoEmail.findFirst();
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

  describe('SPEC-039: confirmação de e-mail', () => {
    const pendingUser = { ...newUser, emailConfirmedAt: null };

    it('conta pendente nasce sem confirmação e é liberada por confirmEmail', async () => {
      const ana = await users.create(pendingUser);
      expect(ana.emailConfirmedAt).toBeNull();
      const at = new Date('2026-10-12T12:00:00Z');
      expect(await users.confirmEmail(ana.id, at)).toMatchObject({ emailConfirmedAt: at });
    });

    it('deleteUnconfirmed nunca apaga conta confirmada', async () => {
      const confirmed = await users.create(newUser);
      const pending = await users.create({ ...pendingUser, email: 'bia@exemplo.com' });
      await expect(users.deleteUnconfirmed(confirmed.id)).resolves.toBe(false);
      await expect(users.deleteUnconfirmed(pending.id)).resolves.toBe(true);
      expect(await prisma.usuario.count()).toBe(1);
    });

    it('a limpeza apaga só pendentes com mais de 7 dias, com consentimento e códigos (CA07)', async () => {
      const old = await users.create({ ...pendingUser, email: 'velha@exemplo.com' });
      await users.create({ ...pendingUser, email: 'nova@exemplo.com' });
      await users.create({ ...newUser, email: 'confirmada@exemplo.com' });
      await prisma.usuario.update({
        where: { id: old.id },
        data: { criadoEm: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      });
      await codes.create(
        {
          userId: old.id,
          purpose: 'signup',
          codeHash: 'a'.repeat(64),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          closedAt: null,
        },
        new Date(0),
      );

      await expect(deleteExpiredPendingAccounts(users, new Date())).resolves.toBe(1);
      const left = await prisma.usuario.findMany({ orderBy: { email: 'asc' } });
      expect(left.map((u) => u.email)).toEqual(['confirmada@exemplo.com', 'nova@exemplo.com']);
      expect(await prisma.consentimento.count({ where: { usuarioId: old.id } })).toBe(0);
      expect(await prisma.codigoEmail.count()).toBe(0);
    });

    it('o banco exige colaborador e conta Google confirmados, e e-mail pendente em minúsculas (CA14)', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO usuario (nome, email, senha_hash, perfil, atualizado_em)
           VALUES ('Nicoly', 'n@x.com', 'h', 'colaborador', now())`,
        ),
      ).rejects.toThrow(/usuario_confirmado_chk/);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO usuario (nome, email, google_sub, atualizado_em)
           VALUES ('Gil', 'g@x.com', 'sub', now())`,
        ),
      ).rejects.toThrow(/usuario_confirmado_chk/);
      const ana = await users.create(newUser);
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE usuario SET email_pendente = 'Novo@X.com' WHERE id = '${ana.id}'`,
        ),
      ).rejects.toThrow(/usuario_email_pendente_minusculas_chk/);
    });

    it('cada finalidade tem o seu código aberto, mas o limite por hora soma todas', async () => {
      const ana = await users.create(newUser);
      const base = {
        userId: ana.id,
        codeHash: 'a'.repeat(64),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        closedAt: null,
      };
      await codes.create({ ...base, purpose: 'password_reset' }, new Date(0));
      await codes.create(
        { ...base, purpose: 'email_change', codeHash: 'b'.repeat(64) },
        new Date(0),
      );
      expect(await codes.findOpen(ana.id, 'password_reset', new Date())).not.toBeNull();
      expect(await codes.findOpen(ana.id, 'email_change', new Date())).not.toBeNull();
      expect(await codes.findOpen(ana.id, 'signup', new Date())).toBeNull();
      expect(await codes.countSince(ana.id, new Date(Date.now() - 60 * 60 * 1000))).toBe(2);
    });
  });

  describe('SPEC-034: exportação e exclusão', () => {
    it('deleteAccount apaga conta, consentimentos, sessões e códigos e grava só o id e a data', async () => {
      const ana = await users.create(newUser);
      const expiresAt = new Date(Date.now() + 86_400_000);
      await tokens.create({
        userId: ana.id,
        tokenHash: 'a'.repeat(64),
        family: '0d9e1f7a-1111-4222-8333-444455556666',
        expiresAt,
      });
      await codes.create(
        {
          userId: ana.id,
          purpose: 'account_deletion',
          codeHash: 'b'.repeat(64),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          closedAt: null,
        },
        new Date(0),
      );
      const at = new Date('2026-10-13T15:00:00Z');

      await users.deleteAccount(ana.id, at);

      expect(await prisma.usuario.count()).toBe(0);
      expect(await prisma.consentimento.count()).toBe(0);
      expect(await prisma.tokenRenovacao.count()).toBe(0);
      expect(await prisma.codigoEmail.count()).toBe(0);
      const records = await prisma.exclusaoConta.findMany();
      expect(records).toEqual([{ id: expect.any(String), usuarioId: ana.id, excluidaEm: at }]);
    });

    it('listSessions resume uma sessão por login', async () => {
      const ana = await users.create(newUser);
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
        family: family(1),
        expiresAt,
      });
      await tokens.create({
        userId: ana.id,
        tokenHash: 'c'.repeat(64),
        family: family(2),
        expiresAt,
      });
      await tokens.revokeFamily(family(2), new Date());

      const sessions = await tokens.listSessions(ana.id);
      expect(sessions.map((s) => s.ended)).toEqual([false, true]);
    });

    it('fluxo completo pela API: exportar, pedir e confirmar a exclusão', async () => {
      const { app, mailer, background } = await buildDbApp();
      try {
        const session = await registerConfirmedThroughApi(app, mailer, background);
        const auth = { authorization: `Bearer ${session.accessToken}` };

        const exported = await app.inject({
          method: 'GET',
          url: PROFILE_PATHS.export,
          headers: auth,
        });
        expect(exported.statusCode).toBe(200);
        expect(exported.json()).toMatchObject({ account: { email: 'ana@exemplo.com' } });

        await app.inject({
          method: 'POST',
          url: PROFILE_PATHS.deletionRequest,
          headers: auth,
          payload: {},
        });
        await background.settle();
        const deleted = await app.inject({
          method: 'POST',
          url: PROFILE_PATHS.deletionConfirm,
          headers: auth,
          payload: { code: mailer.lastCode('ana@exemplo.com') },
        });
        expect(deleted.statusCode).toBe(204);
        expect(await prisma.usuario.count()).toBe(0);
        expect(await prisma.exclusaoConta.count()).toBe(1);
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

  it('fluxo completo pela API: cadastro → confirmação → /me → renovação → logout', async () => {
    const { app, mailer, background } = await buildDbApp();

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
      expect(registered.statusCode).toBe(202);
      const pending = await prisma.usuario.findUnique({ where: { email: 'ana@exemplo.com' } });
      expect(pending?.emailConfirmadoEm).toBeNull();
      expect(await prisma.tokenRenovacao.count()).toBe(0);

      const pendingLogin = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.login,
        payload: { email: 'ana@exemplo.com', password: 'senha-longa-1' },
      });
      expect(pendingLogin.statusCode).toBe(403);
      await background.settle();

      const confirmed = await app.inject({
        method: 'POST',
        url: AUTH_PATHS.emailConfirmationConfirm,
        payload: { email: 'ana@exemplo.com', code: mailer.lastCode('ana@exemplo.com') },
      });
      expect(confirmed.statusCode).toBe(200);
      const session = confirmed.json<{ accessToken: string; refreshToken: string }>();

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
