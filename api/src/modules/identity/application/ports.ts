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
  /** SPEC-039: null para cadastro com e-mail e senha (conta pendente); Google e colaborador, a data. */
  emailConfirmedAt: Date | null;
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
  updatePasswordHash(userId: string, passwordHash: string): Promise<User>;
  /** SPEC-039: libera a conta pendente. */
  confirmEmail(userId: string, at: Date): Promise<User>;
  /** SPEC-039: guarda (ou limpa, com null) o e-mail novo que espera o código. */
  setPendingEmail(userId: string, email: string | null): Promise<User>;
  /** SPEC-039: o e-mail pendente passa a ser o e-mail da conta. Lança EmailInUseError (RB01). */
  applyPendingEmail(userId: string): Promise<User>;
  /** Apaga a conta só se ela ainda não foi confirmada; devolve se apagou. */
  deleteUnconfirmed(userId: string): Promise<boolean>;
  /** Limpeza diária (RB23): apaga as contas não confirmadas criadas antes de `cutoff`. */
  deleteUnconfirmedCreatedBefore(cutoff: Date): Promise<number>;
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

/** Para que serve um código enviado por e-mail (SPEC-004 e SPEC-039). */
export type EmailCodePurpose = 'password_reset' | 'signup' | 'email_change';

/** Código enviado por e-mail, como fica guardado: só o HMAC, nunca o código. */
export interface StoredEmailCode {
  id: string;
  userId: string;
  purpose: EmailCodePurpose;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
}

export interface NewEmailCode {
  userId: string;
  purpose: EmailCodePurpose;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Preenchido quando o pedido só conta para o limite (conta só Google): nasce encerrado. */
  closedAt: Date | null;
}

export interface EmailCodeRepository {
  /**
   * Na mesma transação: encerra os códigos abertos da conta com a mesma finalidade, apaga os
   * criados antes de `deleteBefore` e grava o novo. Assim só o código mais recente vale.
   */
  create(code: NewEmailCode, deleteBefore: Date): Promise<void>;
  /** Quantos códigos a conta pediu desde `since`, de qualquer finalidade (limite por hora). */
  countSince(userId: string, since: Date): Promise<number>;
  /** Código mais recente da conta, com essa finalidade, que ainda vale em `at`. */
  findOpen(userId: string, purpose: EmailCodePurpose, at: Date): Promise<StoredEmailCode | null>;
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

/** Envio de e-mail (SPEC-004, SPEC-039). A implementação real usa SMTP. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Log usado pelas tarefas em segundo plano; o logger da requisição atende. */
export interface TaskLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

/** Para quem chama os serviços fora de uma requisição (testes, scripts): não registra nada. */
export const SILENT_LOG: TaskLog = { info: () => {}, warn: () => {}, error: () => {} };

/** Executa uma tarefa depois de a resposta sair. Nos testes, é substituído para esperar o fim. */
export type BackgroundRunner = (task: () => Promise<void>) => void;

/** Padrão: roda logo depois do turno atual, sem segurar a resposta. */
export const runAfterResponse: BackgroundRunner = (task) => {
  setImmediate(() => void task());
};
