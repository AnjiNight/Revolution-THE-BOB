import { RESET_CODE_ALPHABET, type EmailLocale } from '@simulador/shared';
import { describe, expect, it } from 'vitest';
import { InvalidResetCodeError, PasswordResetUnavailableError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import {
  BackgroundTasks,
  FakeEmailSender,
  FakePasswordHasher,
  InMemoryPasswordResetRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
  MemoryLog,
} from '../testing/fakes.js';
import { PasswordResetService, RESET_REQUESTS_PER_HOUR } from './password-reset-service.js';
import { ResetCodeHasher } from './reset-code.js';

const MINUTE = 60_000;

function setup(options: { mailer?: boolean } = {}) {
  let now = new Date('2026-10-12T15:00:00.000Z');
  const clock = () => now;
  const users = new InMemoryUserRepository(clock);
  const resets = new InMemoryPasswordResetRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const hasher = new FakePasswordHasher();
  const codes = new ResetCodeHasher('segredo-de-teste-com-mais-de-32-caracteres');
  const mailer = new FakeEmailSender();
  const background = new BackgroundTasks();
  const log = new MemoryLog();
  const service = new PasswordResetService({
    users,
    resets,
    refreshTokens,
    hasher,
    codes,
    clock,
    runInBackground: background.run,
    ...(options.mailer === false ? {} : { mailer }),
  });

  const createUser = (
    overrides: Partial<Pick<User, 'role' | 'passwordHash' | 'googleSub'>> & { email?: string } = {},
  ) =>
    users.create({
      name: 'Ana Souza',
      email: overrides.email ?? 'ana@exemplo.com',
      role: overrides.role ?? 'user',
      passwordHash:
        overrides.passwordHash === undefined ? 'hash:senha-antiga' : overrides.passwordHash,
      googleSub: overrides.googleSub ?? null,
      termsVersion: null,
    });

  const request = async (email = 'ana@exemplo.com', locale: EmailLocale = 'pt-BR') => {
    await service.request({ email, locale }, log);
    await background.settle();
  };

  const confirm = async (
    code: string,
    email = 'ana@exemplo.com',
    newPassword = 'senha-nova-123',
  ) => {
    await service.confirm({ email, code, newPassword, locale: 'pt-BR' }, log);
    await background.settle();
  };

  return {
    service,
    users,
    resets,
    refreshTokens,
    codes,
    mailer,
    log,
    request,
    confirm,
    createUser,
    advance: (minutes: number) => {
      now = new Date(now.getTime() + minutes * MINUTE);
    },
  };
}

describe('pedido do código (SPEC-004)', () => {
  it('envia um código de 8 caracteres que vale 15 minutos e guarda só o HMAC (CA01, CA04)', async () => {
    const t = setup();
    await t.createUser();
    await t.request();

    expect(t.mailer.sent).toHaveLength(1);
    const [email] = t.mailer.sent;
    expect(email).toMatchObject({
      to: 'ana@exemplo.com',
      subject: 'Seu código para redefinir a senha',
    });
    expect(email!.text).toContain('Olá, Ana Souza');
    expect(email!.text).not.toMatch(/https?:\/\//);

    const code = t.mailer.lastCode();
    expect(code).toHaveLength(8);
    for (const char of code) expect(RESET_CODE_ALPHABET).toContain(char);

    const [stored] = t.resets.resets;
    expect(stored!.codeHash).toBe(t.codes.hash(code));
    expect(stored!.codeHash).not.toContain(code);
    expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(15 * MINUTE);
  });

  it('escreve o e-mail no idioma pedido', async () => {
    const t = setup();
    await t.createUser();
    await t.request('ana@exemplo.com', 'en');
    expect(t.mailer.sent[0]).toMatchObject({ subject: 'Your code to reset your password' });
    expect(t.mailer.sent[0]!.text).toContain('Hi, Ana Souza');
  });

  it('e-mail sem conta: nada é enviado e nada é gravado (CA02)', async () => {
    const t = setup();
    await t.request('ninguem@exemplo.com');
    expect(t.mailer.sent).toEqual([]);
    expect(t.resets.resets).toEqual([]);
  });

  it('conta só Google: recebe o aviso, sem código, e o pedido já nasce encerrado (CA02)', async () => {
    const t = setup();
    await t.createUser({ passwordHash: null, googleSub: 'sub' });
    await t.request();
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]!.subject).toBe('Pedido de redefinição de senha');
    expect(t.mailer.sent[0]!.text).toContain('Continuar com o Google');
    expect(() => t.mailer.lastCode()).toThrow();
    expect(t.resets.resets[0]!.closedAt).not.toBeNull();
  });

  it(`no máximo ${RESET_REQUESTS_PER_HOUR} e-mails por conta em uma hora (CA08)`, async () => {
    const t = setup();
    await t.createUser();
    for (let i = 0; i < RESET_REQUESTS_PER_HOUR + 1; i += 1) {
      await t.request();
      t.advance(1);
    }
    expect(t.mailer.sent).toHaveLength(RESET_REQUESTS_PER_HOUR);

    t.advance(60);
    await t.request();
    expect(t.mailer.sent).toHaveLength(RESET_REQUESTS_PER_HOUR + 1);
  });

  it('pedir de novo invalida o código anterior (CA04)', async () => {
    const t = setup();
    await t.createUser();
    await t.request();
    const first = t.mailer.lastCode();
    await t.request();
    const second = t.mailer.lastCode();

    await expect(t.confirm(first)).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(t.confirm(second)).resolves.toBeUndefined();
  });

  it('falha no envio fica no log só com o tipo do erro, sem o e-mail (DA13)', async () => {
    const t = setup();
    await t.createUser();
    t.mailer.failWith = Object.assign(new Error('recipient ana@exemplo.com rejected'), {
      code: 'EENVELOPE',
    });
    await t.request();
    expect(t.log.entries).toContainEqual({
      level: 'error',
      details: { errorType: 'EENVELOPE' },
      message: 'falha ao processar o pedido de redefinição de senha',
    });
    expect(t.log.text).not.toContain('ana@exemplo.com');
  });
});

describe('redefinição com o código (SPEC-004)', () => {
  it('troca a senha, encerra todas as sessões e os códigos e avisa por e-mail (CA05)', async () => {
    const t = setup();
    const ana = await t.createUser();
    await t.refreshTokens.create({
      userId: ana.id,
      tokenHash: 'a'.repeat(64),
      family: 'f1',
      expiresAt: new Date('2026-11-01'),
    });
    await t.request();
    // O serviço recebe o código já normalizado pelo esquema compartilhado (ver o teste das rotas).
    await t.confirm(t.mailer.lastCode());

    expect((await t.users.findById(ana.id))?.passwordHash).toBe('hash:senha-nova-123');
    expect(t.refreshTokens.tokens.every((token) => token.revokedAt !== null)).toBe(true);
    expect(t.resets.resets.every((reset) => reset.closedAt !== null)).toBe(true);
    expect(t.mailer.sent.at(-1)).toMatchObject({
      to: 'ana@exemplo.com',
      subject: 'Sua senha foi redefinida',
    });
    expect(t.mailer.sent.at(-1)!.text).toContain('12 de outubro de 2026');
  });

  it('código errado, vencido, já usado ou de e-mail sem conta: o mesmo erro, e nada muda (CA06)', async () => {
    const t = setup();
    const ana = await t.createUser();
    await t.request();
    const code = t.mailer.lastCode();
    const wrong = code === '00000000' ? '11111111' : '00000000';

    await expect(t.confirm(wrong)).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(t.confirm(code, 'ninguem@exemplo.com')).rejects.toBeInstanceOf(
      InvalidResetCodeError,
    );
    expect((await t.users.findById(ana.id))?.passwordHash).toBe('hash:senha-antiga');

    t.advance(16);
    await expect(t.confirm(code)).rejects.toBeInstanceOf(InvalidResetCodeError);

    await t.request();
    const fresh = t.mailer.lastCode();
    await t.confirm(fresh);
    await expect(t.confirm(fresh, 'ana@exemplo.com', 'outra-senha-1')).rejects.toBeInstanceOf(
      InvalidResetCodeError,
    );
    expect((await t.users.findById(ana.id))?.passwordHash).toBe('hash:senha-nova-123');
  });

  it('depois da 5ª tentativa errada, nem o código certo funciona (CA07)', async () => {
    const t = setup();
    await t.createUser();
    await t.request();
    const code = t.mailer.lastCode();
    const wrong = code === '00000000' ? '11111111' : '00000000';

    for (let i = 0; i < 5; i += 1) {
      await expect(t.confirm(wrong)).rejects.toBeInstanceOf(InvalidResetCodeError);
    }
    await expect(t.confirm(code)).rejects.toBeInstanceOf(InvalidResetCodeError);
    expect(t.resets.resets[0]!.closedAt).not.toBeNull();
  });

  it('a 5ª tentativa ainda vale se for a certa', async () => {
    const t = setup();
    await t.createUser();
    await t.request();
    const code = t.mailer.lastCode();
    const wrong = code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 4; i += 1) {
      await expect(t.confirm(wrong)).rejects.toBeInstanceOf(InvalidResetCodeError);
    }
    await expect(t.confirm(code)).resolves.toBeUndefined();
  });

  it('colaborador também redefine a própria senha (CA13)', async () => {
    const t = setup();
    const bia = await t.createUser({ email: 'bia@equipe.com', role: 'collaborator' });
    await t.request('bia@equipe.com');
    await t.confirm(t.mailer.lastCode(), 'bia@equipe.com');
    expect((await t.users.findById(bia.id))?.passwordHash).toBe('hash:senha-nova-123');
  });

  it('conta só Google não tem código que funcione', async () => {
    const t = setup();
    await t.createUser({ passwordHash: null, googleSub: 'sub' });
    await t.request();
    await expect(t.confirm('00000000')).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it('nenhum log contém e-mail, código ou senha (CA11)', async () => {
    const t = setup();
    await t.createUser();
    await t.request();
    const code = t.mailer.lastCode();
    await t.confirm(code);
    for (const secret of ['ana@exemplo.com', code, 'senha-nova-123', 'senha-antiga']) {
      expect(t.log.text).not.toContain(secret);
    }
  });
});

describe('sem SMTP configurado (CA12)', () => {
  it('pedido e redefinição recusam com PasswordResetUnavailableError', async () => {
    const t = setup({ mailer: false });
    expect(t.service.enabled).toBe(false);
    await expect(t.request()).rejects.toBeInstanceOf(PasswordResetUnavailableError);
    await expect(t.confirm('00000000')).rejects.toBeInstanceOf(PasswordResetUnavailableError);
  });
});
