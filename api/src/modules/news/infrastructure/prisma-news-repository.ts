import type { NewsCategory } from '@simulador/shared';
import { Prisma, type FonteNoticia, type PrismaClient } from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../../audit/application/audit.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type {
  ArchiveProgress,
  AssetNewsDate,
  AssetNewsFilter,
  AssetNewsRow,
  LatestNewsRow,
  NewsRepository,
  NewsToLink,
  NewsToSave,
  StoredLink,
  StoredNewsSource,
} from '../application/ports.js';
import type { CatalogTicker, LinkRelevance } from '../domain/asset-links.js';
import type { DuplicateCandidate, DuplicateReason } from '../domain/duplicates.js';
import { NewsSourceExistsError, NewsSourceNotFoundError } from '../domain/errors.js';
import { storedClassification } from './prisma-sentiment-repository.js';

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

/** SPEC-029: os vínculos do ativo com as relevâncias pedidas, pela data de publicação. */
interface CandidateRow {
  id: string;
  fonte_id: string;
  url: string;
  titulo: string;
  publicada_em: Date;
}

function toCandidate(row: CandidateRow): DuplicateCandidate {
  return {
    id: row.id,
    sourceId: row.fonte_id,
    url: row.url,
    title: row.titulo,
    publishedAt: row.publicada_em,
  };
}

function linkWhere(assetId: string, filter: AssetNewsFilter): Prisma.NoticiaAtivoWhereInput {
  return {
    ativoId: assetId,
    relevancia: { in: [...filter.relevances] },
    // SPEC-047: a repetida não tem vínculo, mas a condição deixa a regra explícita.
    noticia: {
      repetidaDeId: null,
      ...(filter.from || filter.to
        ? {
            publicadaEm: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
  };
}

/** Fontes e notícias no PostgreSQL (SPEC-027 §6). */
export class PrismaNewsRepository implements NewsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * A pai primeiro (a ordem do tipo no banco), depois as curadas na ordem de cadastro. Só pela
   * data não bastava: num banco novo, as duas da migração nascem no mesmo milissegundo.
   */
  async sources(): Promise<StoredNewsSource[]> {
    const rows = await this.prisma.fonteNoticia.findMany({
      orderBy: [{ tipo: 'asc' }, { criadaEm: 'asc' }, { nome: 'asc' }],
    });
    return rows.map(toStored);
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

  async duplicateCounts(): Promise<Map<string, number>> {
    const groups = await this.prisma.noticia.groupBy({
      by: ['fonteId'],
      where: { repetidaDeId: { not: null } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.fonteId, group._count._all]));
  }

  /**
   * SPEC-047: a ordem em que valem como original: a primeira coletada; no empate, a fonte pai e
   * depois a maior confiabilidade.
   */
  async newsToCheck(limit: number): Promise<DuplicateCandidate[]> {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT n.id, n.fonte_id, n.url, n.titulo, n.publicada_em
      FROM noticia n JOIN fonte_noticia f ON f.id = n.fonte_id
      WHERE n.repeticao_conferida_em IS NULL
      ORDER BY n.coletada_em, (f.tipo = 'pai') DESC, f.confiabilidade DESC NULLS LAST, n.id
      LIMIT ${limit}`;
    return rows.map(toCandidate);
  }

  async originalsAround(from: Date, to: Date): Promise<DuplicateCandidate[]> {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT n.id, n.fonte_id, n.url, n.titulo, n.publicada_em
      FROM noticia n JOIN fonte_noticia f ON f.id = n.fonte_id
      WHERE n.repeticao_conferida_em IS NOT NULL AND n.repetida_de_id IS NULL
        AND n.publicada_em BETWEEN ${from} AND ${to}
      ORDER BY n.coletada_em, (f.tipo = 'pai') DESC, f.confiabilidade DESC NULLS LAST, n.id`;
    return rows.map(toCandidate);
  }

  async markChecked(
    newsId: string,
    duplicateOf: { originalId: string; reason: DuplicateReason } | null,
    at: Date,
  ): Promise<void> {
    if (!duplicateOf) {
      await this.prisma.noticia.update({
        where: { id: newsId },
        data: { repeticaoConferidaEm: at },
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      // O rótulo da equipe passa para a original, se ela ainda não tem um.
      const label = await tx.rotuloNoticia.findUnique({ where: { noticiaId: newsId } });
      if (label) {
        await tx.rotuloNoticia.delete({ where: { noticiaId: newsId } });
        const taken = await tx.rotuloNoticia.findUnique({
          where: { noticiaId: duplicateOf.originalId },
        });
        if (!taken) {
          await tx.rotuloNoticia.create({
            data: {
              noticiaId: duplicateOf.originalId,
              sentimento: label.sentimento,
              rotuladoEm: label.rotuladoEm,
            },
          });
        }
      }
      await tx.noticiaAtivo.deleteMany({ where: { noticiaId: newsId } });
      await tx.noticia.update({
        where: { id: newsId },
        data: {
          repeticaoConferidaEm: at,
          repetidaDeId: duplicateOf.originalId,
          repetidaPor: duplicateOf.reason,
          vinculadaEm: null,
          versaoVinculo: null,
          sentimento: null,
          sentimentoPontuacao: null,
          classificadaEm: null,
          versaoModeloId: null,
        },
      });
    });
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
          // SPEC-028: texto atualizado, vínculo refeito (o vinculador pega as sem versão). SPEC-044:
          // e a classificação também (a notícia volta a ficar pendente).
          update: {
            ...fields,
            vinculadaEm: null,
            versaoVinculo: null,
            sentimento: null,
            sentimentoPontuacao: null,
            classificadaEm: null,
            versaoModeloId: null,
          },
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

  async newsToLink(version: number, limit: number): Promise<NewsToLink[]> {
    const rows = await this.prisma.noticia.findMany({
      where: {
        repetidaDeId: null,
        OR: [{ versaoVinculo: null }, { versaoVinculo: { not: version } }],
      },
      select: { id: true, titulo: true, resumo: true, texto: true, empresasMarcadas: true },
      orderBy: { publicadaEm: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.titulo,
      summary: row.resumo,
      body: row.texto,
      companies: row.empresasMarcadas,
    }));
  }

  async saveLinks(
    newsId: string,
    links: readonly StoredLink[],
    version: number,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.noticiaAtivo.deleteMany({ where: { noticiaId: newsId } }),
      this.prisma.noticiaAtivo.createMany({
        data: links.map((link) => ({
          noticiaId: newsId,
          ativoId: link.assetId,
          relevancia: link.relevance,
          origem: link.origin,
        })),
      }),
      this.prisma.noticia.update({
        where: { id: newsId },
        data: { vinculadaEm: at, versaoVinculo: version },
      }),
    ]);
  }

  async catalogTickers(): Promise<CatalogTicker[]> {
    const rows = await this.prisma.ativo.findMany({
      select: { id: true, ticker: true, nome: true, desativadoEm: true },
    });
    return rows.map((row) => ({
      assetId: row.id,
      ticker: row.ticker,
      name: row.nome,
      active: row.desativadoEm === null,
    }));
  }

  async latestNews(limit: number): Promise<LatestNewsRow[]> {
    const rows = await this.prisma.noticia.findMany({
      where: { repetidaDeId: null },
      orderBy: [{ publicadaEm: 'desc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        titulo: true,
        url: true,
        publicadaEm: true,
        fonte: { select: { nome: true } },
        ativos: { select: { relevancia: true, ativo: { select: { ticker: true } } } },
      },
    });
    const order: Record<LinkRelevance, number> = { principal: 0, citado: 1, lista: 2 };
    return rows.map((row) => ({
      id: row.id,
      title: row.titulo,
      url: row.url,
      source: row.fonte.nome,
      publishedAt: row.publicadaEm,
      links: row.ativos
        .map((link) => ({ ticker: link.ativo.ticker, relevance: link.relevancia }))
        .sort(
          (a, b) => order[a.relevance] - order[b.relevance] || a.ticker.localeCompare(b.ticker),
        ),
    }));
  }

  async linkCounts(): Promise<{ total: number; linked: number }> {
    const [total, linked] = await Promise.all([
      this.prisma.noticia.count({ where: { repetidaDeId: null } }),
      this.prisma.noticia.count({ where: { ativos: { some: {} } } }),
    ]);
    return { total, linked };
  }

  async assetExists(assetId: string): Promise<boolean> {
    return (await this.prisma.ativo.count({ where: { id: assetId } })) > 0;
  }

  async assetNews(
    assetId: string,
    filter: AssetNewsFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: AssetNewsRow[] }> {
    const where = linkWhere(assetId, filter);
    const [total, rows] = await Promise.all([
      this.prisma.noticiaAtivo.count({ where }),
      page.limit === 0
        ? Promise.resolve([])
        : this.prisma.noticiaAtivo.findMany({
            where,
            orderBy: [{ noticia: { publicadaEm: 'desc' } }, { noticiaId: 'asc' }],
            skip: page.offset,
            take: page.limit,
            select: {
              relevancia: true,
              noticia: {
                select: {
                  id: true,
                  titulo: true,
                  resumo: true,
                  url: true,
                  publicadaEm: true,
                  sentimento: true,
                  versaoModeloId: true,
                  fonte: { select: { nome: true } },
                  repetidas: {
                    orderBy: [{ coletadaEm: 'asc' }, { id: 'asc' }],
                    select: { url: true, fonte: { select: { nome: true } } },
                  },
                },
              },
            },
          }),
    ]);
    return {
      total,
      rows: rows.map(({ relevancia, noticia }) => ({
        id: noticia.id,
        title: noticia.titulo,
        summary: noticia.resumo,
        url: noticia.url,
        source: noticia.fonte.nome,
        publishedAt: noticia.publicadaEm,
        relevance: relevancia,
        classification: storedClassification(noticia),
        alsoIn: noticia.repetidas.map((copy) => ({ source: copy.fonte.nome, url: copy.url })),
      })),
    };
  }

  async assetNewsDates(assetId: string, filter: AssetNewsFilter): Promise<AssetNewsDate[]> {
    const rows = await this.prisma.noticiaAtivo.findMany({
      where: linkWhere(assetId, filter),
      select: {
        noticia: { select: { publicadaEm: true, sentimento: true, versaoModeloId: true } },
      },
    });
    return rows.map(({ noticia }) => ({
      publishedAt: noticia.publicadaEm,
      classification: storedClassification(noticia),
    }));
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
