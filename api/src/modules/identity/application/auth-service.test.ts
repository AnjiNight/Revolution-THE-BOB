import { TERMS_VERSION } from '@simulador/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EmailInUseError,
  GoogleEmailNotVerifiedError,
  GoogleTokenInvalidError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  TermsRequiredError,
  WrongAccountTypeError,
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
import { hashRefreshToken } from './refresh-token.js';

const input = {
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  password: 'senha-bem-longa',
  acceptedTerms: true as const,
};

let now: Date;
let users: InMemoryUserRepository;
let tokens: InMemoryRefreshTokenRepository;
let hasher: FakePasswordHasher;
let accessTokens: JwtAccessTokenService;
let auth: AuthService;

beforeEach(() => {
  now = new Date('2026-10-08T12:00:00Z');
  users = new InMemoryUserRepository();
  tokens = new InMemoryRefreshTokenRepository();
  hasher = new FakePasswordHasher();
  accessTokens = new JwtAccessTokenService('segredo-de-teste-com-mais-de-32-caracteres', 15);
  auth = new AuthService({
    users,
    refreshTokens: tokens,
    hasher,
    accessTokens,
    refreshTokenTtlDays: 30,
    google: new FakeGoogleVerifier(),
    clock: () => now,
  });
});

describe('cadastro (CA01, CA02)', () => {
  it('cria usuário com perfil user, registra o consentimento e devolve a sessão', async () => {
    const session = await auth.register(input);

    expect(session.user).toEqual({
      id: expect.any(String),
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      role: 'user',
    });
    expect(users.consents).toEqual([{ userId: session.user.id, version: TERMS_VERSION }]);
    expect(accessTokens.verify(session.accessToken)).toEqual({
      userId: session.user.id,
      role: 'user',
    });
    expect(tokens.tokens).toHaveLength(1);
    expect(tokens.tokens[0]?.expiresAt).toEqual(new Date('2026-11-07T12:00:00Z'));
  });

  it('guarda a senha só como hash e nunca a devolve', async () => {
    const session = await auth.register(input);
    expect(users.users[0]?.passwordHash).toBe('hash:senha-bem-longa');
    expect(JSON.stringify(session)).not.toContain('senha-bem-longa');
    expect(JSON.stringify(session)).not.toContain('hash:');
  });

  it('guarda só o hash do token de renovação', async () => {
    const session = await auth.register(input);
    expect(tokens.tokens[0]?.tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(JSON.stringify(tokens.tokens)).not.toContain(session.refreshToken);
  });

  it('recusa e-mail já cadastrado', async () => {
    await auth.register(input);
    await expect(auth.register({ ...input, name: 'Outra' })).rejects.toBeInstanceOf(
      EmailInUseError,
    );
  });
});

describe('login (CA05)', () => {
  beforeEach(async () => {
    await auth.register(input);
  });

  it('entra com e-mail e senha corretos', async () => {
    const session = await auth.login({ email: input.email, password: input.password }, 'user');
    expect(session.user.email).toBe(input.email);
  });

  it('senha errada e e-mail inexistente dão o mesmo erro', async () => {
    await expect(
      auth.login({ email: input.email, password: 'errada' }, 'user'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      auth.login({ email: 'ninguem@exemplo.com', password: input.password }, 'user'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('com e-mail inexistente ainda executa uma verificação de senha (mesmo tempo)', async () => {
    await expect(
      auth.login({ email: 'ninguem@exemplo.com', password: 'x' }, 'user'),
    ).rejects.toThrow();
    expect(hasher.dummyCalls).toBe(1);
  });
});

describe('renovação da sessão (CA07, CA08)', () => {
  it('troca o token de renovação por um novo par e invalida o usado', async () => {
    const session = await auth.register(input);
    const renewed = await auth.refresh(session.refreshToken);

    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    expect(accessTokens.verify(renewed.accessToken)?.userId).toBe(session.user.id);
    await expect(auth.refresh(renewed.refreshToken)).resolves.toBeDefined();
  });

  it('reuso de token já trocado derruba toda a sessão daquele login', async () => {
    const session = await auth.register(input);
    const renewed = await auth.refresh(session.refreshToken);

    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    // O token legítimo mais recente também deixou de valer.
    await expect(auth.refresh(renewed.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('reuso não afeta outra sessão do mesmo usuário', async () => {
    const first = await auth.register(input);
    const second = await auth.login({ email: input.email, password: input.password }, 'user');
    await auth.refresh(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow();
    await expect(auth.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('recusa token expirado e token desconhecido', async () => {
    const session = await auth.register(input);
    now = new Date('2026-11-08T12:00:00Z'); // 31 dias depois
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    await expect(auth.refresh('token-que-nao-existe')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});

describe('logout (CA09)', () => {
  it('invalida o token de renovação da sessão', async () => {
    const session = await auth.register(input);
    await auth.logout(session.refreshToken);
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('não falha com token desconhecido', async () => {
    await expect(auth.logout('qualquer')).resolves.toBeUndefined();
  });
});

describe('colaborador (CA11)', () => {
  it('é criado pela equipe com senha forte gerada e sem consentimento de usuário', async () => {
    const result = await createCollaborator(users, hasher, {
      name: '  Nicoly ',
      email: ' Nicoly@Exemplo.com ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
      role: 'collaborator',
    });
    expect(result.password.length).toBeGreaterThanOrEqual(20);
    expect(users.users[0]?.passwordHash).toBe(`hash:${result.password}`);
    expect(users.consents).toEqual([]);
  });

  it('cada colaborador recebe uma senha diferente', async () => {
    const a = await createCollaborator(users, hasher, { name: 'Ana', email: 'a@x.com' });
    const b = await createCollaborator(users, hasher, { name: 'Bia', email: 'b@x.com' });
    expect(a.ok && b.ok && a.password !== b.password).toBe(true);
  });

  it('recusa dados inválidos', async () => {
    await expect(createCollaborator(users, hasher, { name: 'A', email: 'x' })).resolves.toEqual({
      ok: false,
      fields: { name: 'too_short', email: 'invalid_email' },
    });
  });

  it('cada tela aceita só o seu tipo de conta, e só depois da senha certa', async () => {
    const collaborator = await createCollaborator(users, hasher, {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    await auth.register(input);
    if (!collaborator.ok) throw new Error('falhou');

    const asCollaborator = await auth.login(
      { email: 'nicoly@exemplo.com', password: collaborator.password },
      'collaborator',
    );
    expect(accessTokens.verify(asCollaborator.accessToken)?.role).toBe('collaborator');

    await expect(
      auth.login({ email: 'nicoly@exemplo.com', password: collaborator.password }, 'user'),
    ).rejects.toBeInstanceOf(WrongAccountTypeError);
    await expect(
      auth.login({ email: input.email, password: input.password }, 'collaborator'),
    ).rejects.toBeInstanceOf(WrongAccountTypeError);
    // Senha errada na porta errada continua sendo só "credenciais inválidas".
    await expect(
      auth.login({ email: input.email, password: 'errada' }, 'collaborator'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('login com Google (CA17–CA20)', () => {
  it('primeiro acesso exige o aceite dos termos e então cria a conta de usuário', async () => {
    await expect(
      auth.loginWithGoogle({ idToken: 'google:sub-1:Ana@Gmail.com' }),
    ).rejects.toBeInstanceOf(TermsRequiredError);
    expect(users.users).toHaveLength(0);

    const session = await auth.loginWithGoogle({
      idToken: 'google:sub-1:Ana@Gmail.com',
      acceptedTerms: true,
    });
    expect(session.user).toMatchObject({
      email: 'ana@gmail.com',
      role: 'user',
      name: 'Pessoa Google',
    });
    expect(users.users[0]).toMatchObject({ googleSub: 'sub-1', passwordHash: null });
    expect(users.consents).toEqual([{ userId: session.user.id, version: TERMS_VERSION }]);
  });

  it('acessos seguintes não pedem os termos de novo', async () => {
    await auth.loginWithGoogle({ idToken: 'google:sub-1:ana@gmail.com', acceptedTerms: true });
    await expect(
      auth.loginWithGoogle({ idToken: 'google:sub-1:ana@gmail.com' }),
    ).resolves.toBeDefined();
  });

  it('liga o Google a uma conta existente com o mesmo e-mail', async () => {
    const registered = await auth.register(input);
    const session = await auth.loginWithGoogle({ idToken: `google:sub-9:${input.email}` });
    expect(session.user.id).toBe(registered.user.id);
    expect(users.users[0]?.googleSub).toBe('sub-9');
    // A senha continua funcionando.
    await expect(
      auth.login({ email: input.email, password: input.password }, 'user'),
    ).resolves.toBeDefined();
  });

  it('conta só com Google não entra por e-mail e senha', async () => {
    await auth.loginWithGoogle({ idToken: 'google:sub-1:ana@gmail.com', acceptedTerms: true });
    await expect(
      auth.login({ email: 'ana@gmail.com', password: 'qualquer' }, 'user'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(hasher.dummyCalls).toBe(1);
  });

  it('colaborador não entra pelo Google', async () => {
    await createCollaborator(users, hasher, { name: 'Nicoly', email: 'nicoly@exemplo.com' });
    await expect(
      auth.loginWithGoogle({ idToken: 'google:sub-2:nicoly@exemplo.com', acceptedTerms: true }),
    ).rejects.toBeInstanceOf(WrongAccountTypeError);
    expect(users.users[0]?.googleSub).toBeNull();
  });

  it('recusa token inválido e e-mail não verificado pelo Google', async () => {
    await expect(auth.loginWithGoogle({ idToken: 'lixo' })).rejects.toBeInstanceOf(
      GoogleTokenInvalidError,
    );
    await expect(
      auth.loginWithGoogle({ idToken: 'google:sub-3:x@y.com:nao-verificado', acceptedTerms: true }),
    ).rejects.toBeInstanceOf(GoogleEmailNotVerifiedError);
  });
});
