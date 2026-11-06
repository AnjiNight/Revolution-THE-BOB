import { randomUUID } from 'node:crypto';
import {
  NAME_MAX,
  normalizeEmail,
  TERMS_VERSION,
  type AuthSession,
  type EmailConfirmationInput,
  type EmailConfirmationResend,
  type GoogleLoginInput,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type Role,
  type TokenPair,
} from '@simulador/shared';
import {
  EmailInUseError,
  EmailNotConfirmedError,
  GoogleEmailNotVerifiedError,
  GoogleTokenInvalidError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  TermsRequiredError,
  WrongAccountTypeError,
} from '../domain/errors.js';
import { accountState, toPublicUser, type User } from '../domain/user.js';
import type { EmailConfirmationService } from './email-confirmation-service.js';
import {
  SILENT_LOG,
  type AccessTokenService,
  type Clock,
  type GoogleIdentityVerifier,
  type PasswordHasher,
  type RefreshTokenRepository,
  type TaskLog,
  type UserRepository,
} from './ports.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

export interface AuthServiceDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  accessTokens: AccessTokenService;
  refreshTokenTtlDays: number;
  /** SPEC-039: código de confirmação do cadastro com e-mail e senha. */
  confirmations: EmailConfirmationService;
  /** Ausente quando o login com Google não está configurado. */
  google?: GoogleIdentityVerifier;
  clock?: Clock;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Casos de uso de cadastro, login e sessão (SPEC-002), com a confirmação de e-mail (SPEC-039). */
export class AuthService {
  private readonly clock: Clock;

  constructor(private readonly deps: AuthServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  get googleEnabled(): boolean {
    return this.deps.google !== undefined;
  }

  /**
   * RF01 + SPEC-039: cria a conta de usuário **pendente**, registra o consentimento e envia o
   * código de confirmação. Não abre sessão: a pessoa só entra depois de confirmar o e-mail.
   * Um cadastro nunca confirmado com o mesmo e-mail é substituído; uma conta confirmada, não.
   */
  async register(input: RegisterInput, log: TaskLog = SILENT_LOG): Promise<void> {
    this.deps.confirmations.assertEnabled();
    const existing = await this.deps.users.findByEmail(input.email);
    if (existing) {
      if (accountState(existing, this.clock()) === 'active') throw new EmailInUseError();
      await this.deps.users.deleteUnconfirmed(existing.id);
    }
    const user = await this.deps.users.create({
      name: input.name,
      email: input.email,
      role: 'user',
      passwordHash: await this.deps.hasher.hash(input.password),
      googleSub: null,
      termsVersion: TERMS_VERSION,
      emailConfirmedAt: null,
    });
    this.deps.confirmations.sendSignupCode(user, input.locale ?? 'pt-BR', log);
  }

  /** SPEC-039: código certo libera a conta e abre a sessão. */
  async confirmEmail(
    input: EmailConfirmationInput,
    log: TaskLog = SILENT_LOG,
  ): Promise<AuthSession> {
    return this.startSession(await this.deps.confirmations.confirmSignup(input, log));
  }

  /** SPEC-039: "Reenviar código" na tela de confirmação. */
  resendConfirmation(input: EmailConfirmationResend, log: TaskLog = SILENT_LOG): Promise<void> {
    return this.deps.confirmations.resend(input, log);
  }

  /**
   * RF02: e-mail e senha. Cada tela aceita só o seu tipo de conta (usuário ou colaborador).
   * O tipo só é revelado depois de a senha estar certa, para não expor quem tem conta.
   * SPEC-039: conta pendente, com a senha certa, recebe um código novo e `email_not_confirmed`.
   */
  async login(
    input: LoginInput,
    accountType: Role,
    log: TaskLog = SILENT_LOG,
  ): Promise<AuthSession> {
    const user = await this.deps.users.findByEmail(input.email);
    if (!user?.passwordHash) {
      await this.deps.hasher.verifyDummy(input.password);
      throw new InvalidCredentialsError();
    }
    if (!(await this.deps.hasher.verify(user.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }
    if (user.role !== accountType) throw new WrongAccountTypeError();
    const state = accountState(user, this.clock());
    // Pendente há mais de 7 dias: para o app, a conta já não existe (RB23).
    if (state === 'expired') throw new InvalidCredentialsError();
    if (state === 'pending') {
      this.deps.confirmations.sendSignupCode(user, input.locale ?? 'pt-BR', log);
      throw new EmailNotConfirmedError();
    }
    return this.startSession(user);
  }

  /**
   * DA24: entrar com Google (só contas de usuário). Liga a uma conta existente com o mesmo
   * e-mail verificado; se for o primeiro acesso, exige o aceite dos termos para criar a conta.
   */
  async loginWithGoogle(input: GoogleLoginInput): Promise<AuthSession> {
    const identity = await this.deps.google?.verify(input.idToken);
    if (!identity) throw new GoogleTokenInvalidError();
    if (!identity.emailVerified) throw new GoogleEmailNotVerifiedError();

    const linked = await this.deps.users.findByGoogleSub(identity.sub);
    if (linked) {
      if (linked.role !== 'user') throw new WrongAccountTypeError();
      return this.startSession(linked);
    }

    const email = normalizeEmail(identity.email);
    const existing = await this.deps.users.findByEmail(email);
    if (existing && accountState(existing, this.clock()) === 'active') {
      if (existing.role !== 'user') throw new WrongAccountTypeError();
      return this.startSession(await this.deps.users.linkGoogle(existing.id, identity.sub));
    }

    if (input.acceptedTerms !== true) throw new TermsRequiredError();
    // SPEC-039: um cadastro nunca confirmado com este e-mail é descartado, junto com a senha que
    // alguém escolheu. Ligar as contas deixaria essa senha valendo na conta do dono do e-mail.
    if (existing) await this.deps.users.deleteUnconfirmed(existing.id);
    const user = await this.deps.users.create({
      name: identity.name.trim().slice(0, NAME_MAX) || email.split('@')[0] || 'Usuário',
      email,
      role: 'user',
      passwordHash: null,
      googleSub: identity.sub,
      termsVersion: TERMS_VERSION,
      // O Google só entrega e-mail verificado (conferido acima): a conta nasce confirmada.
      emailConfirmedAt: this.clock(),
    });
    return this.startSession(user);
  }

  /** RF02: troca o token de renovação por um novo par. Reuso derruba a sessão inteira. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!stored) throw new InvalidRefreshTokenError();

    const now = this.clock();
    if (stored.revokedAt) {
      await this.deps.refreshTokens.revokeFamily(stored.family, now);
      throw new InvalidRefreshTokenError();
    }
    if (stored.expiresAt.getTime() <= now.getTime()) throw new InvalidRefreshTokenError();

    const user = await this.deps.users.findById(stored.userId);
    if (!user) throw new InvalidRefreshTokenError();

    const next = generateRefreshToken();
    const rotated = await this.deps.refreshTokens.rotate(
      stored.id,
      {
        userId: user.id,
        tokenHash: next.tokenHash,
        family: stored.family,
        expiresAt: this.refreshExpiry(now),
      },
      now,
    );
    if (!rotated) {
      await this.deps.refreshTokens.revokeFamily(stored.family, now);
      throw new InvalidRefreshTokenError();
    }

    return { accessToken: this.issueAccessToken(user), refreshToken: next.token };
  }

  /** Encerra a sessão daquele login. Não falha se o token já não valer. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (stored) await this.deps.refreshTokens.revokeFamily(stored.family, this.clock());
  }

  async currentUser(userId: string): Promise<PublicUser | null> {
    const user = await this.deps.users.findById(userId);
    return user ? toPublicUser(user) : null;
  }

  /** Abre uma sessão nova (nova família de tokens). Também usado após a troca de senha. */
  async startSession(user: User): Promise<AuthSession> {
    const refresh = generateRefreshToken();
    await this.deps.refreshTokens.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      family: randomUUID(),
      expiresAt: this.refreshExpiry(this.clock()),
    });
    return {
      user: toPublicUser(user),
      accessToken: this.issueAccessToken(user),
      refreshToken: refresh.token,
    };
  }

  private issueAccessToken(user: User): string {
    return this.deps.accessTokens.issue({ userId: user.id, role: user.role });
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.deps.refreshTokenTtlDays * DAY_MS);
  }
}
