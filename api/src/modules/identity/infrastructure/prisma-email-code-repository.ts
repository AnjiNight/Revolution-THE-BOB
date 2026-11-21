import type {
  CodigoEmail,
  FinalidadeCodigo,
  PrismaClient,
} from '../../../generated/prisma/client.js';
import type {
  EmailCodePurpose,
  EmailCodeRepository,
  NewEmailCode,
  StoredEmailCode,
} from '../application/ports.js';

const PURPOSE_TO_FINALIDADE: Record<EmailCodePurpose, FinalidadeCodigo> = {
  password_reset: 'redefinir_senha',
  signup: 'confirmar_cadastro',
  email_change: 'trocar_email',
  account_deletion: 'excluir_conta',
};
const FINALIDADE_TO_PURPOSE: Record<FinalidadeCodigo, EmailCodePurpose> = {
  redefinir_senha: 'password_reset',
  confirmar_cadastro: 'signup',
  trocar_email: 'email_change',
  excluir_conta: 'account_deletion',
};

function toStored(row: CodigoEmail): StoredEmailCode {
  return {
    id: row.id,
    userId: row.usuarioId,
    purpose: FINALIDADE_TO_PURPOSE[row.finalidade],
    codeHash: row.codigoHash,
    attempts: row.tentativas,
    createdAt: row.criadoEm,
    expiresAt: row.expiraEm,
    closedAt: row.encerradoEm,
  };
}

/** Códigos enviados por e-mail: redefinição de senha (SPEC-004), confirmação (SPEC-039) e exclusão (SPEC-034). */
export class PrismaEmailCodeRepository implements EmailCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(code: NewEmailCode, deleteBefore: Date): Promise<void> {
    const finalidade = PURPOSE_TO_FINALIDADE[code.purpose];
    await this.prisma.$transaction([
      this.prisma.codigoEmail.updateMany({
        where: { usuarioId: code.userId, finalidade, encerradoEm: null },
        data: { encerradoEm: code.createdAt },
      }),
      this.prisma.codigoEmail.deleteMany({
        where: { usuarioId: code.userId, criadoEm: { lt: deleteBefore } },
      }),
      this.prisma.codigoEmail.create({
        data: {
          usuarioId: code.userId,
          finalidade,
          codigoHash: code.codeHash,
          criadoEm: code.createdAt,
          expiraEm: code.expiresAt,
          encerradoEm: code.closedAt,
        },
      }),
    ]);
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.codigoEmail.count({
      where: { usuarioId: userId, criadoEm: { gte: since } },
    });
  }

  async findOpen(
    userId: string,
    purpose: EmailCodePurpose,
    at: Date,
  ): Promise<StoredEmailCode | null> {
    const row = await this.prisma.codigoEmail.findFirst({
      where: {
        usuarioId: userId,
        finalidade: PURPOSE_TO_FINALIDADE[purpose],
        encerradoEm: null,
        expiraEm: { gt: at },
      },
      orderBy: { criadoEm: 'desc' },
    });
    return row ? toStored(row) : null;
  }

  async reserveAttempt(id: string, maxAttempts: number): Promise<boolean> {
    // Um único UPDATE com a condição: o banco garante que duas tentativas não pegam a mesma vaga.
    const { count } = await this.prisma.codigoEmail.updateMany({
      where: { id, encerradoEm: null, tentativas: { lt: maxAttempts } },
      data: { tentativas: { increment: 1 } },
    });
    return count === 1;
  }

  async close(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.codigoEmail.updateMany({
      where: { id, encerradoEm: null },
      data: { encerradoEm: at },
    });
    return count === 1;
  }

  async closeAllForUser(userId: string, at: Date): Promise<void> {
    await this.prisma.codigoEmail.updateMany({
      where: { usuarioId: userId, encerradoEm: null },
      data: { encerradoEm: at },
    });
  }
}
