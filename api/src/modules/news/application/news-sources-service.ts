import {
  LATEST_NEWS_LIMIT,
  type LatestNews,
  type NewNewsSourceInput,
  type NewsSource,
  type NewsSourceCreated,
  type NewsSourcesStatus,
  type UpdateNewsSourceInput,
} from '@simulador/shared';
import { FeedRejectedError, NewsSourceNotFoundError, ParentSourceError } from '../domain/errors.js';
import { parseFeed } from '../domain/feed.js';
import {
  FeedAddressError,
  type FeedFetcher,
  type NewsRepository,
  type StoredNewsSource,
} from './ports.js';

export interface NewsSourcesServiceDeps {
  news: NewsRepository;
  feeds: FeedFetcher;
  parentEnabled: boolean;
  clock?: () => Date;
}

/**
 * Fontes de notícias para o colaborador (SPEC-027 §5.1): a lista com a última coleta, o cadastro de
 * fontes curadas (com o teste do feed na hora) e a edição. A fonte pai não muda pela tela (DA19).
 */
export class NewsSourcesService {
  private readonly clock: () => Date;

  constructor(private readonly deps: NewsSourcesServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** SPEC-028 §5.1: as últimas notícias com os vínculos e quantas têm vínculo. */
  async latest(): Promise<LatestNews> {
    const [rows, counts] = await Promise.all([
      this.deps.news.latestNews(LATEST_NEWS_LIMIT),
      this.deps.news.linkCounts(),
    ]);
    return {
      ...counts,
      news: rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() })),
    };
  }

  async status(): Promise<NewsSourcesStatus> {
    const [sources, counts] = await Promise.all([
      this.deps.news.sources(),
      this.deps.news.newsCounts(),
    ]);
    const parent = sources.find((source) => source.kind === 'parent');
    const archive = parent ? await this.deps.news.archive(parent.id) : null;
    return {
      sources: sources
        .sort((a, b) =>
          a.kind !== b.kind ? (a.kind === 'parent' ? -1 : 1) : a.name.localeCompare(b.name),
        )
        .map((source) => toPublic(source, counts.get(source.id) ?? 0)),
      archive: archive
        ? {
            done: archive.done,
            total: archive.total,
            status: archive.status,
            updatedAt: archive.updatedAt.toISOString(),
          }
        : null,
      parentEnabled: this.deps.parentEnabled,
    };
  }

  /** Testa o feed antes de gravar: endereço público, resposta que é RSS ou Atom. */
  async create(collaboratorId: string, input: NewNewsSourceInput): Promise<NewsSourceCreated> {
    let items: number;
    try {
      items = parseFeed(await this.deps.feeds.fetch(input.url), this.clock()).length;
    } catch (error) {
      if (error instanceof FeedAddressError) throw new FeedRejectedError(error.reason);
      // Fora do ar, resposta grande demais ou que não é RSS nem Atom: não dá para cadastrar.
      throw new FeedRejectedError('not_a_feed');
    }
    const at = this.clock();
    const source = await this.deps.news.createSource(
      {
        name: input.name,
        url: input.url,
        category: input.category,
        reliability: input.reliability,
        licenseCheckedAt: at,
      },
      (id) => ({
        at,
        collaboratorId,
        action: 'news_source_created',
        entity: 'news_source',
        entityId: id,
        details: {
          after: {
            name: input.name,
            url: input.url,
            category: input.category,
            reliability: input.reliability,
          },
        },
      }),
    );
    return { source: toPublic(source, 0), items };
  }

  async update(
    collaboratorId: string,
    id: string,
    input: UpdateNewsSourceInput,
  ): Promise<NewsSource> {
    const current = await this.deps.news.source(id);
    if (!current) throw new NewsSourceNotFoundError();
    if (current.kind === 'parent') throw new ParentSourceError();
    const before: Record<string, string | number | boolean> = {};
    const after: Record<string, string | number | boolean> = {};
    for (const key of ['name', 'category', 'reliability', 'active'] as const) {
      const value = input[key];
      if (value === undefined || value === current[key]) continue;
      before[key] = current[key] as string | number | boolean;
      after[key] = value;
    }
    if (Object.keys(after).length === 0) {
      return toPublic(current, (await this.deps.news.newsCounts()).get(id) ?? 0);
    }
    const at = this.clock();
    const updated = await this.deps.news.updateSource(id, input, at, {
      at,
      collaboratorId,
      action: 'news_source_updated',
      entity: 'news_source',
      entityId: id,
      details: { before, after },
    });
    return toPublic(updated, (await this.deps.news.newsCounts()).get(id) ?? 0);
  }
}

function toPublic(source: StoredNewsSource, news: number): NewsSource {
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    url: source.url,
    category: source.category,
    reliability: source.reliability,
    active: source.active,
    lastRunAt: source.lastRunAt?.toISOString() ?? null,
    lastStatus: source.lastStatus,
    lastError: source.lastError,
    failures: source.failures,
    news,
  };
}
