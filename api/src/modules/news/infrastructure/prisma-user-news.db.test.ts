import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { uniqueTicker } from '../../../testing/unique-ticker.js';
import type { NewsToSave } from '../application/ports.js';
import {
  OwnFeedExistsError,
  OwnFeedLimitError,
  SourceAlreadyInAppError,
} from '../domain/errors.js';
import { PrismaNewsSourcesExport } from './prisma-news-export.js';
import { PrismaNewsRepository } from './prisma-news-repository.js';
import { PrismaSentimentRepository } from './prisma-sentiment-repository.js';

/**
 * SPEC-030 contra o PostgreSQL real (CA03, CA05, CA06, CA07, CA08, CA11, CA13). Rodam só com
 * TEST_DATABASE_URL. ATENÇÃO: apagam as notícias, os feeds dos usuários e as contas de teste
 * criadas aqui (a fonte pai e a Agência Brasil, da migração, ficam).
 */
const url = process.env.TEST_DATABASE_URL;
const SEEDED = [
  'https://investidor10.com.br/noticias/',
  'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
];
const FEED = 'https://blog.exemplo/feed';

describe.skipIf(!url)('fontes do usuário no PostgreSQL (SPEC-030)', () => {
  let prisma: PrismaClient;
  let repo: PrismaNewsRepository;
  let sentiment: PrismaSentimentRepository;
  let parent: string;
  let agency: string;
  let ana: string;
  let bruno: string;
  const at = new Date('2026-11-26T21:00:00Z');
  const created: string[] = [];

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaNewsRepository(prisma);
    sentiment = new PrismaSentimentRepository(prisma);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  const user = async (name: string): Promise<string> => {
    const row = await prisma.usuario.create({
      data: {
        nome: name,
        email: `${randomUUID()}@spec030.test`,
        senhaHash: 'hash-ficticio',
        emailConfirmadoEm: at,
      },
    });
    created.push(row.id);
    return row.id;
  };

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE rotulo_noticia, noticia_ativo, noticia, versao_modelo, coleta_noticia_arquivo RESTART IDENTITY',
    );
    await prisma.preferenciaFonte.deleteMany({});
    await prisma.fonteNoticia.deleteMany({ where: { url: { notIn: SEEDED } } });
    await prisma.fonteNoticia.updateMany({ data: { ativa: true, falhasSeguidas: 0 } });
    const sources = await repo.sources();
    parent = sources[0]?.id as string;
    agency = sources[1]?.id as string;
    ana = await user('Ana');
    bruno = await user('Bruno');
  });

  const item = (n: number, fields: Partial<NewsToSave> = {}): NewsToSave => ({
    url: `https://noticias.exemplo/${n}`,
    title: `Notícia ${n}`,
    summary: null,
    body: null,
    author: null,
    themes: [],
    companies: [],
    publishedAt: new Date('2026-11-26T13:00:00Z'),
    updatedAt: null,
    ...fields,
  });

  const add = (userId: string, name: string | null = null) =>
    repo.addOwnSource(userId, { url: FEED, title: 'Blog do feed', name }, 10, at);

  it('a fonte pai não tem preferência e o tipo usuário não tem categoria (CA03)', async () => {
    await expect(
      prisma.preferenciaFonte.create({ data: { usuarioId: ana, fonteId: parent } }),
    ).rejects.toThrow(/RB29/);
    await expect(
      prisma.preferenciaFonte.create({ data: { usuarioId: ana, fonteId: agency, nome: 'X' } }),
    ).rejects.toThrow(/feed próprio/);
    await expect(
      prisma.fonteNoticia.create({
        data: { tipo: 'usuario', nome: 'X', url: 'https://x.exemplo/feed', categoria: 'economia' },
      }),
    ).rejects.toThrow();
  });

  it('o mesmo endereço é uma fonte só; limite, repetido e fonte do app (CA05)', async () => {
    const first = await add(ana, 'Blog FII');
    const second = await add(bruno);
    expect(second.source.id).toBe(first.source.id);
    expect(first.source).toMatchObject({ kind: 'user', name: 'Blog do feed', category: null });
    expect(first.preference).toMatchObject({ active: true, priority: 'medium', name: 'Blog FII' });
    await expect(add(ana)).rejects.toBeInstanceOf(OwnFeedExistsError);
    await expect(
      repo.addOwnSource(ana, { url: SEEDED[1] as string, title: 'x', name: null }, 10, at),
    ).rejects.toBeInstanceOf(SourceAlreadyInAppError);
    await expect(
      repo.addOwnSource(ana, { url: 'https://outro.exemplo/feed', title: 'x', name: null }, 1, at),
    ).rejects.toBeInstanceOf(OwnFeedLimitError);

    const names = await repo.userSources(bruno);
    expect(names.map((row) => [row.source.kind, row.preference?.name ?? null])).toEqual([
      ['parent', null],
      ['curated', null],
      ['user', null],
    ]);
  });

  it('sai o último usuário (remoção ou conta excluída): a fonte e as notícias somem (CA05, CA13)', async () => {
    const { source } = await add(ana);
    await add(bruno);
    await repo.saveNews(source.id, [item(1)], at);
    expect(await repo.removeOwnSource(ana, source.id)).toBe(true);
    expect(await repo.removeOwnSource(ana, source.id)).toBe(false);
    expect(await repo.sourceByUrl(FEED)).not.toBeNull();

    // A conta do Bruno é excluída: a preferência sai em cascata e o gatilho apaga o resto.
    await prisma.usuario.delete({ where: { id: bruno } });
    expect(await repo.sourceByUrl(FEED)).toBeNull();
    expect(await prisma.noticia.count({ where: { fonteId: source.id } })).toBe(0);
    // A curada nunca sai por falta de usuário.
    await repo.savePreference(ana, agency, { active: false }, at);
    await prisma.preferenciaFonte.deleteMany({ where: { usuarioId: ana } });
    expect(await repo.source(agency)).not.toBeNull();
  });

  it('quem vê cada notícia, a ordem pelo peso e os filtros (CA02, CA06, CA08)', async () => {
    const ticker = await uniqueTicker(prisma, 'Z', '3');
    const asset = await prisma.ativo.create({
      data: { ticker, nome: 'BANCO TESTE', classe: 'acao', setor: 'financeiro', atualizadoEm: at },
    });
    try {
      const { source: own } = await add(ana, 'Meu blog');
      await repo.saveNews(parent, [item(1, { title: 'Pai' })], at);
      await repo.saveNews(agency, [item(2, { title: 'Agência' })], at);
      await repo.saveNews(own.id, [item(3, { title: 'Própria' })], at);
      await repo.saveNews(
        parent,
        [item(4, { title: 'Pai ontem', publishedAt: new Date('2026-11-25T13:00:00Z') })],
        at,
      );
      const ids = new Map(
        (await prisma.noticia.findMany({ select: { id: true, titulo: true } })).map((n) => [
          n.titulo,
          n.id,
        ]),
      );
      for (const title of ['Pai', 'Agência', 'Própria']) {
        await repo.saveLinks(
          ids.get(title) as string,
          [{ assetId: asset.id, relevance: 'principal', origin: 'ticker_titulo' }],
          1,
          at,
        );
      }
      await repo.savePreference(ana, own.id, { priority: 'high' }, at);
      const from = new Date('2026-10-27T21:00:00Z');
      const titles = async (userId: string, extra = {}) =>
        (await repo.newsFeed(userId, { from, ...extra }, { offset: 0, limit: 20 })).rows.map(
          (r) => r.title,
        );

      // Mesmo dia: pai (4), própria alta (3), Agência média (2); depois o dia anterior.
      expect(await titles(ana)).toEqual(['Pai', 'Própria', 'Agência', 'Pai ontem']);
      expect(await titles(bruno)).toEqual(['Pai', 'Agência', 'Pai ontem']);
      const page = await repo.newsFeed(ana, { from }, { offset: 1, limit: 1 });
      expect(page.total).toBe(4);
      expect(page.rows[0]).toMatchObject({ source: 'Meu blog', ownSource: true });
      expect(page.rows[0]?.assets).toEqual([{ id: asset.id, ticker }]);

      expect(await titles(ana, { assetId: asset.id })).toEqual(['Pai', 'Própria', 'Agência']);
      expect(await titles(ana, { sector: { class: 'stock', code: 'financeiro' } })).toHaveLength(3);
      expect(await titles(ana, { sector: { class: 'fii', code: 'logistica' } })).toEqual([]);
      expect(await titles(ana, { sourceId: own.id })).toEqual(['Própria']);

      // Desligar: só para quem desligou. Na ficha, o mesmo.
      await repo.savePreference(ana, agency, { active: false }, at);
      expect(await titles(ana)).toEqual(['Pai', 'Própria', 'Pai ontem']);
      const ficha = await repo.assetNews(
        asset.id,
        { viewerId: ana, relevances: ['principal', 'citado'] },
        { offset: 0, limit: 10 },
      );
      expect(ficha.rows.map((r) => [r.title, r.ownSource])).toEqual([
        ['Pai', false],
        ['Própria', true],
      ]);
      expect(
        await repo.assetNewsDates(asset.id, { viewerId: bruno, relevances: ['principal'] }),
      ).toHaveLength(2);
      // A curada desligada pelo colaborador some para todos.
      await prisma.fonteNoticia.update({ where: { id: agency }, data: { ativa: false } });
      expect(await titles(bruno)).toEqual(['Pai', 'Pai ontem']);

      // Tom: classificadas pela versão, com o peso de quem vê.
      const version = await sentiment.useVersion('lexico', 1, at);
      await sentiment.saveClassifications(
        version,
        [
          { newsId: ids.get('Pai') as string, sentiment: 'positive', score: 0.5 },
          { newsId: ids.get('Própria') as string, sentiment: 'negative', score: -0.5 },
        ],
        at,
      );
      expect(
        (await repo.newsFeedTones(ana, { from }, version)).sort((a, b) => b.weight - a.weight),
      ).toEqual([
        { sentiment: 'positive', weight: 4 },
        { sentiment: 'negative', weight: 3 },
      ]);
      expect(
        await titles(ana, { sentiment: { value: 'negative', modelVersionId: version } }),
      ).toEqual(['Própria']);
    } finally {
      await prisma.noticiaAtivo.deleteMany({ where: { ativoId: asset.id } });
      await prisma.ativo.delete({ where: { id: asset.id } });
    }
  });

  it('as notícias dos feeds ficam fora da amostra, das contagens e das últimas (CA07, CA12)', async () => {
    const { source } = await add(ana);
    await repo.saveNews(source.id, [item(1)], at);
    expect(await sentiment.nextToLabel([])).toBeNull();
    const own = (await prisma.noticia.findFirst({ where: { fonteId: source.id } }))?.id as string;
    await expect(sentiment.saveLabel(own, 'positive', at)).rejects.toThrow();
    expect(await sentiment.classifiedCounts(null)).toEqual({ total: 0, classified: 0 });
    expect(await repo.latestNews(20)).toEqual([]);
    expect(await repo.linkCounts()).toEqual({ total: 0, linked: 0 });
    expect((await repo.sources()).map((s) => s.kind)).toEqual(['parent', 'curated']);

    await repo.saveNews(parent, [item(2)], at);
    expect(await sentiment.nextToLabel([])).toMatchObject({ title: 'Notícia 2' });
  });

  it('coleta, parada, totais e a limpeza de 12 meses (CA10, CA11, CA12)', async () => {
    const { source } = await add(ana);
    expect((await repo.collectableUserSources()).map((s) => s.id)).toEqual([source.id]);
    await repo.recordRun(source.id, { status: 'failure', error: 'o feed não respondeu' }, at);
    await prisma.fonteNoticia.update({ where: { id: source.id }, data: { falhasSeguidas: 3 } });
    expect(await repo.userSourceTotals(3)).toEqual({ total: 1, failing: 1, stopped: 0 });
    await repo.setStopped(source.id, at);
    expect(await repo.collectableUserSources()).toEqual([]);
    expect(await repo.userSourceTotals(3)).toEqual({ total: 1, failing: 0, stopped: 1 });
    await repo.setStopped(source.id, null);
    expect((await repo.source(source.id))?.failures).toBe(0);
    await repo.savePreference(ana, source.id, { active: false }, at);
    expect(await repo.collectableUserSources()).toEqual([]);

    await repo.saveNews(
      source.id,
      [item(1, { publishedAt: new Date('2025-11-01T12:00:00Z') }), item(2)],
      at,
    );
    await repo.saveNews(parent, [item(3, { publishedAt: new Date('2025-11-01T12:00:00Z') })], at);
    expect(await repo.deleteUserNewsBefore(new Date('2025-11-26T21:00:00Z'))).toBe(1);
    expect(await prisma.noticia.count()).toBe(2);
  });

  it('a exportação traz os feeds e as escolhas sobre as fontes do app (CA13)', async () => {
    await add(ana, 'Meu blog');
    await repo.savePreference(ana, agency, { priority: 'low' }, new Date(at.getTime() + 1000));
    expect(await new PrismaNewsSourcesExport(prisma).exportForUser(ana)).toEqual([
      {
        kind: 'own',
        name: 'Meu blog',
        url: FEED,
        active: true,
        priority: 'medium',
        createdAt: at.toISOString(),
      },
      {
        kind: 'curated',
        name: 'Agência Brasil – Economia',
        url: SEEDED[1],
        active: true,
        priority: 'low',
        createdAt: new Date(at.getTime() + 1000).toISOString(),
      },
    ]);
    expect(await new PrismaNewsSourcesExport(prisma).exportForUser(bruno)).toEqual([]);
  });
});
