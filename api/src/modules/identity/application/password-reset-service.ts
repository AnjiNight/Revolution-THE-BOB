import {
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_TTL_MINUTES,
  type PasswordResetConfirm,
  type PasswordResetRequest,
} from '@simulador/shared';
import { InvalidResetCodeError, PasswordResetUnavailableError } from '../domain/errors.js';
import { googleOnlyEmail, passwordChangedEmail, resetCodeEmail } from './password-reset-emails.js';
import type {
  BackgroundRunner,
  Clock,
  EmailSender,
  PasswordHasher,
  PasswordResetRepository,
  RefreshTokenRepository,
  TaskLog,
  UserRepository,
} from './ports.js';
import { generateResetCode, type ResetCodeHasher } from './reset-code.js';

export interface PasswordResetServiceDeps {
  users: UserRepository;
  resets: PasswordResetRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  codes: ResetCodeHasher;
  /** Ausente quando o SMTP não está configurado: a recuperação de senha fica desligada. */
  mailer?: EmailSender;
  clock?: Clock;
  runInBackground?: BackgroundRunner;
  generateCode?: () => string;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** E-mails por conta em uma hora (SPEC-004 §4); pedidos além disso não enviam nada. */
export const RESET_REQUESTS_PER_HOUR = 5;

/** Códigos com mais de um dia são apagados no próximo pedido da mesma conta. */
const RETENTION_MS = 24 * HOUR_MS;

const runAfterResponse: BackgroundRunner = (task) => {
  setImmediate(() => void task());
};

/** Recuperação de senha por e-mail (SPEC-004, RF03). */
export class PasswordResetService {
  private readonly clock: Clock;
  private readonly runInBackground: BackgroundRunner;
  private readonly generateCode: () => string;

  constructor(private readonly deps: PasswordResetServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.runInBackground = deps.runInBackground ?? runAfterResponse;
    this.generateCode = deps.generateCode ?? generateResetCode;
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
    this.background(log, 'falha ao processar o pedido de redefinição de senha', () =>
      this.sendCode(mailer, input, log),
    );
  }

  /**
   * Troca a senha com o código recebido. Encerra todas as sessões e todos os códigos da conta.
   * Não abre sessão: a pessoa entra pela própria porta (SPEC-002), com a senha nova.
   */
  async confirm(input: PasswordResetConfirm, log: TaskLog): Promise<void> {
    const mailer = this.requireMailer();
    const user = await this.deps.users.findByEmail(input.email);
    if (!user?.passwordHash) throw new InvalidResetCodeError();

    const now = this.clock();
    const reset = await this.deps.resets.findOpen(user.id, now);
    // A tentativa é reservada antes da comparação: nem pedidos simultâneos passam do limite.
    if (!reset || !(await this.deps.resets.reserveAttempt(reset.id, RESET_CODE_MAX_ATTEMPTS))) {
      throw new InvalidResetCodeError();
    }
    if (!this.deps.codes.matches(reset.codeHash, input.code)) {
      if (reset.attempts + 1 >= RESET_CODE_MAX_ATTEMPTS)
        await this.deps.resets.close(reset.id, now);
      log.info({ userId: user.id }, 'código de redefinição errado');
      throw new InvalidResetCodeError();
    }
    // Uso único: se outro pedido usou o código no mesmo instante, este perde.
    if (!(await this.deps.resets.close(reset.id, now))) throw new InvalidResetCodeError();

    await this.deps.users.updatePasswordHash(
      user.id,
      await this.deps.hasher.hash(input.newPassword),
    );
    await this.deps.refreshTokens.revokeAllForUser(user.id, now);
    await this.deps.resets.closeAllForUser(user.id, now);
    log.info({ userId: user.id }, 'senha redefinida');

    this.background(log, 'falha ao enviar o aviso de senha redefinida', () =>
      mailer.send({ to: user.email, ...passwordChangedEmail(input.locale, user.name, now) }),
    );
  }

  private async sendCode(
    mailer: EmailSender,
    { email, locale }: PasswordResetRequest,
    log: TaskLog,
  ): Promise<void> {
    const user = await this.deps.users.findByEmail(email);
    if (!user) {
      log.info({}, 'pedido de redefinição para e-mail sem conta');
      return;
    }

    const now = this.clock();
    const recent = await this.deps.resets.countSince(user.id, new Date(now.getTime() - HOUR_MS));
    if (recent >= RESET_REQUESTS_PER_HOUR) {
      log.warn({ userId: user.id }, 'limite de pedidos de redefinição por hora atingido');
      return;
    }

    // Conta só Google também registra o pedido, já encerrado: assim ele conta no limite por hora.
    const googleOnly = user.passwordHash === null;
    const code = this.generateCode();
    await this.deps.resets.create(
      {
        userId: user.id,
        codeHash: this.deps.codes.hash(code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MINUTES * MINUTE_MS),
        closedAt: googleOnly ? now : null,
      },
      new Date(now.getTime() - RETENTION_MS),
    );

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

  private background(log: TaskLog, failure: string, task: () => Promise<void>): void {
    this.runInBackground(async () => {
      try {
        await task();
      } catch (error) {
        log.error({ errorType: errorType(error) }, failure);
      }
    });
  }
}

/** Só o tipo do erro: a mensagem de um servidor SMTP pode citar o e-mail do destinatário (DA13). */
function errorType(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.name : 'unknown';
}
