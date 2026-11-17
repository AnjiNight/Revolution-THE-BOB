import { randomUUID } from 'node:crypto';
import type { NewsCategory } from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type {
  ArchiveProgress,
  AssetNewsFilter,
  AssetNewsRow,
  FeedFetcher,
  LatestNewsRow,
  NewsRepository,
  NewsRunLog,
  NewsTask,
  NewsToLink,
  NewsToSave,
  ParentNewsSource,
  StoredLink,
  StoredNewsSource,
} from '../application/ports.js';
import type { CatalogTicker } from '../domain/asset-links.js';
import { NewsSourceExistsError, NewsSourceNotFoundError } from '../domain/errors.js';

type StoredNews = NewsToSave & {
  id: string;
  sourceId: string;
  collectedAt: Date;
  /** SPEC-028: versão da regra do último vínculo, ou `null`. */
  linkVersion: number | null;
  links: StoredLink[];
};

/** Fontes e notícias em memória (SPEC-027), com a fonte pai e a Agência Brasil da migração. */
export class InMemoryNewsRepository implements NewsRepository {
  readonly list: StoredNewsSource[] = [];
  readonly news: StoredNews[] = [];
  readonly archives = new Map<string, ArchiveProgress>();
  readonly audit: AuditEntry[] = [];
  /** SPEC-028: o catálogo que o vinculador usa. */
  readonly catalog: CatalogTicker[] = [];

  constructor() {
    const base = {
      licenseCheckedAt: null,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      failures: 0,
      active: true,
    };
    this.list.push(
      {
        ...base,
        id: randomUUID(),
        kind: 'parent',
        name: 'Investidor10',
        url: 'https://investidor10.com.br/noticias/',
        category: null,
        reliability: null,
      },
      {
        ...base,
        id: randomUUID(),
        kind: 'curated',
        name: 'Agência Brasil – Economia',
        url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
        category: 'economia',
        reliability: 5,
        licenseCheckedAt: new Date('2026-11-12T00:00:00Z'),
      },
    );
  }

  get parent(): StoredNewsSource {
    return this.list[0] as StoredNewsSource;
  }

  get agency(): StoredNewsSource {
    return this.list[1] as StoredNewsSource;
  }

  sources(): Promise<StoredNewsSource[]> {
    return Promise.resolve(this.list.map((source) => ({ ...source })));
  }

  source(id: string): Promise<StoredNewsSource | null> {
    const found = this.list.find((source) => source.id === id);
    return Promise.resolve(found ? { ...found } : null);
  }

  parentSource(): Promise<StoredNewsSource | null> {
    return Promise.resolve({ ...this.parent });
  }

  newsCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const item of this.news) counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
    return Promise.resolve(counts);
  }

  storedUrls(sourceId: string): Promise<Map<string, Date | null>> {
    return Promise.resolve(
      new Map(
        this.news
          .filter((item) => item.sourceId === sourceId)
          .map((item) => [item.url, item.updatedAt]),
      ),
    );
  }

  saveNews(sourceId: string, news: readonly NewsToSave[], at: Date): Promise<number> {
    let created = 0;
    for (const item of news) {
      const index = this.news.findIndex((n) => n.sourceId === sourceId && n.url === item.url);
      const current = this.news[index];
      if (current) {
        // Como no banco: o texto novo desfaz o vínculo, que é refeito (SPEC-028).
        this.news[index] = {
          ...current,
          ...item,
          publishedAt: current.publishedAt,
          collectedAt: at,
          linkVersion: null,
        };
      } else {
        this.news.push({
          ...item,
          id: randomUUID(),
          sourceId,
          collectedAt: at,
          linkVersion: null,
          links: [],
        });
        created += 1;
      }
    }
    return Promise.resolve(created);
  }

  recordRun(
    sourceId: string,
    outcome: { status: 'success' | 'failure'; error: string | null },
    at: Date,
  ): Promise<void> {
    const source = this.list.find((s) => s.id === sourceId);
    if (source) {
      source.lastRunAt = at;
      source.lastStatus = outcome.status;
      source.lastError = outcome.error;
      source.failures = outcome.status === 'success' ? 0 : source.failures + 1;
    }
    return Promise.resolve();
  }

  newsToLink(version: number, limit: number): Promise<NewsToLink[]> {
    return Promise.resolve(
      [...this.news]
        .filter((item) => item.linkVersion !== version)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, limit)
        .map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          body: item.body,
          companies: item.companies,
        })),
    );
  }

  saveLinks(newsId: string, links: readonly StoredLink[], version: number): Promise<void> {
    const item = this.news.find((n) => n.id === newsId);
    if (item) {
      item.links = [...links];
      item.linkVersion = version;
    }
    return Promise.resolve();
  }

  catalogTickers(): Promise<CatalogTicker[]> {
    return Promise.resolve([...this.catalog]);
  }

  latestNews(limit: number): Promise<LatestNewsRow[]> {
    const ticker = (assetId: string) =>
      this.catalog.find((asset) => asset.assetId === assetId)?.ticker ?? '';
    return Promise.resolve(
      [...this.news]
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, limit)
        .map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          source: this.list.find((s) => s.id === item.sourceId)?.name ?? '',
          publishedAt: item.publishedAt,
          links: item.links.map((link) => ({
            ticker: ticker(link.assetId),
            relevance: link.relevance,
          })),
        })),
    );
  }

  linkCounts(): Promise<{ total: number; linked: number }> {
    return Promise.resolve({
      total: this.news.length,
      linked: this.news.filter((item) => item.links.length > 0).length,
    });
  }

  assetExists(assetId: string): Promise<boolean> {
    return Promise.resolve(this.catalog.some((asset) => asset.assetId === assetId));
  }

  assetNews(
    assetId: string,
    filter: AssetNewsFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: AssetNewsRow[] }> {
    const found = this.linkedTo(assetId, filter);
    return Promise.resolve({
      total: found.length,
      rows: found.slice(page.offset, page.offset + page.limit).map(({ item, relevance }) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: this.list.find((s) => s.id === item.sourceId)?.name ?? '',
        publishedAt: item.publishedAt,
        relevance,
      })),
    });
  }

  assetNewsDates(assetId: string, filter: AssetNewsFilter): Promise<Date[]> {
    return Promise.resolve(this.linkedTo(assetId, filter).map(({ item }) => item.publishedAt));
  }

  /** As notícias ligadas ao ativo, com a relevância do vínculo, das mais novas. */
  private linkedTo(assetId: string, filter: AssetNewsFilter) {
    return this.news
      .flatMap((item) => {
        const link = item.links.find((l) => l.assetId === assetId);
        return link ? [{ item, relevance: link.relevance }] : [];
      })
      .filter(
        ({ item, relevance }) =>
          filter.relevances.includes(relevance) &&
          (!filter.from || item.publishedAt >= filter.from) &&
          (!filter.to || item.publishedAt < filter.to),
      )
      .sort((a, b) => b.item.publishedAt.getTime() - a.item.publishedAt.getTime());
  }

  archive(sourceId: string): Promise<ArchiveProgress | null> {
    return Promise.resolve(this.archives.get(sourceId) ?? null);
  }

  saveArchive(sourceId: string, progress: ArchiveProgress): Promise<void> {
    this.archives.set(sourceId, { ...progress });
    return Promise.resolve();
  }

  createSource(
    source: {
      name: string;
      url: string;
      category: NewsCategory;
      reliability: number;
      licenseCheckedAt: Date;
    },
    audit: (id: string) => AuditEntry,
  ): Promise<StoredNewsSource> {
    if (this.list.some((s) => s.url === source.url)) {
      return Promise.reject(new NewsSourceExistsError());
    }
    const stored: StoredNewsSource = {
      ...source,
      id: randomUUID(),
      kind: 'curated',
      active: true,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      failures: 0,
    };
    this.list.push(stored);
    this.audit.push(audit(stored.id));
    return Promise.resolve({ ...stored });
  }

  updateSource(
    id: string,
    changes: { name?: string; category?: NewsCategory; reliability?: number; active?: boolean },
    _at: Date,
    audit: AuditEntry,
  ): Promise<StoredNewsSource> {
    const source = this.list.find((s) => s.id === id);
    if (!source) return Promise.reject(new NewsSourceNotFoundError());
    Object.assign(source, changes);
    this.audit.push(audit);
    return Promise.resolve({ ...source });
  }

  clearParent(): Promise<number> {
    const before = this.news.length;
    for (let i = this.news.length - 1; i >= 0; i -= 1) {
      if (this.news[i]?.sourceId === this.parent.id) this.news.splice(i, 1);
    }
    this.archives.delete(this.parent.id);
    return Promise.resolve(before - this.news.length);
  }
}

/** O Investidor10 em memória: os sitemaps e as páginas pelo endereço, com a ordem das visitas. */
export class FakeParentNewsSource implements ParentNewsSource {
  newsXml = '<urlset></urlset>';
  archiveXml = '<urlset></urlset>';
  readonly pages = new Map<string, string | Error>();
  readonly visits: string[] = [];

  newsSitemap(): Promise<string> {
    this.visits.push('sitemap-news');
    return Promise.resolve(this.newsXml);
  }

  archiveSitemap(): Promise<string> {
    this.visits.push('sitemap-arquivo');
    return Promise.resolve(this.archiveXml);
  }

  article(url: string): Promise<string | null> {
    this.visits.push(url);
    const page = this.pages.get(url);
    if (page instanceof Error) return Promise.reject(page);
    return Promise.resolve(page ?? null);
  }
}

export class FakeFeedFetcher implements FeedFetcher {
  readonly feeds = new Map<string, string | Error>();

  fetch(url: string): Promise<string> {
    const feed = this.feeds.get(url);
    if (feed instanceof Error) return Promise.reject(feed);
    if (feed === undefined) return Promise.reject(new Error(`sem feed para ${url}`));
    return Promise.resolve(feed);
  }
}

export class InMemoryRunLog implements NewsRunLog {
  readonly runs: Array<{ task: NewsTask; result?: Parameters<NewsRunLog['finish']>[1] }> = [];

  start(task: NewsTask): Promise<string> {
    this.runs.push({ task });
    return Promise.resolve(String(this.runs.length - 1));
  }

  finish(id: string, result: Parameters<NewsRunLog['finish']>[1]): Promise<void> {
    const run = this.runs[Number(id)];
    if (run) run.result = result;
    return Promise.resolve();
  }
}

/** Página de notícia mínima, como a do Investidor10: menu, título, dados estruturados, temas. */
export function articleHtml(fields: {
  title: string;
  published: string;
  modified?: string;
  body?: string;
  themes?: string[];
  companies?: string[];
}): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: fields.title,
    articleBody: fields.body ?? `Texto de ${fields.title}.\nSegundo parágrafo.`,
    datePublished: fields.published,
    dateModified: fields.modified ?? fields.published,
    author: { '@type': 'Person', name: 'Autora Teste' },
  };
  const links = (path: string, names: string[] | undefined, prefix = '') =>
    (names ?? [])
      .map(
        (name) =>
          `<a href="https://investidor10.com.br/noticias/${path}/${name.toLowerCase()}/">${prefix}${name}</a>`,
      )
      .join('');
  return `<html><head>
<meta name="description" content="Resumo de ${fields.title} &amp; mais">
<script type="application/ld+json">${JSON.stringify(data)}</script>
</head><body>
<nav><a href="https://investidor10.com.br/noticias/tema/resultados/">Últimos Resultados</a></nav>
<h1>${fields.title}</h1>
<div class="news-body--content"><p>${fields.body ?? 'Texto'}</p></div>
${links('tema', fields.themes)}${links('ativo', fields.companies, 'Notícias sobre ')}
</body></html>`;
}

export function newsSitemap(items: Array<{ url: string; title: string; date: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items
  .map(
    (
      item,
    ) => `<url><loc>${item.url}</loc><news:news><news:publication><news:name>Investidor10</news:name></news:publication>
<news:publication_date>${item.date}</news:publication_date><news:title>${item.title}</news:title></news:news></url>`,
  )
  .join('\n')}
</urlset>`;
}

export function archiveSitemap(items: Array<{ url: string; lastmod?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (item) =>
      `<url><loc>${item.url}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
<url><loc>https://investidor10.com.br/noticias/ativo/petrobras/</loc></url>
</urlset>`;
}
