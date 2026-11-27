import {
  PARENT_SOURCE_WEIGHT,
  SOURCE_PRIORITY_WEIGHT,
  type AssetClass,
  type NewsCategory,
  type NewsSentiment,
  type SourcePriority,
  type UserSourcesTotals,
} from '@simulador/shared';
import {
  Prisma,
  type FonteNoticia,
  type PreferenciaFonte,
  type PrioridadeFonte,
  type PrismaClient,
  type SentimentoNoticia,
} from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../../audit/application/audit.js';
import { auditRow } from '../../audit/infrastructure/prisma-audit.js';
import type {
  ArchiveProgress,
  AssetNewsDate,
  AssetNewsFilter,
  AssetNewsRow,
  LatestNewsRow,
  NewsFeedFilter,
  NewsFeedRow,
  NewsRepository,
  ScenarioNewsRow,
  ScenarioRecord,
  NewsToLink,
  NewsToSave,
  StoredLink,
  StoredNewsSource,
  StoredPreference,
  UserSourceRow,
} from '../application/ports.js';
import type { CatalogTicker, LinkRelevance } from '../domain/asset-links.js';
import {
  NewsSourceExistsError,
  NewsSourceNotFoundError,
  OwnFeedExistsError,
  OwnFeedLimitError,
  SourceAlreadyInAppError,
} from '../domain/errors.js';
import {
  sentimentFromDb,
  sentimentToDb,
  storedClassification,
} from './prisma-sentiment-repository.js';

function toStored(row: FonteNoticia): StoredNewsSource {
  return {
    id: row.id,
    kind: row.tipo === 'pai' ? 'parent' : row.tipo === 'curada' ? 'curated' : 'user',
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
    stoppedAt: row.paradaEm,
  };
}

const PRIORITY_TO_DB: Record<SourcePriority, PrioridadeFonte> = {
  high: 'alta',
  medium: 'media',
  low: 'baixa',
};
const PRIORITY_FROM_DB: Record<PrioridadeFonte, SourcePriority> = {
  alta: 'high',
  media: 'medium',
  baixa: 'low',
};
const CLASS_TO_DB: Record<AssetClass, string> = { stock: 'acao', fii: 'fii' };

function toPreference(row: PreferenciaFonte): StoredPreference {
  return {
    sourceId: row.fonteId,
    active: row.ativa,
    priority: PRIORITY_FROM_DB[row.prioridade],
    name: row.nome,
  };
}

/** SPEC-030: a fonte de cada notícia (`f`) e a escolha de quem vê (`p`). */
function viewerJoin(userId: string): Prisma.Sql {
  return Prisma.sql`JOIN fonte_noticia f ON f.id = n.fonte_id
    LEFT JOIN preferencia_fonte p ON p.fonte_id = f.id AND p.usuario_id = ${userId}::uuid`;
}

/**
 * Quem vê cada notícia (§4.2): a fonte pai sempre (RB29); a curada ligada pelo colaborador e não
 * desligada pelo usuário; o feed próprio só para quem o tem ligado.
 */
const VIEWER_VISIBLE = Prisma.sql`(f.tipo::text = 'pai'
  OR (f.tipo::text = 'curada' AND f.ativa AND COALESCE(p.ativa, true))
  OR (f.tipo::text = 'usuario' AND p.ativa IS TRUE))`;

const weightSql = (value: number) => Prisma.raw(String(value));

/** O peso da fonte (§4.1, decisão 2): a pai 4; alta 3, média 2 (também sem escolha), baixa 1. */
const VIEWER_WEIGHT = Prisma.sql`(CASE
  WHEN f.tipo::text = 'pai' THEN ${weightSql(PARENT_SOURCE_WEIGHT)}
  WHEN p.prioridade::text = 'alta' THEN ${weightSql(SOURCE_PRIORITY_WEIGHT.high)}
  WHEN p.prioridade::text = 'baixa' THEN ${weightSql(SOURCE_PRIORITY_WEIGHT.low)}
  ELSE ${weightSql(SOURCE_PRIORITY_WEIGHT.medium)} END)`;

/** Por dia de publicação em Brasília; no mesmo dia, pelo peso da fonte; depois, pelo horário. */
const VIEWER_ORDER = Prisma.sql`ORDER BY (n.publicada_em AT TIME ZONE 'America/Sao_Paulo')::date DESC,
  ${VIEWER_WEIGHT} DESC, n.publicada_em DESC, n.id`;

/** No feed próprio, o nome que o usuário deu (ou o título do feed). */
const NEWS_COLUMNS = Prisma.sql`n.id, n.titulo, n.resumo, n.url, n.publicada_em, n.sentimento,
  n.versao_modelo_id, COALESCE(CASE WHEN f.tipo::text = 'usuario' THEN p.nome END, f.nome) AS fonte,
  (f.tipo::text = 'usuario') AS propria`;

interface NewsRawRow {
  id: string;
  titulo: string;
  resumo: string | null;
  url: string;
  publicada_em: Date;
  sentimento: SentimentoNoticia | null;
  versao_modelo_id: number | null;
  fonte: string;
  propria: boolean;
}

function fromRaw(row: NewsRawRow) {
  return {
    id: row.id,
    title: row.titulo,
    summary: row.resumo,
    url: row.url,
    source: row.fonte,
    ownSource: row.propria,
    publishedAt: row.publicada_em,
    classification: storedClassification({
      sentimento: row.sentimento,
      versaoModeloId: row.versao_modelo_id,
    }),
  };
}

/** SPEC-029 e 030: os vínculos do ativo com as relevâncias pedidas, das fontes de quem vê. */
function assetWhere(assetId: string, filter: AssetNewsFilter): Prisma.Sql {
  const parts = [
    Prisma.sql`a.ativo_id = ${assetId}::uuid`,
    Prisma.sql`a.relevancia::text IN (${Prisma.join([...filter.relevances])})`,
    VIEWER_VISIBLE,
  ];
  if (filter.from) parts.push(Prisma.sql`n.publicada_em >= ${filter.from}`);
  if (filter.to) parts.push(Prisma.sql`n.publicada_em < ${filter.to}`);
  return Prisma.join(parts, ' AND ');
}

/** SPEC-030: o filtro da tela Notícias; ativo e setor pelas notícias principal ou citado. */
function feedWhere(filter: NewsFeedFilter): Prisma.Sql {
  const parts = [Prisma.sql`n.publicada_em >= ${filter.from}`, VIEWER_VISIBLE];
  if (filter.assetId) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM noticia_ativo a WHERE a.noticia_id = n.id
      AND a.ativo_id = ${filter.assetId}::uuid AND a.relevancia::text IN ('principal', 'citado'))`);
  }
  if (filter.sector) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM noticia_ativo a JOIN ativo t ON t.id = a.ativo_id
      WHERE a.noticia_id = n.id AND a.relevancia::text IN ('principal', 'citado')
      AND t.classe::text = ${CLASS_TO_DB[filter.sector.class]} AND t.setor = ${filter.sector.code})`);
  }
  if (filter.sourceId) parts.push(Prisma.sql`n.fonte_id = ${filter.sourceId}::uuid`);
  if (filter.sentiment) {
    parts.push(Prisma.sql`n.sentimento::text = ${sentimentToDb(filter.sentiment.value)}
      AND n.versao_modelo_id = ${filter.sentiment.modelVersionId}`);
  }
  return Prisma.join(parts, ' AND ');
}

/** Fontes e notícias no PostgreSQL (SPEC-027 §6). */
export class PrismaNewsRepository implements NewsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * A pai primeiro (a ordem do tipo no banco), depois as curadas na ordem de cadastro. Só pela
   * data não bastava: num banco novo, as duas da migração nascem no mesmo milissegundo.
   */
  async sources(): Promise<StoredNewsSource[]> {
    // SPEC-030: os feeds dos usuários não são fontes do app.
    const rows = await this.prisma.fonteNoticia.findMany({
      where: { tipo: { in: ['pai', 'curada'] } },
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
      where: { OR: [{ versaoVinculo: null }, { versaoVinculo: { not: version } }] },
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
    // SPEC-030 (RB30): só as notícias da fonte pai e das curadas.
    const rows = await this.prisma.noticia.findMany({
      where: { fonte: { tipo: { not: 'usuario' } } },
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
    const official = { fonte: { tipo: { not: 'usuario' as const } } };
    const [total, linked] = await Promise.all([
      this.prisma.noticia.count({ where: official }),
      this.prisma.noticia.count({ where: { ...official, ativos: { some: {} } } }),
    ]);
    return { total, linked };
  }

  // --- SPEC-030: fontes do usuário ---

  async userSources(userId: string): Promise<UserSourceRow[]> {
    const rows = await this.prisma.fonteNoticia.findMany({
      where: {
        OR: [
          { tipo: 'pai' },
          { tipo: 'curada', ativa: true },
          { tipo: 'usuario', preferencias: { some: { usuarioId: userId } } },
        ],
      },
      include: {
        preferencias: { where: { usuarioId: userId } },
        _count: { select: { noticias: true } },
      },
      orderBy: [{ tipo: 'asc' }, { criadaEm: 'asc' }, { nome: 'asc' }],
    });
    return rows.map((row) => {
      const preference = row.preferencias[0];
      return {
        source: toStored(row),
        preference: preference ? toPreference(preference) : null,
        news: row._count.noticias,
      };
    });
  }

  async sourceByUrl(url: string): Promise<StoredNewsSource | null> {
    const row = await this.prisma.fonteNoticia.findUnique({ where: { url } });
    return row ? toStored(row) : null;
  }

  async savePreference(
    userId: string,
    sourceId: string,
    changes: { active?: boolean; priority?: SourcePriority; name?: string },
    at: Date,
  ): Promise<StoredPreference> {
    const data = {
      ...(changes.active !== undefined ? { ativa: changes.active } : {}),
      ...(changes.priority !== undefined ? { prioridade: PRIORITY_TO_DB[changes.priority] } : {}),
      ...(changes.name !== undefined ? { nome: changes.name } : {}),
      atualizadaEm: at,
    };
    const row = await this.prisma.preferenciaFonte.upsert({
      where: { usuarioId_fonteId: { usuarioId: userId, fonteId: sourceId } },
      create: { usuarioId: userId, fonteId: sourceId, criadaEm: at, ...data },
      update: data,
    });
    return toPreference(row);
  }

  async addOwnSource(
    userId: string,
    feed: { url: string; title: string; name: string | null },
    limit: number,
    at: Date,
  ): Promise<UserSourceRow> {
    // Duas pessoas adicionando o mesmo endereço novo ao mesmo tempo: a segunda acha a fonte na
    // segunda tentativa (P2002). A fonte apagada pelo último usuário no meio do caminho: P2003.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Um pedido de cada vez por usuário: o limite de 10 vale mesmo com cliques seguidos.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fontes:${userId}`}))`;
          const existing = await tx.fonteNoticia.findUnique({ where: { url: feed.url } });
          if (existing && existing.tipo !== 'usuario')
            throw new SourceAlreadyInAppError(existing.id);
          if (
            existing &&
            (await tx.preferenciaFonte.count({
              where: { usuarioId: userId, fonteId: existing.id },
            })) > 0
          ) {
            throw new OwnFeedExistsError();
          }
          const own = await tx.preferenciaFonte.count({
            where: { usuarioId: userId, fonte: { tipo: 'usuario' } },
          });
          if (own >= limit) throw new OwnFeedLimitError();
          const source =
            existing ??
            (await tx.fonteNoticia.create({
              data: {
                tipo: 'usuario',
                nome: feed.title,
                url: feed.url,
                criadaEm: at,
                atualizadaEm: at,
              },
            }));
          const preference = await tx.preferenciaFonte.create({
            data: {
              usuarioId: userId,
              fonteId: source.id,
              nome: feed.name,
              criadaEm: at,
              atualizadaEm: at,
            },
          });
          const news = await tx.noticia.count({ where: { fonteId: source.id } });
          return { source: toStored(source), preference: toPreference(preference), news };
        });
      } catch (error) {
        const retry =
          attempt === 0 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2003');
        if (!retry) throw error;
      }
    }
  }

  async removeOwnSource(userId: string, sourceId: string): Promise<boolean> {
    const { count } = await this.prisma.preferenciaFonte.deleteMany({
      where: { usuarioId: userId, fonteId: sourceId, fonte: { tipo: 'usuario' } },
    });
    return count > 0;
  }

  async collectableUserSources(): Promise<StoredNewsSource[]> {
    const rows = await this.prisma.fonteNoticia.findMany({
      where: { tipo: 'usuario', paradaEm: null, preferencias: { some: { ativa: true } } },
      orderBy: [{ criadaEm: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStored);
  }

  async setStopped(sourceId: string, stoppedAt: Date | null): Promise<void> {
    await this.prisma.fonteNoticia.update({
      where: { id: sourceId },
      data: { paradaEm: stoppedAt, ...(stoppedAt === null ? { falhasSeguidas: 0 } : {}) },
    });
  }

  async deleteUserNewsBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.noticia.deleteMany({
      where: { publicadaEm: { lt: cutoff }, fonte: { tipo: 'usuario' } },
    });
    return count;
  }

  async userSourceTotals(problemAfter: number): Promise<UserSourcesTotals> {
    const [total, failing, stopped] = await Promise.all([
      this.prisma.fonteNoticia.count({ where: { tipo: 'usuario' } }),
      this.prisma.fonteNoticia.count({
        where: { tipo: 'usuario', paradaEm: null, falhasSeguidas: { gte: problemAfter } },
      }),
      this.prisma.fonteNoticia.count({ where: { tipo: 'usuario', paradaEm: { not: null } } }),
    ]);
    return { total, failing, stopped };
  }

  async newsFeed(
    userId: string,
    filter: NewsFeedFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: NewsFeedRow[] }> {
    const where = feedWhere(filter);
    const [counted, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT count(*)::int AS total FROM noticia n ${viewerJoin(userId)} WHERE ${where}`,
      this.prisma.$queryRaw<NewsRawRow[]>`
        SELECT ${NEWS_COLUMNS} FROM noticia n ${viewerJoin(userId)}
        WHERE ${where} ${VIEWER_ORDER} OFFSET ${page.offset} LIMIT ${page.limit}`,
    ]);
    const links = await this.prisma.noticiaAtivo.findMany({
      where: {
        noticiaId: { in: rows.map((row) => row.id) },
        relevancia: { in: ['principal', 'citado'] },
      },
      select: {
        noticiaId: true,
        relevancia: true,
        ativo: { select: { id: true, ticker: true } },
      },
    });
    return {
      total: counted[0]?.total ?? 0,
      rows: rows.map((row) => ({
        ...fromRaw(row),
        assets: links
          .filter((link) => link.noticiaId === row.id)
          .sort(
            (a, b) =>
              (a.relevancia === 'principal' ? 0 : 1) - (b.relevancia === 'principal' ? 0 : 1) ||
              a.ativo.ticker.localeCompare(b.ativo.ticker),
          )
          .map((link) => ({ id: link.ativo.id, ticker: link.ativo.ticker })),
      })),
    };
  }

  async newsFeedTones(
    userId: string,
    filter: NewsFeedFilter,
    modelVersionId: number,
  ): Promise<Array<{ sentiment: NewsSentiment; weight: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ sentimento: SentimentoNoticia; peso: number }>
    >`
      SELECT n.sentimento AS sentimento, ${VIEWER_WEIGHT} AS peso
      FROM noticia n ${viewerJoin(userId)}
      WHERE ${feedWhere(filter)} AND n.versao_modelo_id = ${modelVersionId}
        AND n.sentimento IS NOT NULL`;
    return rows.map((row) => ({ sentiment: sentimentFromDb(row.sentimento), weight: row.peso }));
  }

  // --- SPEC-031: cenários por sentimento ---

  async scenarioNews(assetId: string, modelVersionId: number): Promise<ScenarioNewsRow[]> {
    const rows = await this.prisma.noticia.findMany({
      where: {
        versaoModeloId: modelVersionId,
        sentimentoPontuacao: { not: null },
        // RB30: só a fonte pai e as curadas.
        fonte: { tipo: { in: ['pai', 'curada'] } },
        ativos: { some: { ativoId: assetId, relevancia: { in: ['principal', 'citado'] } } },
      },
      select: { publicadaEm: true, sentimentoPontuacao: true },
      orderBy: [{ publicadaEm: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      publishedAt: row.publicadaEm,
      score: Number(row.sentimentoPontuacao),
    }));
  }

  async firstClassifiedNewsAt(modelVersionId: number): Promise<Date | null> {
    const row = await this.prisma.noticia.findFirst({
      where: {
        versaoModeloId: modelVersionId,
        sentimentoPontuacao: { not: null },
        fonte: { tipo: { in: ['pai', 'curada'] } },
      },
      select: { publicadaEm: true },
      orderBy: { publicadaEm: 'asc' },
    });
    return row?.publicadaEm ?? null;
  }

  async recordScenarios(rows: readonly ScenarioRecord[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.cenarioRegistrado.createMany({
      data: rows.map((row) => ({
        ativoId: row.assetId,
        dia: new Date(`${row.day}T00:00:00Z`),
        faixa: sentimentToDb(row.band),
        horizonte: row.horizon,
        versaoModeloId: row.modelVersionId,
        ocorrencias: row.occurrences,
        queda: row.down,
        estavel: row.flat,
        alta: row.up,
        baseOcorrencias: row.baseOccurrences,
        baseQueda: row.baseDown,
        baseEstavel: row.baseFlat,
        baseAlta: row.baseUp,
      })),
      // Uma linha por ativo, dia, horizonte e versão: a primeira abertura do dia grava.
      skipDuplicates: true,
    });
  }

  async assetExists(assetId: string): Promise<boolean> {
    return (await this.prisma.ativo.count({ where: { id: assetId } })) > 0;
  }

  async assetNews(
    assetId: string,
    filter: AssetNewsFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: AssetNewsRow[] }> {
    const where = assetWhere(assetId, filter);
    const join = viewerJoin(filter.viewerId);
    const [counted, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT count(*)::int AS total
        FROM noticia_ativo a JOIN noticia n ON n.id = a.noticia_id ${join}
        WHERE ${where}`,
      page.limit === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<NewsRawRow & { relevancia: LinkRelevance }>>`
            SELECT ${NEWS_COLUMNS}, a.relevancia::text AS relevancia
            FROM noticia_ativo a JOIN noticia n ON n.id = a.noticia_id ${join}
            WHERE ${where} ${VIEWER_ORDER} OFFSET ${page.offset} LIMIT ${page.limit}`,
    ]);
    return {
      total: counted[0]?.total ?? 0,
      rows: rows.map((row) => ({ ...fromRaw(row), relevance: row.relevancia })),
    };
  }

  async assetNewsDates(assetId: string, filter: AssetNewsFilter): Promise<AssetNewsDate[]> {
    const rows = await this.prisma.$queryRaw<NewsRawRow[]>`
      SELECT ${NEWS_COLUMNS}
      FROM noticia_ativo a JOIN noticia n ON n.id = a.noticia_id ${viewerJoin(filter.viewerId)}
      WHERE ${assetWhere(assetId, filter)}`;
    return rows.map((row) => {
      const { publishedAt, classification } = fromRaw(row);
      return { publishedAt, classification };
    });
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
