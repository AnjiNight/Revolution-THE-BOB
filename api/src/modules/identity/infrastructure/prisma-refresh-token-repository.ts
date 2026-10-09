import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  NewRefreshToken,
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../application/ports.js';

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.tokenRenovacao.create({ data: toRow(token) });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const row = await this.prisma.tokenRenovacao.findUnique({ where: { tokenHash } });
    return row
      ? {
          id: row.id,
          userId: row.usuarioId,
          family: row.familia,
          expiresAt: row.expiraEm,
          revokedAt: row.revogadoEm,
        }
      : null;
  }

  async rotate(currentId: string, next: NewRefreshToken, at: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tokenRenovacao.updateMany({
        where: { id: currentId, revogadoEm: null },
        data: { revogadoEm: at },
      });
      if (count === 0) return false;
      await tx.tokenRenovacao.create({ data: toRow(next) });
      return true;
    });
  }

  async revokeFamily(family: string, at: Date): Promise<void> {
    await this.prisma.tokenRenovacao.updateMany({
      where: { familia: family, revogadoEm: null },
      data: { revogadoEm: at },
    });
  }
}

function toRow(token: NewRefreshToken) {
  return {
    usuarioId: token.userId,
    tokenHash: token.tokenHash,
    familia: token.family,
    expiraEm: token.expiresAt,
  };
}
