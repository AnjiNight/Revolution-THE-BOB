import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../../shared/infrastructure/database.js';
import type { NewsToSave } from '../application/ports.js';
import { NewsSourceExistsError } from '../domain/errors.js';
import { PrismaNewsRepository } from './prisma-news-repository.js';

/**
 * Testes contra PostgreSQL real (SPEC-027, CA09). Rodam só com TEST_DATABASE_URL apontando para um
 * banco com as migrações aplicadas. ATENÇÃO: apagam as notícias e as fontes curadas desse banco
 * (a fonte pai e a Agência Brasil, da migração, ficam).
 */
const url = process.env.TEST_DATABASE_URL;
const SEEDED = [
  'https://investidor10.com.br/noticias/',
  'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
];

describe.skipIf(!url)('fontes e notícias no PostgreSQL (SPEC-027)', () => {
  let prisma: PrismaClient;
  let repo: PrismaNewsRepository;
  const at = new Date('2026-11-12T21:00:00Z');

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    repo = new PrismaNewsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE noticia, coleta_noticia_arquivo');
    await prisma.fonteNoticia.deleteMany({ where: { url: { notIn: SEEDED } } });
    await prisma.fonteNoticia.updateMany({
      data: { ativa: true, ultimaColetaEm: null, ultimaSituacao: null, falhasSeguidas: 0 },
    });
  });

  const item = (n: number, fields: Partial<NewsToSave> = {}): NewsToSave => ({
    url: `https://investidor10.com.br/noticias/noticia-${n}/`,
    title: `Notícia ${n}`,
    summary: 'Resumo',
    body: 'Texto completo',
    author: 'Autora',
    themes: ['Dividendos'],
    companies: ['Petrobras'],
    publishedAt: new Date('2026-11-12T13:00:00Z'),
    updatedAt: new Date('2026-11-12T13:00:00Z'),
    ...fields,
  });

  it('a migração cria a fonte pai e a Agência Brasil', async () => {
    const sources = await repo.sources();
    expect(sources.map((s) => [s.kind, s.name])).toEqual([
      ['parent', 'Investidor10'],
      ['curated', 'Agência Brasil – Economia'],
    ]);
    expect(sources[1]).toMatchObject({ category: 'economia', reliability: 5 });
  });

  it('grava sem duplicar; a atualização muda o texto e mantém a publicação (CA03)', async () => {
    const parent = (await repo.parentSource())?.id as string;
    expect(await repo.saveNews(parent, [item(1), item(2)], at)).toBe(2);
    expect(
      await repo.saveNews(
        parent,
        [
          item(1, {
            title: 'Notícia 1 corrigida',
            publishedAt: new Date('2030-01-01T00:00:00Z'),
            updatedAt: new Date('2026-11-12T18:00:00Z'),
          }),
        ],
        at,
      ),
    ).toBe(0);
    const row = await prisma.noticia.findFirst({ where: { url: item(1).url } });
    expect(row).toMatchObject({
      titulo: 'Notícia 1 corrigida',
      publicadaEm: new Date('2026-11-12T13:00:00Z'),
      temas: ['Dividendos'],
      empresasMarcadas: ['Petrobras'],
    });
    expect((await repo.storedUrls(parent)).get(item(1).url)).toEqual(
      new Date('2026-11-12T18:00:00Z'),
    );
    expect((await repo.newsCounts()).get(parent)).toBe(2);
  });

  it('situação da coleta: falhas seguidas somam e o sucesso zera', async () => {
    const agency = (await repo.sources())[1]?.id as string;
    await repo.recordRun(agency, { status: 'failure', error: 'fora do ar' }, at);
    await repo.recordRun(agency, { status: 'failure', error: 'fora do ar' }, at);
    expect(await repo.source(agency)).toMatchObject({
      lastStatus: 'failure',
      failures: 2,
      lastError: 'fora do ar',
    });
    await repo.recordRun(agency, { status: 'success', error: null }, at);
    expect(await repo.source(agency)).toMatchObject({ lastStatus: 'success', failures: 0 });
  });

  it('fonte curada: cadastro com auditoria; endereço repetido é recusado (CA08)', async () => {
    const collaboratorId = randomUUID();
    const audit = (id: string) => ({
      at,
      collaboratorId,
      action: 'news_source_created' as const,
      entity: 'news_source' as const,
      entityId: id,
      details: {},
    });
    const source = {
      name: 'InfoMoney',
      url: 'https://www.infomoney.com.br/feed/',
      category: 'mercado' as const,
      reliability: 4,
      licenseCheckedAt: at,
    };
    const created = await repo.createSource(source, audit);
    expect(created).toMatchObject({ kind: 'curated', name: 'InfoMoney', active: true });
    await expect(repo.createSource(source, audit)).rejects.toThrow(NewsSourceExistsError);
    expect(
      await prisma.registroAuditoria.count({
        where: { entidade: 'fonte_noticia', entidadeId: created.id },
      }),
    ).toBe(1);
  });

  it('o banco recusa http, curada sem licença, fonte pai inativa e uma segunda pai (CA09)', async () => {
    await expect(
      prisma.fonteNoticia.create({
        data: {
          tipo: 'curada',
          nome: 'X',
          url: 'http://x.com/feed',
          categoria: 'mercado',
          confiabilidade: 3,
          licencaConferidaEm: at,
        },
      }),
    ).rejects.toThrow(/fonte_noticia_https_chk/);
    await expect(
      prisma.fonteNoticia.create({
        data: {
          tipo: 'curada',
          nome: 'X',
          url: 'https://x.com/feed',
          categoria: 'mercado',
          confiabilidade: 3,
        },
      }),
    ).rejects.toThrow(/fonte_noticia_curada_chk/);
    await expect(
      prisma.fonteNoticia.updateMany({ where: { tipo: 'pai' }, data: { ativa: false } }),
    ).rejects.toThrow(/fonte_noticia_pai_ativa_chk/);
    await expect(
      prisma.fonteNoticia.create({ data: { tipo: 'pai', nome: 'Outra', url: 'https://y.com/' } }),
    ).rejects.toThrow();
  });

  it('andamento do arquivo e a limpeza do fim da autorização (CA07)', async () => {
    const parent = (await repo.parentSource())?.id as string;
    const agency = (await repo.sources())[1]?.id as string;
    await repo.saveNews(parent, [item(1), item(2)], at);
    await repo.saveNews(agency, [item(3, { url: 'https://agenciabrasil.ebc.com.br/n/3' })], at);
    await repo.saveArchive(parent, { total: 100, done: 2, status: 'running', updatedAt: at });
    expect(await repo.archive(parent)).toEqual({
      total: 100,
      done: 2,
      status: 'running',
      updatedAt: at,
    });
    expect(await repo.clearParent()).toBe(3);
    expect(await repo.archive(parent)).toBeNull();
    expect((await repo.newsCounts()).get(parent)).toBeUndefined();
    expect((await repo.newsCounts()).get(agency)).toBe(1);
  });
});
