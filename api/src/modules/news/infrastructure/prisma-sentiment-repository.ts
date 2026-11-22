import type { NewsSentiment } from '@simulador/shared';
import {
  Prisma,
  type PrismaClient,
  type SentimentoNoticia,
  type VersaoModelo,
} from '../../../generated/prisma/client.js';
import type {
  Classification,
  LabelRow,
  NewsToClassify,
  SentimentRepository,
  StoredEvaluation,
  StoredLabel,
  StoredModelVersion,
  StoredNewsToLabel,
} from '../application/ports.js';
import { NewsNotFoundError } from '../domain/errors.js';

const TO_DB: Record<NewsSentiment, SentimentoNoticia> = {
  positive: 'positivo',
  neutral: 'neutro',
  negative: 'negativo',
};
const FROM_DB: Record<SentimentoNoticia, NewsSentiment> = {
  positivo: 'positive',
  neutro: 'neutral',
  negativo: 'negative',
};

export const sentimentToDb = (sentiment: NewsSentiment): SentimentoNoticia => TO_DB[sentiment];
export const sentimentFromDb = (sentiment: SentimentoNoticia): NewsSentiment => FROM_DB[sentiment];

/** A classificação guardada da notícia (SPEC-044), ou `null` se ela está pendente. */
export function storedClassification(row: {
  sentimento: SentimentoNoticia | null;
  versaoModeloId: number | null;
}) {
  return row.sentimento && row.versaoModeloId !== null
    ? { sentiment: FROM_DB[row.sentimento], modelVersionId: row.versaoModeloId }
    : null;
}

function toVersion(row: VersaoModelo): StoredModelVersion {
  const evaluated =
    row.avaliadaEm &&
    row.amostraTeste !== null &&
    row.acuracia !== null &&
    row.f1Macro !== null &&
    row.matriz !== null;
  return {
    id: row.id,
    name: row.nome,
    number: row.numero,
    status: row.situacao === 'em_uso' ? 'in_use' : 'retired',
    createdAt: row.criadaEm,
    evaluation: evaluated
      ? {
          evaluatedAt: row.avaliadaEm as Date,
          testSize: row.amostraTeste as number,
          accuracy: Number(row.acuracia),
          macroF1: Number(row.f1Macro),
          matrix: row.matriz as number[][],
        }
      : null,
  };
}

/** Sentimento das notícias no PostgreSQL (SPEC-044 §6). */
export class PrismaSentimentRepository implements SentimentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async useVersion(name: string, number: number, at: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.versaoModelo.findUnique({
        where: { nome_numero: { nome: name, numero: number } },
      });
      if (found?.situacao === 'em_uso') return found.id;
      // Primeiro retira a atual: o índice único parcial só aceita uma em uso.
      await tx.versaoModelo.updateMany({
        where: { situacao: 'em_uso' },
        data: { situacao: 'retirada' },
      });
      if (found) {
        await tx.versaoModelo.update({ where: { id: found.id }, data: { situacao: 'em_uso' } });
        return found.id;
      }
      const created = await tx.versaoModelo.create({
        data: { nome: name, numero: number, situacao: 'em_uso', criadaEm: at },
      });
      return created.id;
    });
  }

  async currentVersion(): Promise<StoredModelVersion | null> {
    const row = await this.prisma.versaoModelo.findFirst({ where: { situacao: 'em_uso' } });
    return row ? toVersion(row) : null;
  }

  async retiredVersions(): Promise<StoredModelVersion[]> {
    const rows = await this.prisma.versaoModelo.findMany({
      where: { situacao: 'retirada' },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toVersion);
  }

  async newsToClassify(versionId: number, limit: number): Promise<NewsToClassify[]> {
    const rows = await this.prisma.noticia.findMany({
      where: {
        repetidaDeId: null,
        OR: [{ versaoModeloId: null }, { versaoModeloId: { not: versionId } }],
      },
      select: { id: true, titulo: true, resumo: true },
      orderBy: [{ publicadaEm: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, title: row.titulo, summary: row.resumo }));
  }

  async saveClassifications(
    versionId: number,
    items: readonly Classification[],
    at: Date,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.noticia.updateMany({
          where: { id: item.newsId },
          data: {
            sentimento: TO_DB[item.sentiment],
            sentimentoPontuacao: item.score,
            classificadaEm: at,
            versaoModeloId: versionId,
          },
        }),
      ),
    );
  }

  async classifiedCounts(versionId: number | null): Promise<{ total: number; classified: number }> {
    const [total, classified] = await Promise.all([
      this.prisma.noticia.count({ where: { repetidaDeId: null } }),
      versionId === null
        ? Promise.resolve(0)
        : this.prisma.noticia.count({ where: { versaoModeloId: versionId } }),
    ]);
    return { total, classified };
  }

  async labels(versionId: number | null): Promise<LabelRow[]> {
    const rows = await this.prisma.rotuloNoticia.findMany({
      select: {
        sentimento: true,
        noticia: { select: { publicadaEm: true, sentimento: true, versaoModeloId: true } },
      },
    });
    return rows.map((row) => ({
      publishedAt: row.noticia.publicadaEm,
      label: FROM_DB[row.sentimento],
      predicted:
        versionId !== null && row.noticia.versaoModeloId === versionId && row.noticia.sentimento
          ? FROM_DB[row.noticia.sentimento]
          : null,
    }));
  }

  async recentLabels(limit: number): Promise<StoredLabel[]> {
    const rows = await this.prisma.rotuloNoticia.findMany({
      orderBy: [{ rotuladoEm: 'desc' }, { noticiaId: 'asc' }],
      take: limit,
      select: {
        sentimento: true,
        rotuladoEm: true,
        noticia: { select: { id: true, titulo: true, url: true, publicadaEm: true } },
      },
    });
    return rows.map((row) => ({
      id: row.noticia.id,
      title: row.noticia.titulo,
      url: row.noticia.url,
      publishedAt: row.noticia.publicadaEm,
      label: FROM_DB[row.sentimento],
      labeledAt: row.rotuladoEm,
    }));
  }

  async nextToLabel(skip: readonly string[]): Promise<StoredNewsToLabel | null> {
    // Sorteada: rotular na ordem da lista deixaria a amostra toda num pedaço do tempo.
    const skipped =
      skip.length > 0
        ? Prisma.sql`AND n.id NOT IN (${Prisma.join(skip.map((id) => Prisma.sql`${id}::uuid`))})`
        : Prisma.empty;
    const [picked] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT n.id FROM noticia n
      WHERE n.repetida_de_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM rotulo_noticia r WHERE r.noticia_id = n.id) ${skipped}
      ORDER BY EXISTS (
        SELECT 1 FROM noticia_ativo a WHERE a.noticia_id = n.id AND a.relevancia = 'principal'
      ) DESC, random()
      LIMIT 1`;
    if (!picked) return null;
    const row = await this.prisma.noticia.findUnique({
      where: { id: picked.id },
      select: {
        id: true,
        titulo: true,
        resumo: true,
        url: true,
        publicadaEm: true,
        fonte: { select: { nome: true } },
        ativos: {
          where: { relevancia: 'principal' },
          select: { ativo: { select: { ticker: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      title: row.titulo,
      summary: row.resumo,
      url: row.url,
      source: row.fonte.nome,
      publishedAt: row.publicadaEm,
      principal: row.ativos.map((link) => link.ativo.ticker).sort(),
    };
  }

  async saveLabel(newsId: string, sentiment: NewsSentiment, at: Date): Promise<void> {
    try {
      await this.prisma.rotuloNoticia.upsert({
        where: { noticiaId: newsId },
        create: { noticiaId: newsId, sentimento: TO_DB[sentiment], rotuladoEm: at },
        update: { sentimento: TO_DB[sentiment], rotuladoEm: at },
      });
    } catch (error) {
      // A notícia não existe (chave estrangeira).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NewsNotFoundError();
      }
      throw error;
    }
  }

  async deleteLabel(newsId: string): Promise<boolean> {
    const { count } = await this.prisma.rotuloNoticia.deleteMany({ where: { noticiaId: newsId } });
    return count > 0;
  }

  async saveEvaluation(versionId: number, evaluation: StoredEvaluation): Promise<void> {
    await this.prisma.versaoModelo.update({
      where: { id: versionId },
      data: {
        avaliadaEm: evaluation.evaluatedAt,
        amostraTeste: evaluation.testSize,
        acuracia: evaluation.accuracy,
        f1Macro: evaluation.macroF1,
        matriz: evaluation.matrix,
      },
    });
  }
}
