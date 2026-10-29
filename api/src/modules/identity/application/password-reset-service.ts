import type { PasswordResetConfirm, PasswordResetRequest } from '@simulador/shared';
import { InvalidResetCodeError, PasswordResetUnavailableError } from '../domain/errors.js';
import { accountState } from '../domain/user.js';
import { runLogged } from './background.js';
import type { EmailCodes } from './email-codes.js';
import { googleOnlyEmail, passwordChangedEmail, resetCodeEmail } from './password-reset-emails.js';
import {
  runAfterResponse,
  type BackgroundRunner,
  type Clock,
  type EmailSender,
  type PasswordHasher,
  type RefreshTokenRepository,
  type TaskLog,
  type UserRepository,
} from './ports.js';

export interface PasswordResetServiceDeps {
  users: UserRepository;
  codes: EmailCodes;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  /** Ausente quando o SMTP não está configurado: a recuperação de senha fica desligada. */
  mailer?: EmailSender;
  clock?: Clock;
  runInBackground?: BackgroundRunner;
}

/** Recuperação de senha por e-mail (SPEC-004, RF03). */
export class PasswordResetService {
  private readonly clock: Clock;
  private readonly runInBackground: BackgroundRunner;

  constructor(private readonly deps: PasswordResetServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.runInBackground = deps.runInBackground ?? runAfterResponse;
  }

  get enabled(): boolean {
    return this.deps.mailer !== undefined;
  }

  /** Lança PasswordResetUnavailableError quando o SMTP não está configurado. */
  assertEnabled(): void {
    this.requireMailer();
  }

  /**
   * Responde na hora, sem dizer nada sobre a conta: a consulta ao banco e o envio acontecem
   * depois, então nem a resposta nem o tempo dela revelam quem tem conta (CA02, CA03).
   */
  async request(input: PasswordResetRequest, log: TaskLog): Promise<void> {
    const mailer = this.requireMailer();
    runLogged(
      this.runInBackground,
      log,
      'falha ao processar o pedido de redefinição de senha',
      () => this.sendCode(mailer, input, log),
    );
  }

  /**
   * Troca a senha com o código recebido. Encerra todas as sessões e todos os códigos da conta.
   * Não abre sessão: a pessoa entra pela própria porta (SPEC-002), com a senha nova.
   */
  async confirm(input: PasswordResetConfirm, log: TaskLog): Promise<void> {
    const mailer = this.requireMailer();
    const now = this.clock();
    const user = await this.deps.users.findByEmail(input.email);
    // Conta pendente (SPEC-039) é tratada como inexistente: primeiro ela precisa ser confirmada.
    if (!user?.passwordHash || accountState(user, now) !== 'active') {
      throw new InvalidResetCodeError();
    }
    if (!(await this.deps.codes.consume(user.id, 'password_reset', input.code))) {
      log.info({ userId: user.id }, 'código de redefinição errado');
      throw new InvalidResetCodeError();
    }

    await this.deps.users.updatePasswordHash(
      user.id,
      await this.deps.hasher.hash(input.newPassword),
    );
    await this.deps.refreshTokens.revokeAllForUser(user.id, now);
    await this.deps.codes.closeAllForUser(user.id);
    log.info({ userId: user.id }, 'senha redefinida');

    runLogged(this.runInBackground, log, 'falha ao enviar o aviso de senha redefinida', () =>
      mailer.send({ to: user.email, ...passwordChangedEmail(input.locale, user.name, now) }),
    );
  }

  private async sendCode(
    mailer: EmailSender,
    { email, locale }: PasswordResetRequest,
    log: TaskLog,
  ): Promise<void> {
    const user = await this.deps.users.findByEmail(email);
    if (!user || accountState(user, this.clock()) !== 'active') {
      log.info({}, 'pedido de redefinição para e-mail sem conta');
      return;
    }

    // Conta só Google também registra o pedido, já encerrado: assim ele conta no limite por hora.
    const googleOnly = user.passwordHash === null;
    const code = await this.deps.codes.issue(user.id, 'password_reset', { closed: googleOnly });
    if (!code) {
      log.warn({ userId: user.id }, 'limite de e-mails por hora atingido');
      return;
    }

    const draft = googleOnly
      ? googleOnlyEmail(locale, user.name)
      : resetCodeEmail(locale, user.name, code);
    await mailer.send({ to: user.email, ...draft });
    log.info(
      { userId: user.id },
      googleOnly ? 'aviso de conta Google enviado' : 'código de redefinição enviado',
    );
  }

  private requireMailer(): EmailSender {
    if (!this.deps.mailer) throw new PasswordResetUnavailableError();
    return this.deps.mailer;
  }
}
