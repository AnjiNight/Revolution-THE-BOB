import type { Role } from '@simulador/shared';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { PerfilAcesso, Usuario } from '../../../generated/prisma/client.js';
import { EmailInUseError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import type { NewUser, UserRepository } from '../application/ports.js';

const ROLE_TO_PERFIL: Record<Role, PerfilAcesso> = { user: 'usuario', collaborator: 'colaborador' };
const PERFIL_TO_ROLE: Record<PerfilAcesso, Role> = { usuario: 'user', colaborador: 'collaborator' };

function toUser(row: Usuario): User {
  return {
    id: row.id,
    name: row.nome,
    email: row.email,
    role: PERFIL_TO_ROLE[row.perfil],
    passwordHash: row.senhaHash,
    googleSub: row.googleSub,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(user: NewUser): Promise<User> {
    try {
      const row = await this.prisma.usuario.create({
        data: {
          nome: user.name,
          email: user.email,
          perfil: ROLE_TO_PERFIL[user.role],
          senhaHash: user.passwordHash,
          googleSub: user.googleSub,
          ...(user.termsVersion
            ? {
                consentimentos: {
                  create: { tipo: 'termos_uso_privacidade', versao: user.termsVersion },
                },
              }
            : {}),
        },
      });
      return toUser(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailInUseError();
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.usuario.findUnique({ where: { email } });
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.usuario.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    const row = await this.prisma.usuario.findUnique({ where: { googleSub } });
    return row ? toUser(row) : null;
  }

  async linkGoogle(userId: string, googleSub: string): Promise<User> {
    const row = await this.prisma.usuario.update({ where: { id: userId }, data: { googleSub } });
    return toUser(row);
  }
}
