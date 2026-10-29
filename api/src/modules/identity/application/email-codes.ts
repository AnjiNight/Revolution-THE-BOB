import { EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_TTL_MINUTES } from '@simulador/shared';
import { generateEmailCode, type EmailCodeHasher } from './email-code.js';
import type { Clock, EmailCodePurpose, EmailCodeRepository } from './ports.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** E-mails com código por conta em uma hora, somando todas as finalidades (SPEC-004, SPEC-039). */
export const EMAIL_CODES_PER_HOUR = 5;

/** Códigos com mais de um dia são apagados no próximo pedido da mesma conta. */
const RETENTION_MS = 24 * HOUR_MS;

export interface EmailCodesDeps {
  repository: EmailCodeRepository;
  hasher: EmailCodeHasher;
  clock?: Clock;
  generateCode?: () => string;
}

/**
 * Códigos enviados por e-mail: geração com limite por hora e conferência com tentativa reservada
 * antes da comparação. Usado pela redefinição de senha (SPEC-004) e pela confirmação de e-mail
 * (SPEC-039).
 */
export class EmailCodes {
  private readonly clock: Clock;
  private readonly generateCode: () => string;

  constructor(private readonly deps: EmailCodesDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.generateCode = deps.generateCode ?? generateEmailCode;
  }

  /**
   * Gera e grava um código novo (o anterior da mesma finalidade deixa de valer). Devolve null se a
   * conta já recebeu o máximo de e-mails na última hora: nesse caso nada deve ser enviado.
   * `closed`: o pedido só conta para o limite (ex.: conta só Google, que não tem senha).
   */
  async issue(
    userId: string,
    purpose: EmailCodePurpose,
    options: { closed?: boolean } = {},
  ): Promise<string | null> {
    const now = this.clock();
    const recent = await this.deps.repository.countSince(userId, new Date(now.getTime() - HOUR_MS));
    if (recent >= EMAIL_CODES_PER_HOUR) return null;

    const code = this.generateCode();
    await this.deps.repository.create(
      {
        userId,
        purpose,
        codeHash: this.deps.hasher.hash(code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MINUTES * MINUTE_MS),
        closedAt: options.closed ? now : null,
      },
      new Date(now.getTime() - RETENTION_MS),
    );
    return code;
  }

  /**
   * Confere o código (já normalizado). Devolve true quando está certo; nesse caso ele é encerrado
   * (uso único). A tentativa é reservada antes da comparação: nem pedidos simultâneos passam do
   * limite, e depois da 5ª tentativa errada nem o código certo vale.
   */
  async consume(userId: string, purpose: EmailCodePurpose, code: string): Promise<boolean> {
    const now = this.clock();
    const stored = await this.deps.repository.findOpen(userId, purpose, now);
    if (!stored) return false;
    if (!(await this.deps.repository.reserveAttempt(stored.id, EMAIL_CODE_MAX_ATTEMPTS))) {
      return false;
    }
    if (!this.deps.hasher.matches(stored.codeHash, code)) {
      if (stored.attempts + 1 >= EMAIL_CODE_MAX_ATTEMPTS) {
        await this.deps.repository.close(stored.id, now);
      }
      return false;
    }
    // Uso único: se outro pedido usou o código no mesmo instante, este perde.
    return this.deps.repository.close(stored.id, now);
  }

  closeAllForUser(userId: string): Promise<void> {
    return this.deps.repository.closeAllForUser(userId, this.clock());
  }
}
