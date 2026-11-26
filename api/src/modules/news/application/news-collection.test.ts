import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveSitemap,
  articleHtml,
  FakeFeedFetcher,
  FakeParentNewsSource,
  InMemoryNewsRepository,
  InMemoryRunLog,
  newsSitemap,
} from '../testing/fakes.js';
import { NewsCollection } from './news-collection.js';
import { NewsSourceError } from './ports.js';

const url = (id: number) =>
  `https://investidor10.com.br/noticias/noticia-${id}/`.replace(/\/$/, `-${id}/`);
const page = (id: number, modified?: string) =>
  articleHtml({
    title: `Notícia ${id}`,
    published: '2026-11-12T10:00:00-03:00',
    ...(modified ? { modified } : {}),
    themes: ['Mercado'],
    companies: ['Petrobras'],
  });

describe('coleta de notícias (SPEC-027)', () => {
  let repo: InMemoryNewsRepository;
  let parent: FakeParentNewsSource;
  let feeds: FakeFeedFetcher;
  let runs: InMemoryRunLog;
  let sleeps: number[];
  let now: number;

  const collection = (overrides: Partial<ConstructorParameters<typeof NewsCollection>[0]> = {}) =>
    new NewsCollection({
      parentEnabled: true,
      parent,
      feeds,
      news: repo,
      runs,
      clock: () => new Date(now),
      // O tempo anda com a pausa: a fila confere o intervalo pelo relógio.
      sleep: (ms) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
      retryDelaysMs: [10],
      ...overrides,
    });

  beforeEach(() => {
    repo = new InMemoryNewsRepository();
    parent = new FakeParentNewsSource();
    feeds = new FakeFeedFetcher();
    runs = new InMemoryRunLog();
    sleeps = [];
    now = Date.parse('2026-11-12T21:00:00Z');
  });

  it('novas: só as que faltam, com texto, temas e empresas, uma página a cada 3 s (CA01)', async () => {
    parent.newsXml = newsSitemap([
      { url: url(2), title: 'Notícia 2', date: '2026-11-12T10:00:00-03:00' },
      { url: url(1), title: 'Notícia 1', date: '2026-11-12T09:00:00-03:00' },
    ]);
    parent.pages.set(url(1), page(1));
    parent.pages.set(url(2), page(2));
    await repo.saveNews(repo.parent.id, [{ ...newsItem(1) }], new Date(now));

    const result = await collection().latest();
    expect(result).toEqual({ collected: 1, failed: 0 });
    expect(parent.visits).toEqual(['sitemap-news', url(2)]);
    expect(sleeps).toEqual([3000]);
    expect(repo.news.find((n) => n.url === url(2))).toMatchObject({
      title: 'Notícia 2',
      themes: ['Mercado'],
      companies: ['Petrobras'],
      body: expect.stringContaining('Notícia 2') as unknown,
    });
    expect(runs.runs[0]).toMatchObject({ task: 'noticias_novas', result: { status: 'sucesso' } });
    expect(repo.parent.lastStatus).toBe('success');
  });

  it('interruptor desligado: nada do Investidor10 (CA07)', async () => {
    expect(await collection({ parentEnabled: false }).latest()).toBeNull();
    expect(await collection({ parentEnabled: false }).archive()).toBeNull();
    expect(parent.visits).toEqual([]);
  });

  it('bloqueado (403): para na hora, sem as outras páginas', async () => {
    parent.newsXml = newsSitemap([
      { url: url(2), title: '2', date: '2026-11-12T10:00:00-03:00' },
      { url: url(1), title: '1', date: '2026-11-12T09:00:00-03:00' },
    ]);
    parent.pages.set(url(2), new NewsSourceError('blocked', 'Investidor10 recusou (403)'));
    await collection().latest();
    expect(parent.visits).toEqual(['sitemap-news', url(2)]);
    expect(runs.runs[0]?.result?.status).toBe('parcial');
  });

  it('arquivo: da mais nova para a mais antiga, por partes, continuando de onde parou (CA02)', async () => {
    parent.archiveXml = archiveSitemap([1, 2, 3, 4, 5].map((id) => ({ url: url(id) })));
    for (const id of [1, 2, 3, 4, 5]) parent.pages.set(url(id), page(id));

    await collection({ archivePagesPerRun: 2 }).archive();
    expect(parent.visits).toEqual(['sitemap-arquivo', url(5), url(4)]);
    expect(repo.archives.get(repo.parent.id)).toMatchObject({
      total: 5,
      done: 2,
      status: 'running',
    });

    parent.visits.length = 0;
    await collection({ archivePagesPerRun: 2 }).archive();
    expect(parent.visits).toEqual(['sitemap-arquivo', url(3), url(2)]);

    await collection({ archivePagesPerRun: 2 }).archive();
    expect(repo.archives.get(repo.parent.id)).toMatchObject({
      total: 5,
      done: 5,
      status: 'finished',
    });
  });

  it('arquivo: notícia que sumiu (404) não trava a fila; terminado, só as alteradas (CA03)', async () => {
    parent.archiveXml = archiveSitemap([
      { url: url(1), lastmod: '2026-11-12T10:00:00-03:00' },
      { url: url(2), lastmod: '2026-11-12T10:00:00-03:00' },
    ]);
    parent.pages.set(url(1), page(1, '2026-11-12T10:00:00-03:00'));
    // url(2) sem página: 404.
    const run = collection();
    await run.archive();
    expect(repo.archives.get(repo.parent.id)).toMatchObject({ done: 1, status: 'finished' });

    // A notícia 1 mudou na fonte: o texto é atualizado; a data de publicação fica.
    parent.archiveXml = archiveSitemap([
      { url: url(1), lastmod: '2026-11-12T15:00:00-03:00' },
      { url: url(2), lastmod: '2026-11-12T10:00:00-03:00' },
    ]);
    parent.pages.set(
      url(1),
      articleHtml({
        title: 'Notícia 1 corrigida',
        published: '2026-11-12T12:00:00-03:00',
        modified: '2026-11-12T15:00:00-03:00',
      }),
    );
    parent.visits.length = 0;
    await run.archive();
    expect(parent.visits).toEqual(['sitemap-arquivo', url(1)]);
    const stored = repo.news.filter((n) => n.url === url(1));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: 'Notícia 1 corrigida',
      publishedAt: new Date('2026-11-12T13:00:00Z'),
    });
  });

  it('as duas tarefas juntas respeitam a mesma fila de uma página a cada 3 s', async () => {
    parent.newsXml = newsSitemap([{ url: url(9), title: '9', date: '2026-11-12T10:00:00-03:00' }]);
    parent.archiveXml = archiveSitemap([{ url: url(8) }]);
    parent.pages.set(url(9), page(9));
    parent.pages.set(url(8), page(8));
    const run = collection();
    await Promise.all([run.latest(), run.archive()]);
    // 4 visitas, 3 pausas: nenhuma visita sem os 3 s desde a anterior.
    expect(parent.visits).toHaveLength(4);
    expect(sleeps).toEqual([3000, 3000, 3000]);
  });

  it('feeds: grava o que o feed traz; fonte fora do ar não para as outras (CA04, CA06)', async () => {
    const other = await repo.createSource(
      {
        name: 'Outra',
        url: 'https://outra.com/feed',
        category: 'mercado',
        reliability: 3,
        licenseCheckedAt: new Date(now),
      },
      (id) => ({
        at: new Date(now),
        collaboratorId: 'c',
        action: 'news_source_created',
        entity: 'news_source',
        entityId: id,
        details: {},
      }),
    );
    feeds.feeds.set(repo.agency.url, rss(['Juros', 'Dólar']));
    feeds.feeds.set(other.url, new Error('fora do ar'));

    const result = await collection().feeds();
    expect(result).toEqual({ collected: 2, failed: 1 });
    expect(repo.news.filter((n) => n.sourceId === repo.agency.id).map((n) => n.title)).toEqual([
      'Juros',
      'Dólar',
    ]);
    expect(repo.agency).toMatchObject({ lastStatus: 'success', failures: 0 });
    const failing = repo.list.find((s) => s.id === other.id);
    expect(failing).toMatchObject({ lastStatus: 'failure', failures: 1 });
    expect(runs.runs[0]?.result).toMatchObject({ status: 'parcial', records: 2 });

    // De novo: nada duplica.
    feeds.feeds.set(other.url, new Error('fora do ar'));
    expect(await collection().feeds()).toEqual({ collected: 0, failed: 1 });
    expect(repo.list.find((s) => s.id === other.id)?.failures).toBe(2);
  });

  it('fonte curada desativada não é coletada', async () => {
    repo.agency.active = false;
    expect(await collection().feeds()).toBeNull();
  });

  describe('feeds dos usuários (SPEC-030)', () => {
    const FEED = 'https://blog.exemplo/feed';
    const add = (userId: string) =>
      repo.addOwnSource(userId, { url: FEED, title: 'Blog', name: null }, 10, new Date(now));

    it('lê uma vez por endereço, só com alguém que tem o feed ligado (CA05)', async () => {
      expect(await collection().userFeeds()).toBeNull();
      const { source } = await add('ana');
      await add('bruno');
      feeds.feeds.set(FEED, rss(['Uma', 'Duas']));
      expect(await collection().userFeeds()).toEqual({ collected: 2, failed: 0 });
      expect(runs.runs.map((r) => r.task)).toEqual(['noticias_feeds_usuario']);
      expect(repo.news.filter((n) => n.sourceId === source.id)).toHaveLength(2);

      await repo.savePreference('ana', source.id, { active: false }, new Date(now));
      await repo.savePreference('bruno', source.id, { active: false }, new Date(now));
      expect(await collection().userFeeds()).toBeNull();
    });

    it('sem novas tentativas; 24 falhas seguidas param o feed, sem o endereço no registro (CA10, CA12)', async () => {
      const { source } = await add('ana');
      feeds.feeds.set(FEED, new NewsSourceError('retryable', 'nome não encontrado: blog.exemplo'));
      const stored = repo.list.find((s) => s.id === source.id);
      if (!stored) throw new Error('sem fonte');
      stored.failures = 22;
      expect(await collection().userFeeds()).toEqual({ collected: 0, failed: 1 });
      expect(sleeps).toEqual([]);
      expect(stored.stoppedAt).toBeNull();
      const errors = runs.runs[0]?.result?.errors ?? [];
      expect(errors).toEqual([{ message: `fonte ${source.id}: o feed não respondeu` }]);
      expect(JSON.stringify(runs.runs)).not.toContain('blog.exemplo');

      expect(await collection().userFeeds()).toEqual({ collected: 0, failed: 1 });
      expect(stored.failures).toBe(24);
      expect(stored.stoppedAt).toEqual(new Date(now));
      // Parado: não é mais lido.
      expect(await collection().userFeeds()).toBeNull();
    });

    it('as notícias com mais de 12 meses saem; as das fontes do app ficam (CA11)', async () => {
      const { source } = await add('ana');
      const old = { ...newsItem(1), publishedAt: new Date('2025-11-01T12:00:00Z') };
      const recent = { ...newsItem(2), publishedAt: new Date('2026-11-01T12:00:00Z') };
      await repo.saveNews(source.id, [old, recent], new Date(now));
      await repo.saveNews(repo.parent.id, [old], new Date(now));
      expect(await repo.deleteUserNewsBefore(new Date('2025-11-26T21:00:00Z'))).toBe(1);
      expect(repo.news.map((n) => [n.sourceId === source.id, n.title])).toEqual([
        [true, 'Notícia 2'],
        [false, 'Notícia 1'],
      ]);
    });
  });

  function newsItem(id: number) {
    return {
      url: url(id),
      title: `Notícia ${id}`,
      summary: null,
      body: null,
      author: null,
      themes: [],
      companies: [],
      publishedAt: new Date('2026-11-12T12:00:00Z'),
      updatedAt: null,
    };
  }
});

function rss(titles: string[]): string {
  return `<rss version="2.0"><channel>${titles
    .map(
      (
        title,
        i,
      ) => `<item><title>${title}</title><link>https://agenciabrasil.ebc.com.br/n/${i}</link>
        <pubDate>Thu, 12 Nov 2026 1${i}:00:00 -0300</pubDate><description>Resumo ${title}</description></item>`,
    )
    .join('')}</channel></rss>`;
}
