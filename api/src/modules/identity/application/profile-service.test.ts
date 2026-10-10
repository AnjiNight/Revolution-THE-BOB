import { TERMS_VERSION } from '@simulador/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EmailChangeNotAllowedError,
  EmailInUseError,
  InvalidPasswordError,
  PasswordChangeNotAllowedError,
  UserNotFoundError,
} from '../domain/errors.js';
import { JwtAccessTokenService } from '../infrastructure/jwt-access-token-service.js';
import {
  FakeGoogleVerifier,
  FakePasswordHasher,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../testing/fakes.js';
import { AuthService } from './auth-service.js';
import { createCollaborator } from './create-collaborator.js';
import { ProfileService } from './profile-service.js';
import { hashRefreshToken } from './refresh-token.js';

const PASSWORD = 'senha-bem-longa';

let now: Date;
let users: InMemoryUserRepository;
let tokens: InMemoryRefreshTokenRepository;
let hasher: FakePasswordHasher;
let auth: AuthService;
let profile: ProfileService;

beforeEach(() => {
  now = new Date('2026-10-10T12:00:00Z');
  users = new InMemoryUserRepository(() => now);
  tokens = new InMemoryRefreshTokenRepository();
  hasher = new FakePasswordHasher();
  auth = new AuthService({
    users,
    refreshTokens: tokens,
    hasher,
    accessTokens: new JwtAccessTokenService('segredo-de-teste-com-mais-de-32-caracteres', 15),
    refreshTokenTtlDays: 30,
    google: new FakeGoogleVerifier(),
    clock: () => now,
  });
  profile = new ProfileService({
    users,
    refreshTokens: tokens,
    hasher,
    sessions: auth,
    clock: () => now,
  });
});

const register = (email = 'ana@exemplo.com') =>
  auth.register({ name: 'Ana Souza', email, password: PASSWORD, acceptedTerms: true });

const googleOnly = () =>
  auth.loginWithGoogle({ idToken: 'google:sub-1:gi@gmail.com', acceptedTerms: true });

describe('perfil (CA01, CA02)', () => {
  it('devolve formas de acesso e data de criação, nunca o hash', async () => {
    const { user } = await register();
    const result = await profile.getProfile(user.id);
    expect(result).toEqual({
      id: user.id,
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      role: 'user',
      hasPassword: true,
      hasGoogle: false,
      createdAt: '2026-10-10T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('hash:');
  });

  it('conta só com Google aparece sem senha e com Google', async () => {
    const { user } = await googleOnly();
    expect(await profile.getProfile(user.id)).toMatchObject({
      hasPassword: false,
      hasGoogle: true,
    });
  });

  it('edita o nome', async () => {
    const { user } = await register();
    expect(await profile.updateName(user.id, 'Ana Lima')).toMatchObject({ name: 'Ana Lima' });
  });

  it('conta inexistente → UserNotFoundError', async () => {
    await expect(profile.getProfile('nao-existe')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('troca de e-mail (CA03–CA06)', () => {
  it('com a senha certa, troca e o login passa a usar o novo e-mail', async () => {
    const { user } = await register();
    const updated = await profile.changeEmail(user.id, {
      email: 'ana.lima@exemplo.com',
      currentPassword: PASSWORD,
    });
    expect(updated.email).toBe('ana.lima@exemplo.com');
    await expect(
      auth.login({ email: 'ana.lima@exemplo.com', password: PASSWORD }, 'user'),
    ).resolves.toMatchObject({ user: { id: user.id } });
  });

  it('e-mail de outra conta → EmailInUseError (RB01)', async () => {
    const { user } = await register();
    await register('bia@exemplo.com');
    await expect(
      profile.changeEmail(user.id, { email: 'bia@exemplo.com', currentPassword: PASSWORD }),
    ).rejects.toBeInstanceOf(EmailInUseError);
  });

  it('senha atual errada → InvalidPasswordError e nada muda', async () => {
    const { user } = await register();
    await expect(
      profile.changeEmail(user.id, { email: 'novo@exemplo.com', currentPassword: 'errada' }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
    expect((await profile.getProfile(user.id)).email).toBe('ana@exemplo.com');
  });

  it('conta só com Google não troca o e-mail', async () => {
    const { user } = await googleOnly();
    await expect(
      profile.changeEmail(user.id, { email: 'novo@exemplo.com', currentPassword: 'qualquer' }),
    ).rejects.toBeInstanceOf(EmailChangeNotAllowedError);
  });

  it('conta com senha e Google troca o e-mail e continua entrando pelo Google', async () => {
    const { user } = await register('gi@gmail.com');
    await auth.loginWithGoogle({ idToken: 'google:sub-1:gi@gmail.com' });
    await profile.changeEmail(user.id, { email: 'gi@exemplo.com', currentPassword: PASSWORD });
    await expect(
      auth.loginWithGoogle({ idToken: 'google:sub-1:gi@gmail.com' }),
    ).resolves.toMatchObject({ user: { id: user.id, email: 'gi@exemplo.com' } });
  });

  it('colaborador troca o próprio e-mail e segue entrando pela Área do colaborador', async () => {
    const created = await createCollaborator(users, hasher, {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    if (!created.ok) throw new Error('falhou');
    await profile.changeEmail(created.user.id, {
      email: 'nicoly@equipe.com',
      currentPassword: created.password,
    });
    await expect(
      auth.login({ email: 'nicoly@equipe.com', password: created.password }, 'collaborator'),
    ).resolves.toMatchObject({ user: { role: 'collaborator' } });
  });
});

describe('troca de senha (CA05–CA07)', () => {
  it('a nova vale, a antiga não, e todas as sessões anteriores caem', async () => {
    const first = await register();
    const other = await auth.login({ email: 'ana@exemplo.com', password: PASSWORD }, 'user');

    const session = await profile.changePassword(first.user.id, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-longa',
    });

    await expect(
      auth.login({ email: 'ana@exemplo.com', password: PASSWORD }, 'user'),
    ).rejects.toThrow();
    await expect(
      auth.login({ email: 'ana@exemplo.com', password: 'outra-senha-longa' }, 'user'),
    ).resolves.toBeDefined();
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow();
    await expect(auth.refresh(other.refreshToken)).rejects.toThrow();
    // A sessão devolvida pela troca continua valendo.
    await expect(auth.refresh(session.refreshToken)).resolves.toBeDefined();
    expect(
      tokens.tokens.find((t) => t.tokenHash === hashRefreshToken(session.refreshToken)),
    ).toBeDefined();
  });

  it('senha atual errada → InvalidPasswordError e a senha não muda', async () => {
    const { user } = await register();
    await expect(
      profile.changePassword(user.id, { currentPassword: 'errada', newPassword: 'nova-senha-1' }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
    await expect(
      auth.login({ email: 'ana@exemplo.com', password: PASSWORD }, 'user'),
    ).resolves.toBeDefined();
  });

  it('conta só com Google não tem senha para trocar', async () => {
    const { user } = await googleOnly();
    await expect(
      profile.changePassword(user.id, { currentPassword: 'x', newPassword: 'nova-senha-1' }),
    ).rejects.toBeInstanceOf(PasswordChangeNotAllowedError);
  });
});

describe('consentimentos (CA10, CA11)', () => {
  it('lista o aceite do cadastro e a versão vigente', async () => {
    const { user } = await register();
    expect(await profile.listConsents(user.id)).toEqual({
      consents: [{ type: 'terms', version: TERMS_VERSION, acceptedAt: '2026-10-10T12:00:00.000Z' }],
      currentVersion: TERMS_VERSION,
    });
  });

  it('novo aceite entra no histórico sem alterar o anterior', async () => {
    const { user } = await register();
    now = new Date('2026-12-01T09:00:00Z');
    await profile.acceptConsent(user.id, { type: 'terms', version: TERMS_VERSION });
    const { consents } = await profile.listConsents(user.id);
    expect(consents.map((c) => c.acceptedAt)).toEqual([
      '2026-10-10T12:00:00.000Z',
      '2026-12-01T09:00:00.000Z',
    ]);
  });

  it('colaborador não tem consentimentos', async () => {
    const created = await createCollaborator(users, hasher, {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    if (!created.ok) throw new Error('falhou');
    expect((await profile.listConsents(created.user.id)).consents).toEqual([]);
  });
});
