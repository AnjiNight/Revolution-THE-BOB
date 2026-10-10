import type { PublicUser, Role, UserProfile } from '@simulador/shared';

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
  };
}
