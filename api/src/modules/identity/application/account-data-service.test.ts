import { PERSONAL_DATA_FORMAT, TERMS_VERSION } from '@simulador/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DeletionNotAllowedError,
  EmailConfirmationUnavailableError,
  InvalidConfirmationCodeError,
  InvalidRefreshTokenError,
} from '../domain/errors.js';
import { createIdentityServices } from '../identity-services.js';
import { JwtAccessTokenService } from '../infrastructure/jwt-access-token-service.js';
import {
  BackgroundTasks,
  FakeEmailSender,
  FakeGoogleVerifier,
  FakePasswordHasher,
  InMemoryEmailCodeRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  MemoryLog,
} from '../testing/fakes.js';
import { createCollaborator } from './create-collaborator.js';
import { EmailCodeHasher } from './email-code.js';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const PASSWORD = 'senha-bem-longa';

let now: Date;
let users: InMemoryUserRepository;
let tokens: InMemoryRefreshTokenRepository;
let mailer: FakeEmailSender;
let background: BackgroundTasks;
let log: MemoryLog;
let services: ReturnType<typeof createIdentityServices>;

function build(options: { mailer?: boolean } = {}) {
  return createIdentityServices({
    users,
    refreshTokens: tokens,
    emailCodes: new InMemoryEmailCodeRepository(),
    hasher: new FakePasswordHasher(),
    codeHasher: new EmailCodeHasher(SECRET),
    accessTokens: new JwtAccessTokenService(SECRET, 15),
    refreshTokenTtlDays: 30,
    mailer: options.mailer === false ? undefined : mailer,
    google: new FakeGoogleVerifier(),
    clock: () => now,
    runInBackground: background.run,
  });
}

beforeEach(() => {
  now = new Date('2026-10-13T15:00:00Z');
  users = new InMemoryUserRepository(() => now);
  tokens = new InMemoryRefreshTokenRepository(() => now);
  mailer = new FakeEmailSender();
  background = new BackgroundTasks();
  log = new MemoryLog();
  services = build();
});

/** Conta confirmada (SPEC-039), com a sessão aberta pela confirmação. */
async function register(email = 'ana@exemplo.com') {
  await services.auth.register({
    name: 'Ana Souza',
    email,
    password: PASSWORD,
    acceptedTerms: true,
  });
  await background.settle();
  return services.auth.confirmEmail({ email, code: mailer.lastCode(email) });
}

async function requestCode(userId: string) {
  await services.accountData.requestDeletion(userId, 'pt-BR', log);
  await background.settle();
  return mailer.lastCode();
}

describe('exportação (SPEC-034 CA01, CA02)', () => {
  it('traz conta, consentimentos e sessões, com formato e versão', async () => {
    const { user, refreshToken } = await register();
    await services.auth.refresh(refreshToken);
    now = new Date('2026-10-13T16:00:00Z');
    await services.auth.login({ email: user.email, password: PASSWORD }, 'user');

    const data = await services.accountData.exportData(user.id);
    expect(data).toEqual({
      format: PERSONAL_DATA_FORMAT,
      version: 1,
      exportedAt: '2026-10-13T16:00:00.000Z',
      account: {
        id: user.id,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        role: 'user',
        signInMethods: ['password'],
        createdAt: '2026-10-13T15:00:00.000Z',
        emailConfirmedAt: '2026-10-13T15:00:00.000Z',
        pendingEmail: null,
      },
      consents: [{ type: 'terms', version: TERMS_VERSION, acceptedAt: '2026-10-13T15:00:00.000Z' }],
      sessions: [
        {
          startedAt: '2026-10-13T15:00:00.000Z',
          lastRenewedAt: '2026-10-13T15:00:00.000Z',
          expiresAt: '2026-11-12T15:00:00.000Z',
          ended: false,
        },
        {
          startedAt: '2026-10-13T16:00:00.000Z',
          lastRenewedAt: '2026-10-13T16:00:00.000Z',
          expiresAt: '2026-11-12T16:00:00.000Z',
          ended: false,
        },
      ],
    });
  });

  it('nunca traz hash da senha, tokens, códigos nem o identificador do Google', async () => {
    const { user, refreshToken } = await register();
    await services.auth.loginWithGoogle({ idToken: `google:sub-secreto:${user.email}` });
    const text = JSON.stringify(await services.accountData.exportData(user.id));
    expect(text).toContain('"signInMethods":["password","google"]');
    for (const secret of ['hash:', PASSWORD, refreshToken, 'sub-secreto', mailer.lastCode()]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('exclusão (SPEC-034 CA03–CA07)', () => {
  it('o pedido manda o código ao e-mail da conta e não apaga nada (CA03)', async () => {
    const { user } = await register();
    await requestCode(user.id);
    expect(mailer.sent.at(-1)).toMatchObject({
      to: 'ana@exemplo.com',
      subject: 'Código para excluir sua conta',
    });
    expect(await users.findById(user.id)).not.toBeNull();
  });

  it('com o código certo, apaga tudo, registra sem dado pessoal e se despede (CA04)', async () => {
    const { user, refreshToken } = await register();
    const code = await requestCode(user.id);
    await services.accountData.confirmDeletion(user.id, code, 'pt-BR', log);
    await background.settle();

    expect(await users.findById(user.id)).toBeNull();
    expect(users.consents).toEqual([]);
    expect(users.deletions).toEqual([{ userId: user.id, at: now }]);
    await expect(services.auth.refresh(refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(mailer.sent.at(-1)).toMatchObject({
      to: 'ana@exemplo.com',
      subject: 'Sua conta foi excluída',
    });
  });

  it('código errado não apaga nada; depois da 5ª tentativa, nem o certo vale (CA05)', async () => {
    const { user } = await register();
    const code = await requestCode(user.id);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i += 1) {
      await expect(
        services.accountData.confirmDeletion(user.id, wrong, 'pt-BR', log),
      ).rejects.toBeInstanceOf(InvalidConfirmationCodeError);
    }
    await expect(
      services.accountData.confirmDeletion(user.id, code, 'pt-BR', log),
    ).rejects.toBeInstanceOf(InvalidConfirmationCodeError);
    expect(await users.findById(user.id)).not.toBeNull();
  });

  it('colaborador não se exclui pelo app; conta só Google exclui normalmente (CA06)', async () => {
    const created = await createCollaborator(users, new FakePasswordHasher(), {
      name: 'Nicoly',
      email: 'nicoly@exemplo.com',
    });
    if (!created.ok) throw new Error('falhou');
    await expect(
      services.accountData.requestDeletion(created.user.id, 'pt-BR', log),
    ).rejects.toBeInstanceOf(DeletionNotAllowedError);
    await expect(
      services.accountData.confirmDeletion(created.user.id, '00000000', 'pt-BR', log),
    ).rejects.toBeInstanceOf(DeletionNotAllowedError);

    const google = await services.auth.loginWithGoogle({
      idToken: 'google:sub-1:gi@gmail.com',
      acceptedTerms: true,
    });
    const code = await requestCode(google.user.id);
    await services.accountData.confirmDeletion(google.user.id, code, 'pt-BR', log);
    expect(await users.findById(google.user.id)).toBeNull();
  });

  it('o mesmo e-mail pode criar uma conta nova, sem nada da antiga (CA07)', async () => {
    const { user } = await register();
    const code = await requestCode(user.id);
    await services.accountData.confirmDeletion(user.id, code, 'pt-BR', log);
    const again = await register();
    expect(again.user.id).not.toBe(user.id);
    expect((await services.accountData.exportData(again.user.id)).sessions).toHaveLength(1);
  });

  it('nenhum log contém nome, e-mail ou código (CA09)', async () => {
    const { user } = await register();
    const code = await requestCode(user.id);
    await services.accountData.confirmDeletion(user.id, code, 'pt-BR', log);
    await background.settle();
    expect(log.text).toContain('conta excluída');
    for (const secret of ['Ana Souza', 'ana@exemplo.com', code]) {
      expect(log.text).not.toContain(secret);
    }
  });

  it('sem SMTP, a exclusão fica desligada; a exportação continua', async () => {
    const { user } = await register();
    services = build({ mailer: false });
    await expect(
      services.accountData.requestDeletion(user.id, 'pt-BR', log),
    ).rejects.toBeInstanceOf(EmailConfirmationUnavailableError);
    await expect(services.accountData.exportData(user.id)).resolves.toBeDefined();
  });
});
