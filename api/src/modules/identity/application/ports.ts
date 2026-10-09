import type { Role } from '@simulador/shared';
import type { User } from '../domain/user.js';

/** Portas implementadas pela infraestrutura (DA02). */

export interface NewUser {
  name: string;
  email: string;
  role: Role;
  passwordHash: string | null;
  googleSub: string | null;
  /** Versão dos termos aceitos (RNF11). Contas de colaborador, criadas pela equipe, não têm. */
  termsVersion: string | null;
}

export interface UserRepository {
  /** Cria a conta e, se houver, registra o consentimento. Lança EmailInUseError se o e-mail já existir. */
  create(user: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  /** Liga uma conta Google a uma conta existente (mesmo e-mail verificado). */
  linkGoogle(userId: string, googleSub: string): Promise<User>;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /**
   * Na mesma transação: revoga o token atual (se ainda estiver ativo) e grava o próximo.
   * Devolve false se o token atual já tinha sido revogado — sinal de reuso.
   */
  rotate(currentId: string, next: NewRefreshToken, at: Date): Promise<boolean>;
  revokeFamily(family: string, at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /** Executa uma verificação "falsa" para igualar o tempo de resposta quando o e-mail não existe. */
  verifyDummy(password: string): Promise<void>;
}

export interface AccessTokenClaims {
  userId: string;
  role: Role;
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims): string;
  /** Devolve null para token inválido, adulterado ou expirado. */
  verify(token: string): AccessTokenClaims | null;
}

/** Identidade confirmada pelo Google a partir do ID token (DA24). */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleIdentityVerifier {
  /** Devolve null para token inválido, expirado ou emitido para outro app. */
  verify(idToken: string): Promise<GoogleIdentity | null>;
}

export type Clock = () => Date;
