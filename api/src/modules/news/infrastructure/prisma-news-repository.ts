import type { NewsCategory } from '@simulador/shared';
import { Prisma, type FonteNoticia, type PrismaClient } from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../../audit/application/audit.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type {
  ArchiveProgress,
  NewsRepository,
  NewsToSave,
  StoredNewsSource,
} from '../application/ports.js';
import { NewsSourceExistsError, NewsSourceNotFoundError } from '../domain/errors.js';

function toStored(row: FonteNoticia): StoredNewsSource {
  return {
    id: row.id,
    kind: row.tipo === 'pai' ? 'parent' : 'curated',
    name: row.nome,
    url: row.url,
    category: row.categoria,
    reliability: row.confiabilidade,
    active: row.ativa,
    licenseCheckedAt: row.licencaConferidaEm,
    lastRunAt: row.ultimaColetaEm,
    lastStatus:
      row.ultimaSituacao === 'sucesso'
        ? 'success'
        : row.ultimaSituacao === 'falha'
          ? 'failure'
          : null,
    lastError: row.ultimoErro,
    failures: row.falhasSeguidas,
  };
}

/** Fontes e notícias no PostgreSQL (SPEC-027 §6). */
export class PrismaNewsRepository implements NewsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async sources(): Promise<StoredNewsSource[]> {
    return (await this.prisma.fonteNoticia.findMany({ orderBy: { criadaEm: 'asc' } })).map(
      toStored,
    );
  }

  async source(id: string): Promise<StoredNewsSource | null> {
    const row = await this.prisma.fonteNoticia.findUnique({ where: { id } });
    return row ? toStored(row) : null;
  }

  async parentSource(): Promise<StoredNewsSource | null> {
    const row = await this.prisma.fonteNoticia.findFirst({ where: { tipo: 'pai' } });
    return row ? toStored(row) : null;
  }

  async newsCounts(): Promise<Map<string, number>> {
    const groups = await this.prisma.noticia.groupBy({ by: ['fonteId'], _count: { _all: true } });
    return new Map(groups.map((group) => [group.fonteId, group._count._all]));
  }

  async storedUrls(sourceId: string): Promise<Map<string, Date | null>> {
    const rows = await this.prisma.noticia.findMany({
      where: { fonteId: sourceId },
      select: { url: true, atualizadaNaFonteEm: true },
    });
    return new Map(rows.map((row) => [row.url, row.atualizadaNaFonteEm]));
  }

  async saveNews(sourceId: string, news: readonly NewsToSave[], at: Date): Promise<number> {
    if (news.length === 0) return 0;
    const unique = [...new Map(news.map((item) => [item.url, item])).values()];
    const existing = new Set(
      (
        await this.prisma.noticia.findMany({
          where: { fonteId: sourceId, url: { in: unique.map((item) => item.url) } },
          select: { url: true },
        })
      ).map((row) => row.url),
    );
    await this.prisma.$transaction(
      unique.map((item) => {
        const fields = {
          titulo: item.title,
          resumo: item.summary,
          texto: item.body,
          autor: item.author,
          temas: item.themes,
          empresasMarcadas: item.companies,
          atualizadaNaFonteEm: item.updatedAt,
          coletadaEm: at,
        };
        return this.prisma.noticia.upsert({
          where: { fonteId_url: { fonteId: sourceId, url: item.url } },
          // A data de publicação de uma notícia já guardada nunca muda (§4.2).
          create: { fonteId: sourceId, url: item.url, publicadaEm: item.publishedAt, ...fields },
          update: fields,
        });
      }),
    );
    return unique.filter((item) => !existing.has(item.url)).length;
  }

  async recordRun(
    sourceId: string,
    outcome: { status: 'success' | 'failure'; error: string | null },
    at: Date,
  ): Promise<void> {
    await this.prisma.fonteNoticia.update({
      where: { id: sourceId },
      data: {
        ultimaColetaEm: at,
        ultimaSituacao: outcome.status === 'success' ? 'sucesso' : 'falha',
        ultimoErro: outcome.error?.slice(0, 300) ?? null,
        falhasSeguidas: outcome.status === 'success' ? 0 : { increment: 1 },
      },
    });
  }

  async archive(sourceId: string): Promise<ArchiveProgress | null> {
    const row = await this.prisma.coletaNoticiaArquivo.findUnique({ where: { fonteId: sourceId } });
    if (!row) return null;
    return {
      total: row.total,
      done: row.feitas,
      status: row.situacao === 'concluido' ? 'finished' : 'running',
      updatedAt: row.atualizadaEm,
    };
  }

  async saveArchive(sourceId: string, progress: ArchiveProgress): Promise<void> {
    const data = {
      total: progress.total,
      feitas: progress.done,
      situacao: progress.status === 'finished' ? ('concluido' as const) : ('em_andamento' as const),
      atualizadaEm: progress.updatedAt,
    };
    await this.prisma.coletaNoticiaArquivo.upsert({
      where: { fonteId: sourceId },
      create: { fonteId: sourceId, ...data },
      update: data,
    });
  }

  async createSource(
    source: {
      name: string;
      url: string;
      category: NewsCategory;
      reliability: number;
      licenseCheckedAt: Date;
    },
    audit: (id: string) => AuditEntry,
  ): Promise<StoredNewsSource> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.fonteNoticia.create({
          data: {
            tipo: 'curada',
            nome: source.name,
            url: source.url,
            categoria: source.category,
            confiabilidade: source.reliability,
            licencaConferidaEm: source.licenseCheckedAt,
            criadaEm: source.licenseCheckedAt,
            atualizadaEm: source.licenseCheckedAt,
          },
        });
        await tx.registroAuditoria.create({ data: auditRow(audit(created.id)) });
        return created;
      });
      return toStored(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new NewsSourceExistsError();
      }
      throw error;
    }
  }

  async updateSource(
    id: string,
    changes: { name?: string; category?: NewsCategory; reliability?: number; active?: boolean },
    at: Date,
    audit: AuditEntry,
  ): Promise<StoredNewsSource> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.fonteNoticia.findUnique({ where: { id } });
      if (!current) throw new NewsSourceNotFoundError();
      const updated = await tx.fonteNoticia.update({
        where: { id },
        data: {
          ...(changes.name !== undefined ? { nome: changes.name } : {}),
          ...(changes.category !== undefined ? { categoria: changes.category } : {}),
          ...(changes.reliability !== undefined ? { confiabilidade: changes.reliability } : {}),
          ...(changes.active !== undefined ? { ativa: changes.active } : {}),
          atualizadaEm: at,
        },
      });
      await tx.registroAuditoria.create({ data: auditRow(audit) });
      return updated;
    });
    return toStored(row);
  }

  async clearParent(): Promise<number> {
    const parent = await this.prisma.fonteNoticia.findFirst({ where: { tipo: 'pai' } });
    if (!parent) return 0;
    const [news, archive] = await this.prisma.$transaction([
      this.prisma.noticia.deleteMany({ where: { fonteId: parent.id } }),
      this.prisma.coletaNoticiaArquivo.deleteMany({ where: { fonteId: parent.id } }),
      this.prisma.fonteNoticia.update({
        where: { id: parent.id },
        data: { ultimaColetaEm: null, ultimaSituacao: null, ultimoErro: null, falhasSeguidas: 0 },
      }),
    ]);
    return news.count + archive.count;
  }
}
