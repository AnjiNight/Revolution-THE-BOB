import {
  TERMS_VERSION,
  type AcceptConsentInput,
  type AuthSession,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type ConfirmEmailChangeInput,
  type Consent,
  type ConsentList,
  type UserProfile,
} from '@simulador/shared';
import {
  EmailChangeNotAllowedError,
  EmailInUseError,
  InvalidPasswordError,
  PasswordChangeNotAllowedError,
  UserNotFoundError,
} from '../domain/errors.js';
import { accountState, toUserProfile, type User } from '../domain/user.js';
import type { EmailConfirmationService } from './email-confirmation-service.js';
import {
  SILENT_LOG,
  type Clock,
  type PasswordHasher,
  type RefreshTokenRepository,
  type StoredConsent,
  type TaskLog,
  type UserRepository,
} from './ports.js';

export interface ProfileServiceDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  /** Abre a sessão nova depois da troca de senha (AuthService). */
  sessions: { startSession(user: User): Promise<AuthSession> };
  /** SPEC-039: código de confirmação do e-mail novo. */
  confirmations: EmailConfirmationService;
  clock?: Clock;
}

/**
 * Casos de uso do perfil (SPEC-003). Sempre agem sobre a conta do token: não existe forma de
 * informar o id de outra pessoa (RB03).
 */
export class ProfileService {
  private readonly clock: Clock;

  constructor(private readonly deps: ProfileServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async getProfile(userId: string): Promise<UserProfile> {
    return toUserProfile(await this.load(userId));
  }

  async updateName(userId: string, name: string): Promise<UserProfile> {
    await this.load(userId);
    return toUserProfile(await this.deps.users.updateName(userId, name));
  }

  /**
   * Conta só com Google não troca o e-mail; as demais confirmam com a senha atual. SPEC-039: o
   * e-mail novo fica pendente e recebe um código; o da conta só muda em `confirmEmailChange`.
   */
  async changeEmail(
    userId: string,
    input: ChangeEmailInput,
    log: TaskLog = SILENT_LOG,
  ): Promise<void> {
    const user = await this.load(userId);
    if (!user.passwordHash) throw new EmailChangeNotAllowedError();
    await this.checkPassword(user.passwordHash, input.currentPassword);
    if (input.email === user.email) {
      // Voltou ao e-mail atual: cancela uma troca que estivesse esperando o código.
      if (user.pendingEmail) await this.deps.users.setPendingEmail(userId, null);
      return;
    }
    const other = await this.deps.users.findByEmail(input.email);
    if (other && other.id !== userId && accountState(other, this.clock()) === 'active') {
      throw new EmailInUseError();
    }
    await this.deps.confirmations.requestEmailChange(
      user,
      input.email,
      input.locale ?? 'pt-BR',
      log,
    );
  }

  /** SPEC-039: código certo troca o e-mail da conta; o endereço antigo recebe um aviso. */
  async confirmEmailChange(
    userId: string,
    input: ConfirmEmailChangeInput,
    log: TaskLog = SILENT_LOG,
  ): Promise<UserProfile> {
    const user = await this.load(userId);
    return toUserProfile(
      await this.deps.confirmations.confirmEmailChange(
        user,
        input.code,
        input.locale ?? 'pt-BR',
        log,
      ),
    );
  }

  /**
   * Troca a senha, encerra todas as sessões da conta e abre uma nova para quem fez a troca.
   * Assim, quem tinha a senha antiga (ou um token roubado) perde o acesso.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<AuthSession> {
    const user = await this.load(userId);
    if (!user.passwordHash) throw new PasswordChangeNotAllowedError();
    await this.checkPassword(user.passwordHash, input.currentPassword);

    const updated = await this.deps.users.updatePasswordHash(
      userId,
      await this.deps.hasher.hash(input.newPassword),
    );
    await this.deps.refreshTokens.revokeAllForUser(userId, this.clock());
    return this.deps.sessions.startSession(updated);
  }

  async listConsents(userId: string): Promise<ConsentList> {
    await this.load(userId);
    const consents = await this.deps.users.listConsents(userId);
    return { consents: consents.map(toConsent), currentVersion: TERMS_VERSION };
  }

  /** Registra um novo aceite; o histórico anterior nunca é alterado (RNF11). */
  async acceptConsent(userId: string, input: AcceptConsentInput): Promise<Consent> {
    await this.load(userId);
    return toConsent(await this.deps.users.addConsent(userId, input.type, input.version));
  }

  private async load(userId: string): Promise<User> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  private async checkPassword(hash: string, password: string): Promise<void> {
    if (!(await this.deps.hasher.verify(hash, password))) throw new InvalidPasswordError();
  }
}

function toConsent(consent: StoredConsent): Consent {
  return {
    type: consent.type,
    version: consent.version,
    acceptedAt: consent.acceptedAt.toISOString(),
  };
}
