import { randomUUID } from 'node:crypto';
import type { ConsentType } from '@simulador/shared';
import { EmailInUseError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import type {
  BackgroundRunner,
  EmailMessage,
  EmailSender,
  GoogleIdentity,
  GoogleIdentityVerifier,
  NewPasswordReset,
  NewRefreshToken,
  NewUser,
  PasswordHasher,
  PasswordResetRepository,
  RefreshTokenRepository,
  StoredConsent,
  StoredPasswordReset,
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
    };
    this.users.push(created);
    if (user.termsVersion) this.pushConsent(created.id, user.termsVersion);
    return { ...created };
  }

  async updateName(userId: string, name: string): Promise<User> {
    return this.update(userId, (user) => (user.name = name));
  }

  async updateEmail(userId: string, email: string): Promise<User> {
    if (this.users.some((u) => u.email === email && u.id !== userId)) throw new EmailInUseError();
    return this.update(userId, (user) => (user.email = email));
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

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  readonly resets: StoredPasswordReset[] = [];

  async create(reset: NewPasswordReset, deleteBefore: Date): Promise<void> {
    await this.closeAllForUser(reset.userId, reset.createdAt);
    for (let i = this.resets.length - 1; i >= 0; i -= 1) {
      const old = this.resets[i]!;
      if (old.userId === reset.userId && old.createdAt < deleteBefore) this.resets.splice(i, 1);
    }
    this.resets.push({ id: randomUUID(), attempts: 0, ...reset });
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return this.resets.filter((r) => r.userId === userId && r.createdAt >= since).length;
  }

  async findOpen(userId: string, at: Date): Promise<StoredPasswordReset | null> {
    const open = this.resets
      .filter((r) => r.userId === userId && !r.closedAt && r.expiresAt > at)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return open[0] ? { ...open[0] } : null;
  }

  async reserveAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const reset = this.resets.find((r) => r.id === id);
    if (!reset || reset.closedAt || reset.attempts >= maxAttempts) return false;
    reset.attempts += 1;
    return true;
  }

  async close(id: string, at: Date): Promise<boolean> {
    const reset = this.resets.find((r) => r.id === id);
    if (!reset || reset.closedAt) return false;
    reset.closedAt = at;
    return true;
  }

  async closeAllForUser(userId: string, at: Date): Promise<void> {
    for (const reset of this.resets) {
      if (reset.userId === userId && !reset.closedAt) reset.closedAt = at;
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

  /** Código do último e-mail enviado, já sem o hífen, como o app envia depois de normalizar. */
  lastCode(): string {
    const text = this.sent.at(-1)?.text ?? '';
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
