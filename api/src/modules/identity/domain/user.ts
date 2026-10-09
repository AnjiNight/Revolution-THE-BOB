import type { PublicUser, Role } from '@simulador/shared';

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
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
