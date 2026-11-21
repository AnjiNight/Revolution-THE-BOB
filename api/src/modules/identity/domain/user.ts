import {
  PENDING_ACCOUNT_DAYS,
  type PublicUser,
  type Role,
  type UserProfile,
} from '@simulador/shared';

/** Usuário como o domínio o enxerga. O hash da senha nunca sai do servidor. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** null em conta criada só com Google. */
  passwordHash: string | null;
  /** Identificador da conta Google ligada (DA24), se houver. */
  googleSub: string | null;
  createdAt: Date;
  /** SPEC-039: null enquanto o e-mail do cadastro não foi confirmado (conta pendente). */
  emailConfirmedAt: Date | null;
  /** SPEC-039: e-mail novo de uma troca que ainda espera o código. */
  pendingEmail: string | null;
}

/**
 * Situação da conta (SPEC-039, RB23):
 * - `active`: e-mail confirmado, pode entrar;
 * - `pending`: cadastro com e-mail e senha esperando o código;
 * - `expired`: pendente há mais de 7 dias. Para o app é como se não existisse; a limpeza diária
 *   apaga depois.
 */
export type AccountState = 'active' | 'pending' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

export function accountState(user: User, now: Date): AccountState {
  if (user.emailConfirmedAt) return 'active';
  const age = now.getTime() - user.createdAt.getTime();
  return age > PENDING_ACCOUNT_DAYS * DAY_MS ? 'expired' : 'pending';
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Perfil da própria pessoa (SPEC-003): diz as formas de acesso, nunca o hash nem o `google_sub`. */
export function toUserProfile(user: User): UserProfile {
  return {
    ...toPublicUser(user),
    hasPassword: user.passwordHash !== null,
    hasGoogle: user.googleSub !== null,
    createdAt: user.createdAt.toISOString(),
    pendingEmail: user.pendingEmail,
  };
}
