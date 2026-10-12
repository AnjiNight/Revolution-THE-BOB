import type { ConsentType, Role } from '@simulador/shared';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  Consentimento,
  PerfilAcesso,
  TipoConsentimento,
  Usuario,
} from '../../../generated/prisma/client.js';
import { EmailInUseError } from '../domain/errors.js';
import type { User } from '../domain/user.js';
import type { NewUser, StoredConsent, UserRepository } from '../application/ports.js';

const ROLE_TO_PERFIL: Record<Role, PerfilAcesso> = { user: 'usuario', collaborator: 'colaborador' };
const PERFIL_TO_ROLE: Record<PerfilAcesso, Role> = { usuario: 'user', colaborador: 'collaborator' };
const CONSENT_TO_TIPO: Record<ConsentType, TipoConsentimento> = {
  terms: 'termos_uso_privacidade',
};
const TIPO_TO_CONSENT: Record<TipoConsentimento, ConsentType> = {
  termos_uso_privacidade: 'terms',
};

function toUser(row: Usuario): User {
  return {
    id: row.id,
    name: row.nome,
    email: row.email,
    role: PERFIL_TO_ROLE[row.perfil],
    passwordHash: row.senhaHash,
    googleSub: row.googleSub,
    createdAt: row.criadoEm,
    emailConfirmedAt: row.emailConfirmadoEm,
    pendingEmail: row.emailPendente,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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
          emailConfirmadoEm: user.emailConfirmedAt,
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

  async updateName(userId: string, name: string): Promise<User> {
    const row = await this.prisma.usuario.update({ where: { id: userId }, data: { nome: name } });
    return toUser(row);
  }

  async confirmEmail(userId: string, at: Date): Promise<User> {
    const row = await this.prisma.usuario.update({
      where: { id: userId },
      data: { emailConfirmadoEm: at },
    });
    return toUser(row);
  }

  async setPendingEmail(userId: string, email: string | null): Promise<User> {
    const row = await this.prisma.usuario.update({
      where: { id: userId },
      data: { emailPendente: email },
    });
    return toUser(row);
  }

  async applyPendingEmail(userId: string): Promise<User> {
    const current = await this.prisma.usuario.findUniqueOrThrow({ where: { id: userId } });
    if (!current.emailPendente) return toUser(current);
    try {
      const row = await this.prisma.usuario.update({
        where: { id: userId },
        data: { email: current.emailPendente, emailPendente: null },
      });
      return toUser(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseError();
      throw error;
    }
  }

  async deleteUnconfirmed(userId: string): Promise<boolean> {
    // A condição no próprio DELETE garante que uma conta confirmada nunca é apagada aqui.
    const { count } = await this.prisma.usuario.deleteMany({
      where: { id: userId, emailConfirmadoEm: null },
    });
    return count === 1;
  }

  async deleteUnconfirmedCreatedBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.usuario.deleteMany({
      where: { emailConfirmadoEm: null, criadoEm: { lt: cutoff } },
    });
    return count;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    const row = await this.prisma.usuario.update({
      where: { id: userId },
      data: { senhaHash: passwordHash },
    });
    return toUser(row);
  }

  async listConsents(userId: string): Promise<StoredConsent[]> {
    const rows = await this.prisma.consentimento.findMany({
      where: { usuarioId: userId },
      orderBy: { aceitoEm: 'asc' },
    });
    return rows.map(toConsent);
  }

  async addConsent(userId: string, type: ConsentType, version: string): Promise<StoredConsent> {
    const row = await this.prisma.consentimento.create({
      data: { usuarioId: userId, tipo: CONSENT_TO_TIPO[type], versao: version },
    });
    return toConsent(row);
  }
}

function toConsent(row: Consentimento): StoredConsent {
  return { type: TIPO_TO_CONSENT[row.tipo], version: row.versao, acceptedAt: row.aceitoEm };
}
