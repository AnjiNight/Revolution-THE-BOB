import type { PersonalDataExport, SourcePriority } from '@simulador/shared';
import type { PrioridadeFonte, PrismaClient } from '../../../generated/prisma/client.js';

const PRIORITY: Record<PrioridadeFonte, SourcePriority> = {
  alta: 'high',
  media: 'medium',
  baixa: 'low',
};

/**
 * SPEC-030: as fontes de notícias da pessoa no arquivo "Baixar meus dados" (SPEC-034, DA13): os
 * feeds próprios e as escolhas sobre as fontes do app. A exclusão vem do banco: as preferências
 * saem com a conta (ON DELETE CASCADE) e o gatilho apaga o feed que ficou sem ninguém.
 */
export class PrismaNewsSourcesExport {
  constructor(private readonly prisma: PrismaClient) {}

  async exportForUser(userId: string): Promise<PersonalDataExport['newsSources']> {
    const rows = await this.prisma.preferenciaFonte.findMany({
      where: { usuarioId: userId },
      include: { fonte: { select: { tipo: true, nome: true, url: true } } },
      orderBy: [{ criadaEm: 'asc' }, { fonteId: 'asc' }],
    });
    return rows.map((row) => ({
      kind: row.fonte.tipo === 'usuario' ? 'own' : 'curated',
      name: row.nome ?? row.fonte.nome,
      url: row.fonte.url,
      active: row.ativa,
      priority: PRIORITY[row.prioridade],
      createdAt: row.criadaEm.toISOString(),
    }));
  }
}
