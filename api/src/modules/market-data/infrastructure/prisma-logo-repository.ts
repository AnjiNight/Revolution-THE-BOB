import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { LogoImage, LogoRecord, LogoRepository, LogoType } from '../application/ports.js';

/** Logos dos ativos (SPEC-040) no PostgreSQL. */
export class PrismaLogoRepository implements LogoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async downloadedAt(): Promise<Map<string, Date>> {
    const rows = await this.prisma.logoAtivo.findMany({
      select: { ativoId: true, baixadoEm: true },
    });
    return new Map(rows.map((row) => [row.ativoId, row.baixadoEm]));
  }

  async save(logos: LogoRecord[], at: Date): Promise<void> {
    if (logos.length === 0) return;
    await this.prisma.$transaction(
      logos.map((logo) => {
        const fields =
          logo.status === 'ok'
            ? {
                situacao: 'ok' as const,
                tipo: logo.image.type,
                conteudo: Buffer.from(logo.image.content),
                resumo: logo.hash,
              }
            : { situacao: 'sem_logo' as const, tipo: null, conteudo: null, resumo: null };
        return this.prisma.logoAtivo.upsert({
          where: { ativoId: logo.assetId },
          create: { ativoId: logo.assetId, ...fields, baixadoEm: at },
          update: { ...fields, baixadoEm: at },
        });
      }),
    );
  }

  async find(assetId: string): Promise<LogoImage | null> {
    const row = await this.prisma.logoAtivo.findUnique({ where: { ativoId: assetId } });
    if (!row || row.situacao !== 'ok' || !row.conteudo || !row.tipo) return null;
    // O CHECK do banco garante um dos dois tipos aceitos.
    return { type: row.tipo as LogoType, content: new Uint8Array(row.conteudo) };
  }

  async withLogo(): Promise<Set<string>> {
    const rows = await this.prisma.logoAtivo.findMany({
      where: { situacao: 'ok' },
      select: { ativoId: true },
    });
    return new Set(rows.map((row) => row.ativoId));
  }
}
