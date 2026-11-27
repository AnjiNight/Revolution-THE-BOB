import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import { uniqueTicker } from '../../../testing/unique-ticker.js';
import type { NewsToSave, ScenarioRecord } from '../application/ports.js';
import { PrismaNewsRepository } from './prisma-news-repository.js';
import { PrismaSentimentRepository } from './prisma-sentiment-repository.js';

/**
 * SPEC-031 contra o PostgreSQL real (CA04, CA06). Rodam só com TEST_DATABASE_URL. ATENÇÃO: apagam
 * as notícias, as versões do modelo, os feeds dos usuários e os cenários registrados desse banco.
 */
const url = process.env.TEST_DATABASE_URL;
const SEEDED = [
  'https://investidor10.com.br/noticias/',
  'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
];

describe.skipIf(!url)('cenários por sentimento no PostgreSQL (SPEC-031)', () => {
  let prisma: PrismaClient;
  let repo: PrismaNewsRepository;
  let sentiment: PrismaSentimentRepository;
  const at = new Date('2026-11-27T13:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaNewsRepository(prisma);
    sentiment = new PrismaSentimentRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE cenario_registrado, rotulo_noticia, noticia_ativo, noticia, versao_modelo, coleta_noticia_arquivo RESTART IDENTITY',
    );
    await prisma.preferenciaFonte.deleteMany({});
    await prisma.fonteNoticia.deleteMany({ where: { url: { notIn: SEEDED } } });
  });

  const item = (n: number, publishedAt: string): NewsToSave => ({
    url: `https://noticias.exemplo/cenario-${n}`,
    title: `Notícia ${n}`,
    summary: null,
    body: null,
    author: null,
    themes: [],
    companies: [],
    publishedAt: new Date(publishedAt),
    updatedAt: null,
  });

  it('só as notícias oficiais, principal ou citado, da versão; a primeira e o registro', async () => {
    const parent = (await repo.parentSource())?.id as string;
    const ticker = await uniqueTicker(prisma, 'Q', '3');
    const asset = await prisma.ativo.create({
      data: {
        ticker,
        nome: 'EMPRESA CENARIO',
        classe: 'acao',
        setor: 'financeiro',
        atualizadoEm: at,
      },
    });
    const user = await prisma.usuario.create({
      data: {
        nome: 'Ana',
        email: `${randomUUID()}@spec031.test`,
        senhaHash: 'hash-ficticio',
        emailConfirmadoEm: at,
      },
    });
    try {
      const own = await repo.addOwnSource(
        user.id,
        { url: 'https://blog.exemplo/cenario', title: 'Blog', name: null },
        10,
        at,
      );
      await repo.saveNews(
        parent,
        [
          item(1, '2026-11-02T13:00:00Z'),
          item(2, '2026-11-03T13:00:00Z'),
          item(3, '2026-11-04T13:00:00Z'),
          item(4, '2026-11-05T13:00:00Z'),
        ],
        at,
      );
      await repo.saveNews(own.source.id, [item(5, '2026-10-01T13:00:00Z')], at);
      const ids = new Map(
        (await prisma.noticia.findMany({ select: { id: true, titulo: true } })).map((n) => [
          n.titulo,
          n.id,
        ]),
      );
      const link = (n: number, relevance: 'principal' | 'citado' | 'lista') =>
        repo.saveLinks(
          ids.get(`Notícia ${n}`) as string,
          [{ assetId: asset.id, relevance, origin: 'ticker_titulo' }],
          1,
          at,
        );
      await link(1, 'principal');
      await link(2, 'citado');
      await link(3, 'lista');
      await link(5, 'principal');
      const old = await sentiment.useVersion('lexico', 1, at);
      await sentiment.saveClassifications(
        old,
        [{ newsId: ids.get('Notícia 4') as string, sentiment: 'positive', score: 0.9 }],
        at,
      );
      const version = await sentiment.useVersion('lexico', 2, at);
      await sentiment.saveClassifications(
        version,
        [1, 2, 3, 5].map((n) => ({
          newsId: ids.get(`Notícia ${n}`) as string,
          sentiment: 'negative' as const,
          score: -0.4,
        })),
        at,
      );

      // A 3 é de lista, a 4 é de outra versão e a 5 é de um feed de usuário (RB30).
      expect(await repo.scenarioNews(asset.id, version)).toEqual([
        { publishedAt: new Date('2026-11-02T13:00:00Z'), score: -0.4 },
        { publishedAt: new Date('2026-11-03T13:00:00Z'), score: -0.4 },
      ]);
      // A primeira oficial classificada pela versão (a 5, de outubro, é de feed de usuário).
      expect(await repo.firstClassifiedNewsAt(version)).toEqual(new Date('2026-11-02T13:00:00Z'));

      const row: ScenarioRecord = {
        assetId: asset.id,
        day: '2026-11-27',
        band: 'negative',
        horizon: 5,
        modelVersionId: version,
        occurrences: 38,
        down: 57.89,
        flat: 10.53,
        up: 31.58,
        baseOccurrences: 400,
        baseDown: 45,
        baseFlat: 12,
        baseUp: 43,
      };
      await repo.recordScenarios([
        row,
        { ...row, horizon: 0, occurrences: 3, down: null, flat: null, up: null },
      ]);
      await repo.recordScenarios([{ ...row, occurrences: 99 }]);
      const stored = await prisma.cenarioRegistrado.findMany({ orderBy: { horizonte: 'asc' } });
      expect(
        stored.map((r) => [r.horizonte, r.ocorrencias, r.faixa, r.queda?.toString() ?? null]),
      ).toEqual([
        [0, 3, 'negativo', null],
        [5, 38, 'negativo', '57.89'],
      ]);
      // RB31 no banco: as partes vêm todas juntas ou nenhuma.
      await expect(
        repo.recordScenarios([{ ...row, day: '2026-11-28', flat: null }]),
      ).rejects.toThrow();
    } finally {
      await prisma.cenarioRegistrado.deleteMany({ where: { ativoId: asset.id } });
      await prisma.noticiaAtivo.deleteMany({ where: { ativoId: asset.id } });
      await prisma.usuario.delete({ where: { id: user.id } });
      await prisma.ativo.delete({ where: { id: asset.id } });
    }
  });
});
