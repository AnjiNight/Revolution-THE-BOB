import type { ConsentType, Role } from '@simulador/shared';
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
  updateName(userId: string, name: string): Promise<User>;
  /** Lança EmailInUseError se o e-mail já pertencer a outra conta (RB01). */
  updateEmail(userId: string, email: string): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<User>;
  /** Histórico de consentimentos, do mais antigo ao mais recente. */
  listConsents(userId: string): Promise<StoredConsent[]>;
  addConsent(userId: string, type: ConsentType, version: string): Promise<StoredConsent>;
}

export interface StoredConsent {
  type: ConsentType;
  version: string;
  acceptedAt: Date;
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
  /** Encerra todas as sessões da conta (troca de senha, SPEC-003). */
  revokeAllForUser(userId: string, at: Date): Promise<void>;
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

/** Código de redefinição de senha guardado (SPEC-004). Só o HMAC do código, nunca o código. */
export interface StoredPasswordReset {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
}

export interface NewPasswordReset {
  userId: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Preenchido quando o pedido só conta para o limite (conta só Google): nasce encerrado. */
  closedAt: Date | null;
}

export interface PasswordResetRepository {
  /**
   * Na mesma transação: encerra os códigos abertos da conta, apaga os criados antes de
   * `deleteBefore` e grava o novo. Assim só o código mais recente vale.
   */
  create(reset: NewPasswordReset, deleteBefore: Date): Promise<void>;
  /** Quantos códigos a conta pediu desde `since` (limite por hora). */
  countSince(userId: string, since: Date): Promise<number>;
  /** Código mais recente da conta que ainda vale em `at`. */
  findOpen(userId: string, at: Date): Promise<StoredPasswordReset | null>;
  /**
   * Reserva uma tentativa antes de comparar o código: só conta se o código ainda estiver aberto e
   * abaixo do limite. Devolve false quando não há tentativa disponível. Em atualização atômica,
   * pedidos simultâneos nunca passam do limite.
   */
  reserveAttempt(id: string, maxAttempts: number): Promise<boolean>;
  /** Encerra um código; devolve false se ele já estava encerrado (uso único). */
  close(id: string, at: Date): Promise<boolean>;
  closeAllForUser(userId: string, at: Date): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Envio de e-mail (SPEC-004). A implementação real usa SMTP. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Log usado pelas tarefas em segundo plano; o logger da requisição atende. */
export interface TaskLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

/** Executa uma tarefa depois de a resposta sair. Nos testes, é substituído para esperar o fim. */
export type BackgroundRunner = (task: () => Promise<void>) => void;
