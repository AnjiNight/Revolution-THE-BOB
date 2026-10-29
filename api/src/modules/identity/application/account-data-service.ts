import {
  PERSONAL_DATA_FORMAT,
  PERSONAL_DATA_VERSION,
  type EmailLocale,
  type PersonalDataExport,
} from '@simulador/shared';
import {
  DeletionNotAllowedError,
  EmailConfirmationUnavailableError,
  InvalidConfirmationCodeError,
  UserNotFoundError,
} from '../domain/errors.js';
import type { User } from '../domain/user.js';
import { accountDeletedEmail, deletionCodeEmail } from './account-deletion-emails.js';
import { runLogged } from './background.js';
import type { EmailCodes } from './email-codes.js';
import {
  runAfterResponse,
  type BackgroundRunner,
  type Clock,
  type EmailSender,
  type RefreshTokenRepository,
  type TaskLog,
  type UserRepository,
} from './ports.js';

export interface AccountDataServiceDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  codes: EmailCodes;
  /** Ausente sem SMTP (só fora de produção): a exclusão fica desligada; a exportação, não. */
  mailer?: EmailSender;
  clock?: Clock;
  runInBackground?: BackgroundRunner;
}

/**
 * Exportação e exclusão dos dados pessoais (SPEC-034, RF06, RB04). Sempre da conta do token:
 * não existe forma de exportar ou excluir outra conta (RB03).
 */
export class AccountDataService {
  private readonly clock: Clock;
  private readonly runInBackground: BackgroundRunner;

  constructor(private readonly deps: AccountDataServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.runInBackground = deps.runInBackground ?? runAfterResponse;
  }

  /**
   * Tudo o que o app guarda sobre a pessoa. Segredos de segurança (hash da senha, tokens, códigos)
   * e o identificador interno do Google ficam de fora: não descrevem a pessoa.
   */
  async exportData(userId: string): Promise<PersonalDataExport> {
    const user = await this.load(userId);
    const [consents, sessions] = await Promise.all([
      this.deps.users.listConsents(userId),
      this.deps.refreshTokens.listSessions(userId),
    ]);
    return {
      format: PERSONAL_DATA_FORMAT,
      version: PERSONAL_DATA_VERSION,
      exportedAt: this.clock().toISOString(),
      account: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        signInMethods: [
          ...(user.passwordHash ? (['password'] as const) : []),
          ...(user.googleSub ? (['google'] as const) : []),
        ],
        createdAt: user.createdAt.toISOString(),
        emailConfirmedAt: user.emailConfirmedAt?.toISOString() ?? null,
        pendingEmail: user.pendingEmail,
      },
      consents: consents.map((consent) => ({
        type: consent.type,
        version: consent.version,
        acceptedAt: consent.acceptedAt.toISOString(),
      })),
      sessions: sessions.map((session) => ({
        startedAt: session.startedAt.toISOString(),
        lastRenewedAt: session.lastRenewedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ended: session.ended,
      })),
    };
  }

  /** Manda o código de exclusão para o e-mail da conta. Nada é apagado ainda. */
  async requestDeletion(userId: string, locale: EmailLocale, log: TaskLog): Promise<void> {
    const mailer = this.requireMailer();
    const user = await this.loadDeletable(userId);
    runLogged(this.runInBackground, log, 'falha ao enviar o código de exclusão', async () => {
      const code = await this.deps.codes.issue(user.id, 'account_deletion');
      if (!code) {
        log.warn({ userId: user.id }, 'limite de e-mails por hora atingido');
        return;
      }
      await mailer.send({ to: user.email, ...deletionCodeEmail(locale, user.name, code) });
      log.info({ userId: user.id }, 'código de exclusão enviado');
    });
  }

  /**
   * Código certo apaga a conta na hora (RB04): conta, consentimentos, sessões e códigos. Fica só o
   * registro da exclusão, sem dado pessoal. A despedida vai para o endereço que a conta tinha.
   */
  async confirmDeletion(
    userId: string,
    code: string,
    locale: EmailLocale,
    log: TaskLog,
  ): Promise<void> {
    const mailer = this.requireMailer();
    const user = await this.loadDeletable(userId);
    if (!(await this.deps.codes.consume(user.id, 'account_deletion', code))) {
      log.info({ userId: user.id }, 'código de exclusão errado');
      throw new InvalidConfirmationCodeError();
    }

    const at = this.clock();
    await this.deps.users.deleteAccount(user.id, at);
    log.info({ userId: user.id }, 'conta excluída');
    runLogged(this.runInBackground, log, 'falha ao enviar a despedida', () =>
      mailer.send({ to: user.email, ...accountDeletedEmail(locale, user.name, at) }),
    );
  }

  private async load(userId: string): Promise<User> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  /** Colaborador não se exclui pelo app: a conta é da equipe (SPEC-034 §4). */
  private async loadDeletable(userId: string): Promise<User> {
    const user = await this.load(userId);
    if (user.role !== 'user') throw new DeletionNotAllowedError();
    return user;
  }

  private requireMailer(): EmailSender {
    if (!this.deps.mailer) throw new EmailConfirmationUnavailableError();
    return this.deps.mailer;
  }
}
