import { randomUUID } from 'node:crypto';
import type { ConsentType } from '@simulador/shared';
import { EmailInUseError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import type {
  BackgroundRunner,
  EmailMessage,
  EmailSender,
  EmailCodePurpose,
  EmailCodeRepository,
  GoogleIdentity,
  GoogleIdentityVerifier,
  NewEmailCode,
  NewRefreshToken,
  NewUser,
  PasswordHasher,
  RefreshTokenRepository,
  StoredConsent,
  StoredEmailCode,
  StoredRefreshToken,
  TaskLog,
  UserRepository,
} from '../application/ports.js';

/** Implementações em memória para testes sem banco. */

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];
  readonly consents: Array<{ userId: string; version: string }> = [];
  readonly consentDates: Date[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async create(user: NewUser): Promise<User> {
    if (this.users.some((u) => u.email === user.email)) throw new EmailInUseError();
    const created: User = {
      id: randomUUID(),
      name: user.name,
      email: user.email,
      role: user.role,
      passwordHash: user.passwordHash,
      googleSub: user.googleSub,
      createdAt: this.clock(),
      emailConfirmedAt: user.emailConfirmedAt,
      pendingEmail: null,
    };
    this.users.push(created);
    if (user.termsVersion) this.pushConsent(created.id, user.termsVersion);
    return { ...created };
  }

  async updateName(userId: string, name: string): Promise<User> {
    return this.update(userId, (user) => (user.name = name));
  }

  async confirmEmail(userId: string, at: Date): Promise<User> {
    return this.update(userId, (user) => (user.emailConfirmedAt = at));
  }

  async setPendingEmail(userId: string, email: string | null): Promise<User> {
    return this.update(userId, (user) => (user.pendingEmail = email));
  }

  async applyPendingEmail(userId: string): Promise<User> {
    const user = this.users.find((u) => u.id === userId);
    const email = user?.pendingEmail;
    if (!user || !email) return this.update(userId, () => undefined);
    if (this.users.some((u) => u.email === email && u.id !== userId)) throw new EmailInUseError();
    return this.update(userId, (u) => {
      u.email = email;
      u.pendingEmail = null;
    });
  }

  async deleteUnconfirmed(userId: string): Promise<boolean> {
    const index = this.users.findIndex((u) => u.id === userId && !u.emailConfirmedAt);
    if (index < 0) return false;
    this.users.splice(index, 1);
    return true;
  }

  async deleteUnconfirmedCreatedBefore(cutoff: Date): Promise<number> {
    const before = this.users.length;
    for (let i = this.users.length - 1; i >= 0; i -= 1) {
      const user = this.users[i]!;
      if (!user.emailConfirmedAt && user.createdAt < cutoff) this.users.splice(i, 1);
    }
    return before - this.users.length;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    return this.update(userId, (user) => (user.passwordHash = passwordHash));
  }

  async listConsents(userId: string): Promise<StoredConsent[]> {
    return this.consents.flatMap((consent, index) =>
      consent.userId === userId
        ? [
            {
              type: 'terms' as const,
              version: consent.version,
              acceptedAt: this.consentDates[index]!,
            },
          ]
        : [],
    );
  }

  async addConsent(userId: string, _type: ConsentType, version: string): Promise<StoredConsent> {
    const acceptedAt = this.pushConsent(userId, version);
    return { type: 'terms', version, acceptedAt };
  }

  private pushConsent(userId: string, version: string): Date {
    const acceptedAt = this.clock();
    this.consents.push({ userId, version });
    this.consentDates.push(acceptedAt);
    return acceptedAt;
  }

  private update(userId: string, change: (user: User) => void): User {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error('usuário inexistente');
    change(user);
    return { ...user };
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = this.users.find((u) => u.email === email);
    return user ? { ...user } : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    const user = this.users.find((u) => u.googleSub === googleSub);
    return user ? { ...user } : null;
  }

  async linkGoogle(userId: string, googleSub: string): Promise<User> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error('usuário inexistente');
    user.googleSub = googleSub;
    return { ...user };
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly tokens: Array<StoredRefreshToken & { tokenHash: string }> = [];

  async create(token: NewRefreshToken): Promise<void> {
    this.tokens.push({
      id: randomUUID(),
      userId: token.userId,
      tokenHash: token.tokenHash,
      family: token.family,
      expiresAt: token.expiresAt,
      revokedAt: null,
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    return token ? { ...token } : null;
  }

  async rotate(currentId: string, next: NewRefreshToken, at: Date): Promise<boolean> {
    const current = this.tokens.find((t) => t.id === currentId);
    if (!current || current.revokedAt) return false;
    current.revokedAt = at;
    await this.create(next);
    return true;
  }

  async revokeFamily(family: string, at: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.family === family && !token.revokedAt) token.revokedAt = at;
    }
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.userId === userId && !token.revokedAt) token.revokedAt = at;
    }
  }
}

/** Hasher rápido e previsível, só para testes. */
export class FakePasswordHasher implements PasswordHasher {
  dummyCalls = 0;

  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return hash === `hash:${password}`;
  }

  async verifyDummy(): Promise<void> {
    this.dummyCalls += 1;
  }
}

/** Verificador do Google que aceita tokens no formato "google:<sub>:<email>[:nao-verificado]". */
export class FakeGoogleVerifier implements GoogleIdentityVerifier {
  async verify(idToken: string): Promise<GoogleIdentity | null> {
    const [prefix, sub, email, flag] = idToken.split(':');
    if (prefix !== 'google' || !sub || !email) return null;
    return { sub, email, emailVerified: flag !== 'nao-verificado', name: 'Pessoa Google' };
  }
}

export class InMemoryEmailCodeRepository implements EmailCodeRepository {
  readonly codes: StoredEmailCode[] = [];

  async create(code: NewEmailCode, deleteBefore: Date): Promise<void> {
    for (const old of this.codes) {
      if (old.userId === code.userId && old.purpose === code.purpose && !old.closedAt) {
        old.closedAt = code.createdAt;
      }
    }
    for (let i = this.codes.length - 1; i >= 0; i -= 1) {
      const old = this.codes[i]!;
      if (old.userId === code.userId && old.createdAt < deleteBefore) this.codes.splice(i, 1);
    }
    this.codes.push({ id: randomUUID(), attempts: 0, ...code });
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return this.codes.filter((c) => c.userId === userId && c.createdAt >= since).length;
  }

  async findOpen(
    userId: string,
    purpose: EmailCodePurpose,
    at: Date,
  ): Promise<StoredEmailCode | null> {
    const open = this.codes
      .filter(
        (c) => c.userId === userId && c.purpose === purpose && !c.closedAt && c.expiresAt > at,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return open[0] ? { ...open[0] } : null;
  }

  async reserveAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const code = this.codes.find((c) => c.id === id);
    if (!code || code.closedAt || code.attempts >= maxAttempts) return false;
    code.attempts += 1;
    return true;
  }

  async close(id: string, at: Date): Promise<boolean> {
    const code = this.codes.find((c) => c.id === id);
    if (!code || code.closedAt) return false;
    code.closedAt = at;
    return true;
  }

  async closeAllForUser(userId: string, at: Date): Promise<void> {
    for (const code of this.codes) {
      if (code.userId === userId && !code.closedAt) code.closedAt = at;
    }
  }
}

/** Guarda os e-mails "enviados". `delayMs` simula um servidor SMTP lento; `failWith`, um erro. */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  delayMs = 0;
  failWith: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }

  /**
   * Código do último e-mail enviado (ou do último enviado para `to`), já sem o hífen, como o app
   * envia depois de normalizar.
   */
  lastCode(to?: string): string {
    const message = to ? this.sent.findLast((m) => m.to === to) : this.sent.at(-1);
    const text = message?.text ?? '';
    const match = /\b([0-9A-Z]{4})-([0-9A-Z]{4})\b/.exec(text);
    if (!match) throw new Error('nenhum código no último e-mail');
    return `${match[1]}${match[2]}`;
  }
}

/** Executa as tarefas em segundo plano e deixa o teste esperar por todas (`settle`). */
export class BackgroundTasks {
  private readonly pending: Array<Promise<void>> = [];

  readonly run: BackgroundRunner = (task) => {
    this.pending.push(task());
  };

  async settle(): Promise<void> {
    while (this.pending.length > 0) await this.pending.shift();
  }
}

/** Log em memória para conferir que nenhum dado pessoal aparece (DA13). */
export class MemoryLog implements TaskLog {
  readonly entries: Array<{ level: string; details: object; message: string }> = [];

  info(details: object, message: string): void {
    this.entries.push({ level: 'info', details, message });
  }

  warn(details: object, message: string): void {
    this.entries.push({ level: 'warn', details, message });
  }

  error(details: object, message: string): void {
    this.entries.push({ level: 'error', details, message });
  }

  get text(): string {
    return JSON.stringify(this.entries);
  }
}
