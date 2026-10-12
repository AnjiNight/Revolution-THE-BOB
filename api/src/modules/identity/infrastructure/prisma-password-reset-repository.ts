import type { PrismaClient, RedefinicaoSenha } from '../../../generated/prisma/client.js';
import type {
  NewPasswordReset,
  PasswordResetRepository,
  StoredPasswordReset,
} from '../application/ports.js';

function toStored(row: RedefinicaoSenha): StoredPasswordReset {
  return {
    id: row.id,
    userId: row.usuarioId,
    codeHash: row.codigoHash,
    attempts: row.tentativas,
    createdAt: row.criadoEm,
    expiresAt: row.expiraEm,
    closedAt: row.encerradoEm,
  };
}

/** Códigos de redefinição de senha (SPEC-004). */
export class PrismaPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(reset: NewPasswordReset, deleteBefore: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.redefinicaoSenha.updateMany({
        where: { usuarioId: reset.userId, encerradoEm: null },
        data: { encerradoEm: reset.createdAt },
      }),
      this.prisma.redefinicaoSenha.deleteMany({
        where: { usuarioId: reset.userId, criadoEm: { lt: deleteBefore } },
      }),
      this.prisma.redefinicaoSenha.create({
        data: {
          usuarioId: reset.userId,
          codigoHash: reset.codeHash,
          criadoEm: reset.createdAt,
          expiraEm: reset.expiresAt,
          encerradoEm: reset.closedAt,
        },
      }),
    ]);
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.redefinicaoSenha.count({
      where: { usuarioId: userId, criadoEm: { gte: since } },
    });
  }

  async findOpen(userId: string, at: Date): Promise<StoredPasswordReset | null> {
    const row = await this.prisma.redefinicaoSenha.findFirst({
      where: { usuarioId: userId, encerradoEm: null, expiraEm: { gt: at } },
      orderBy: { criadoEm: 'desc' },
    });
    return row ? toStored(row) : null;
  }

  async reserveAttempt(id: string, maxAttempts: number): Promise<boolean> {
    // Um único UPDATE com a condição: o banco garante que duas tentativas não pegam a mesma vaga.
    const { count } = await this.prisma.redefinicaoSenha.updateMany({
      where: { id, encerradoEm: null, tentativas: { lt: maxAttempts } },
      data: { tentativas: { increment: 1 } },
    });
    return count === 1;
  }

  async close(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.redefinicaoSenha.updateMany({
      where: { id, encerradoEm: null },
      data: { encerradoEm: at },
    });
    return count === 1;
  }

  async closeAllForUser(userId: string, at: Date): Promise<void> {
    await this.prisma.redefinicaoSenha.updateMany({
      where: { usuarioId: userId, encerradoEm: null },
      data: { encerradoEm: at },
    });
  }
}
