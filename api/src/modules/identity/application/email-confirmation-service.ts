import { PENDING_ACCOUNT_DAYS, type EmailLocale } from '@simulador/shared';
import {
  EmailConfirmationUnavailableError,
  EmailInUseError,
  InvalidConfirmationCodeError,
} from '../domain/errors.js';
import { accountState, type User } from '../domain/user.js';
import { runLogged } from './background.js';
import {
  emailChangeCodeEmail,
  emailChangedNotice,
  maskEmail,
  signupCodeEmail,
} from './email-confirmation-emails.js';
import type { EmailCodes } from './email-codes.js';
import {
  runAfterResponse,
  type BackgroundRunner,
  type Clock,
  type EmailSender,
  type TaskLog,
  type UserRepository,
} from './ports.js';

export interface EmailConfirmationServiceDeps {
  users: UserRepository;
  codes: EmailCodes;
  /** Ausente sem SMTP (só fora de produção): o cadastro com senha e a troca de e-mail ficam desligados. */
  mailer?: EmailSender;
  clock?: Clock;
  runInBackground?: BackgroundRunner;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Confirmação de e-mail (SPEC-039, RF43, RB23): só entra quem provou que o e-mail é seu, no
 * cadastro com e-mail e senha e na troca de e-mail do perfil.
 */
export class EmailConfirmationService {
  private readonly clock: Clock;
  private readonly runInBackground: BackgroundRunner;

  constructor(private readonly deps: EmailConfirmationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.runInBackground = deps.runInBackground ?? runAfterResponse;
  }

  get enabled(): boolean {
    return this.deps.mailer !== undefined;
  }

  /** Lança EmailConfirmationUnavailableError quando o SMTP não está configurado. */
  assertEnabled(): void {
    this.requireMailer();
  }

  /** Envia o código do cadastro depois da resposta (cadastro novo ou login de conta pendente). */
  sendSignupCode(user: User, locale: EmailLocale, log: TaskLog): void {
    const mailer = this.deps.mailer;
    if (!mailer) return;
    runLogged(this.runInBackground, log, 'falha ao enviar o código de confirmação', async () => {
      const code = await this.deps.codes.issue(user.id, 'signup');
      if (!code) {
        log.warn({ userId: user.id }, 'limite de e-mails por hora atingido');
        return;
      }
      await mailer.send({ to: user.email, ...signupCodeEmail(locale, user.name, code) });
      log.info({ userId: user.id }, 'código de confirmação enviado');
    });
  }

  /** "Reenviar código": responde igual exista ou não uma conta pendente com esse e-mail. */
  async resend(input: { email: string; locale: EmailLocale }, log: TaskLog): Promise<void> {
    this.assertEnabled();
    runLogged(this.runInBackground, log, 'falha ao reenviar o código de confirmação', async () => {
      const user = await this.deps.users.findByEmail(input.email);
      if (!user || accountState(user, this.clock()) !== 'pending') {
        log.info({}, 'reenvio para e-mail sem conta pendente');
        return;
      }
      this.sendSignupCode(user, input.locale, log);
    });
  }

  /** Código certo libera a conta pendente; quem chama abre a sessão. */
  async confirmSignup(input: { email: string; code: string }, log: TaskLog): Promise<User> {
    this.assertEnabled();
    const user = await this.deps.users.findByEmail(input.email);
    if (!user || accountState(user, this.clock()) !== 'pending') {
      throw new InvalidConfirmationCodeError();
    }
    if (!(await this.deps.codes.consume(user.id, 'signup', input.code))) {
      log.info({ userId: user.id }, 'código de confirmação errado');
      throw new InvalidConfirmationCodeError();
    }
    const confirmed = await this.deps.users.confirmEmail(user.id, this.clock());
    log.info({ userId: user.id }, 'e-mail confirmado');
    return confirmed;
  }

  /**
   * Troca de e-mail (SPEC-003 + SPEC-039): o e-mail novo fica pendente e recebe um código. O e-mail
   * da conta só muda na confirmação.
   */
  async requestEmailChange(
    user: User,
    email: string,
    locale: EmailLocale,
    log: TaskLog,
  ): Promise<void> {
    const mailer = this.requireMailer();
    const updated = await this.deps.users.setPendingEmail(user.id, email);
    runLogged(this.runInBackground, log, 'falha ao enviar o código do e-mail novo', async () => {
      const code = await this.deps.codes.issue(user.id, 'email_change');
      if (!code) {
        log.warn({ userId: user.id }, 'limite de e-mails por hora atingido');
        return;
      }
      await mailer.send({ to: email, ...emailChangeCodeEmail(locale, updated.name, code) });
      log.info({ userId: user.id }, 'código do e-mail novo enviado');
    });
  }

  async confirmEmailChange(
    user: User,
    code: string,
    locale: EmailLocale,
    log: TaskLog,
  ): Promise<User> {
    const mailer = this.requireMailer();
    const newEmail = user.pendingEmail;
    if (!newEmail) throw new InvalidConfirmationCodeError();
    if (!(await this.deps.codes.consume(user.id, 'email_change', code))) {
      log.info({ userId: user.id }, 'código do e-mail novo errado');
      throw new InvalidConfirmationCodeError();
    }

    // O dono confirmado de um endereço tem prioridade; um cadastro nunca confirmado, não.
    const other = await this.deps.users.findByEmail(newEmail);
    if (other && other.id !== user.id) {
      if (accountState(other, this.clock()) === 'active') {
        await this.deps.users.setPendingEmail(user.id, null);
        throw new EmailInUseError();
      }
      await this.deps.users.deleteUnconfirmed(other.id);
    }

    const updated = await this.deps.users.applyPendingEmail(user.id);
    log.info({ userId: user.id }, 'e-mail trocado');
    const at = this.clock();
    runLogged(this.runInBackground, log, 'falha ao avisar o e-mail antigo', () =>
      mailer.send({
        to: user.email,
        ...emailChangedNotice(locale, user.name, maskEmail(newEmail), at),
      }),
    );
    return updated;
  }

  private requireMailer(): EmailSender {
    if (!this.deps.mailer) throw new EmailConfirmationUnavailableError();
    return this.deps.mailer;
  }
}

/** Limpeza diária (RB23): apaga as contas pendentes há mais de 7 dias. Devolve quantas apagou. */
export function deleteExpiredPendingAccounts(users: UserRepository, now: Date): Promise<number> {
  return users.deleteUnconfirmedCreatedBefore(
    new Date(now.getTime() - PENDING_ACCOUNT_DAYS * DAY_MS),
  );
}
