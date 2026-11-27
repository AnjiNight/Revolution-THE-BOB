import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import type { NewsToSave } from '../application/ports.js';
import { NewsNotFoundError } from '../domain/errors.js';
import { PrismaNewsRepository } from './prisma-news-repository.js';
import { PrismaSentimentRepository } from './prisma-sentiment-repository.js';

/**
 * Sentimento no PostgreSQL (SPEC-044, CA07). Rodam só com TEST_DATABASE_URL. ATENÇÃO: apagam as
 * notícias, os rótulos e as versões do modelo desse banco.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('sentimento das notícias no PostgreSQL (SPEC-044)', () => {
  let prisma: PrismaClient;
  let news: PrismaNewsRepository;
  let repo: PrismaSentimentRepository;
  let parent: string;
  const at = new Date('2026-11-19T12:00:00Z');

  beforeAll(async () => {
    prisma = createPrismaClient(url as string);
    news = new PrismaNewsRepository(prisma);
    repo = new PrismaSentimentRepository(prisma);
    parent = (await news.parentSource())?.id as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE cenario_registrado, rotulo_noticia, noticia_ativo, noticia, versao_modelo RESTART IDENTITY',
    );
  });

  const item = (n: number): NewsToSave => ({
    url: `https://investidor10.com.br/noticias/sentimento-${n}/`,
    title: `Notícia ${n}`,
    summary: 'Resumo',
    body: null,
    author: null,
    themes: [],
    companies: [],
    publishedAt: new Date(Date.UTC(2026, 10, n)),
    updatedAt: null,
  });

  const ids = async () =>
    new Map(
      (await prisma.noticia.findMany({ select: { id: true, titulo: true } })).map((n) => [
        n.titulo,
        n.id,
      ]),
    );

  it('registra a versão, deixa uma só em uso e volta para uma antiga sem duplicar', async () => {
    const v1 = await repo.useVersion('lexico', 1, at);
    expect(await repo.useVersion('lexico', 1, at)).toBe(v1);
    const v2 = await repo.useVersion('lexico', 2, at);
    expect(v2).not.toBe(v1);
    expect(await repo.currentVersion()).toMatchObject({
      id: v2,
      status: 'in_use',
      evaluation: null,
    });
    expect((await repo.retiredVersions()).map((v) => v.id)).toEqual([v1]);
    expect(await repo.useVersion('lexico', 1, at)).toBe(v1);
    expect(await prisma.versaoModelo.count()).toBe(2);
    expect(await prisma.versaoModelo.count({ where: { situacao: 'em_uso' } })).toBe(1);
    // O índice único parcial recusa duas em uso.
    await expect(
      prisma.versaoModelo.create({
        data: { nome: 'outro', numero: 1, situacao: 'em_uso', criadaEm: at },
      }),
    ).rejects.toThrow();
  });

  it('classifica as pendentes e as de outra versão; o texto novo volta a deixar pendente', async () => {
    await news.saveNews(parent, [item(1), item(2), item(3)], at);
    const v1 = await repo.useVersion('lexico', 1, at);
    const first = await repo.newsToClassify(v1, 2);
    expect(first.map((n) => n.title)).toEqual(['Notícia 3', 'Notícia 2']);
    await repo.saveClassifications(
      v1,
      first.map((n) => ({ newsId: n.id, sentiment: 'positive', score: 0.5 })),
      at,
    );
    expect((await repo.newsToClassify(v1, 10)).map((n) => n.title)).toEqual(['Notícia 1']);
    expect(await repo.classifiedCounts(v1)).toEqual({ total: 3, classified: 2 });

    const v2 = await repo.useVersion('lexico', 2, at);
    expect(await repo.newsToClassify(v2, 10)).toHaveLength(3);
    expect(await repo.classifiedCounts(v2)).toEqual({ total: 3, classified: 0 });

    // Notícia atualizada na fonte: a classificação sai junto com o vínculo.
    await news.saveNews(parent, [{ ...item(3), title: 'Notícia 3 nova' }], at);
    const row = await prisma.noticia.findFirst({ where: { titulo: 'Notícia 3 nova' } });
    expect(row).toMatchObject({ sentimento: null, versaoModeloId: null, classificadaEm: null });
  });

  it('a classificação vem inteira ou não vem, e a pontuação fica entre −1 e 1', async () => {
    await news.saveNews(parent, [item(1)], at);
    const id = (await ids()).get('Notícia 1') as string;
    await expect(
      prisma.noticia.update({ where: { id }, data: { sentimento: 'positivo' } }),
    ).rejects.toThrow();
    const v1 = await repo.useVersion('lexico', 1, at);
    await expect(
      repo.saveClassifications(v1, [{ newsId: id, sentiment: 'negative', score: -1.5 }], at),
    ).rejects.toThrow();
  });

  it('rótulos: grava, troca, apaga e compara com o que a versão disse', async () => {
    await news.saveNews(parent, [item(1), item(2)], at);
    const map = await ids();
    const one = map.get('Notícia 1') as string;
    const two = map.get('Notícia 2') as string;
    const v1 = await repo.useVersion('lexico', 1, at);
    await repo.saveClassifications(v1, [{ newsId: one, sentiment: 'negative', score: -0.4 }], at);

    await repo.saveLabel(one, 'positive', at);
    await repo.saveLabel(one, 'negative', new Date(at.getTime() + 1000));
    await repo.saveLabel(two, 'neutral', at);
    await expect(repo.saveLabel(randomUUID(), 'neutral', at)).rejects.toBeInstanceOf(
      NewsNotFoundError,
    );
    const labels = await repo.labels(v1);
    expect(labels).toHaveLength(2);
    expect(labels).toContainEqual({
      publishedAt: new Date(Date.UTC(2026, 10, 1)),
      label: 'negative',
      predicted: 'negative',
    });
    expect(labels).toContainEqual({
      publishedAt: new Date(Date.UTC(2026, 10, 2)),
      label: 'neutral',
      predicted: null,
    });
    expect((await repo.recentLabels(10)).map((l) => [l.title, l.label])).toEqual([
      ['Notícia 1', 'negative'],
      ['Notícia 2', 'neutral'],
    ]);

    expect(await repo.deleteLabel(two)).toBe(true);
    expect(await repo.deleteLabel(two)).toBe(false);
    // O rótulo sai com a notícia (fim da autorização).
    await news.clearParent();
    expect(await prisma.rotuloNoticia.count()).toBe(0);
  });

  it('a próxima para rotular: sem rótulo, fora das puladas, primeiro com ativo principal', async () => {
    const asset = await prisma.ativo.create({
      data: {
        ticker: `Z${randomUUID().replace(/\D/g, '').slice(0, 3)}3`.slice(0, 5),
        nome: 'EMPRESA ROTULADA S.A.',
        classe: 'acao',
        setor: 'bens_industriais',
        atualizadoEm: at,
      },
    });
    await news.saveNews(parent, [item(1), item(2), item(3)], at);
    const map = await ids();
    await news.saveLinks(
      map.get('Notícia 2') as string,
      [{ assetId: asset.id, relevance: 'principal', origin: 'ticker_titulo' }],
      1,
      at,
    );
    const next = await repo.nextToLabel([]);
    expect(next).toMatchObject({
      title: 'Notícia 2',
      source: 'Investidor10',
      principal: [asset.ticker],
    });

    const skip = [map.get('Notícia 2') as string];
    const other = await repo.nextToLabel(skip);
    expect(['Notícia 1', 'Notícia 3']).toContain(other?.title);
    await repo.saveLabel(map.get('Notícia 1') as string, 'neutral', at);
    await repo.saveLabel(map.get('Notícia 3') as string, 'neutral', at);
    expect(await repo.nextToLabel(skip)).toBeNull();

    await news.clearParent();
    await prisma.ativo.delete({ where: { id: asset.id } });
  });

  it('guarda a avaliação inteira na versão', async () => {
    const v1 = await repo.useVersion('lexico', 1, at);
    await repo.saveEvaluation(v1, {
      evaluatedAt: at,
      testSize: 60,
      accuracy: 0.75,
      macroF1: 0.612,
      matrix: [
        [10, 2, 1],
        [3, 25, 2],
        [1, 6, 10],
      ],
    });
    expect((await repo.currentVersion())?.evaluation).toEqual({
      evaluatedAt: at,
      testSize: 60,
      accuracy: 0.75,
      macroF1: 0.612,
      matrix: [
        [10, 2, 1],
        [3, 25, 2],
        [1, 6, 10],
      ],
    });
    // Nota pela metade é recusada.
    await expect(
      prisma.versaoModelo.update({ where: { id: v1 }, data: { f1Macro: null } }),
    ).rejects.toThrow();
  });
});
