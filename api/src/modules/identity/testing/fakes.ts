import { randomUUID } from 'node:crypto';
import { EmailInUseError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import type {
  GoogleIdentity,
  GoogleIdentityVerifier,
  NewRefreshToken,
  NewUser,
  PasswordHasher,
  RefreshTokenRepository,
  StoredRefreshToken,
  UserRepository,
} from '../application/ports.js';

/** Implementações em memória para testes sem banco. */

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];
  readonly consents: Array<{ userId: string; version: string }> = [];

  async create(user: NewUser): Promise<User> {
    if (this.users.some((u) => u.email === user.email)) throw new EmailInUseError();
    const created: User = {
      id: randomUUID(),
      name: user.name,
      email: user.email,
      role: user.role,
      passwordHash: user.passwordHash,
      googleSub: user.googleSub,
    };
    this.users.push(created);
    if (user.termsVersion) this.consents.push({ userId: created.id, version: user.termsVersion });
    return { ...created };
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
