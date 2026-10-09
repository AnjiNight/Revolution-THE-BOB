import { randomBytes } from 'node:crypto';
import {
  normalizeEmail,
  registerSchema,
  validate,
  type FieldErrors,
  type PublicUser,
} from '@simulador/shared';
import { toPublicUser } from '../domain/user.js';
import type { PasswordHasher, UserRepository } from './ports.js';

export type CreateCollaboratorResult =
  { ok: true; user: PublicUser; password: string } | { ok: false; fields: FieldErrors };

/** Senha forte gerada pelo sistema: 18 bytes aleatórios (144 bits), em base64url. */
export function generateCollaboratorPassword(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * SPEC-002 §4: contas de colaborador só são criadas pela equipe, por comando no servidor.
 * A senha é gerada pelo sistema e mostrada uma única vez, para ser entregue ao colaborador.
 */
export async function createCollaborator(
  users: UserRepository,
  hasher: PasswordHasher,
  input: { name: string; email: string },
  generatePassword: () => string = generateCollaboratorPassword,
): Promise<CreateCollaboratorResult> {
  const password = generatePassword();
  const checked = validate(registerSchema, { ...input, password, acceptedTerms: true });
  if (!checked.success) return { ok: false, fields: checked.fields };

  const user = await users.create({
    name: checked.data.name,
    email: normalizeEmail(checked.data.email),
    role: 'collaborator',
    passwordHash: await hasher.hash(password),
    googleSub: null,
    termsVersion: null,
  });
  return { ok: true, user: toPublicUser(user), password };
}
