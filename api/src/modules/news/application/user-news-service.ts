import {
  DEFAULT_SOURCE_PRIORITY,
  NEWS_FEED_PAGE_SIZE,
  NEWS_FEED_PERIOD_DAYS,
  NEWS_SOURCE_PROBLEM_AFTER,
  NEWS_TONE_MIN,
  OWN_FEEDS_LIMIT,
  PARENT_SOURCE_WEIGHT,
  SOURCE_PRIORITY_WEIGHT,
  weightedTone,
  type MyNewsSource,
  type MyNewsSources,
  type NewOwnFeedInput,
  type NewsFeedPage,
  type NewsFeedQuery,
  type NewsSentiment,
  type OwnFeedCreated,
  type SentimentModelName,
  type SourcePriority,
  type UpdateMySourceInput,
} from '@simulador/shared';
import {
  FeedRejectedError,
  NewsAssetNotFoundError,
  NewsSourceNotFoundError,
  NotOwnSourceError,
  OwnFeedExistsError,
  OwnFeedLimitError,
  OwnFeedNotStoppedError,
  ParentSourceError,
  SourceAlreadyInAppError,
  SourceNameNotEditableError,
} from '../domain/errors.js';
import { parseFeed, parseFeedTitle, type FeedItem } from '../domain/feed.js';
import { NewsLayoutError } from '../domain/investidor10-news.js';
import {
  FEED_TOO_LARGE,
  FeedAddressError,
  NewsSourceError,
  type FeedFetcher,
  type NewsFeedFilter,
  type NewsRepository,
  type StoredClassification,
  type UserSourceRow,
} from './ports.js';

/** SPEC-044: a versão do modelo cujo sentimento o usuário vê, ou `null`. */
type VisibleModel = (SentimentModelName & { id: number }) | null;

export interface UserNewsServiceDeps {
  news: NewsRepository;
  feeds: FeedFetcher;
  sentiment?: { visibleModel(): Promise<VisibleModel> };
  /** Vínculo e sentimento das notícias de um feed recém-adicionado; falha não atrapalha. */
  afterCollect?: () => Promise<unknown>;
  clock?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** O peso da fonte na ordem e no tom (§4.1, decisão 2): a pai, 4; as outras, pela prioridade. */
export function sourceWeight(kind: UserSourceRow['source']['kind'], priority: SourcePriority) {
  return kind === 'parent' ? PARENT_SOURCE_WEIGHT : SOURCE_PRIORITY_WEIGHT[priority];
}

/**
 * As fontes de notícias do usuário e a tela Notícias (SPEC-030): ligar e desligar as curadas, a
 * prioridade de cada fonte, os feeds próprios (até 10) e as notícias com filtros e o tom
 * ponderado. A fonte pai não muda (RB29); os feeds próprios nunca entram no oficial (RB30).
 */
export class UserNewsService {
  private readonly clock: () => Date;

  constructor(private readonly deps: UserNewsServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async sources(userId: string): Promise<MyNewsSources> {
    const rows = await this.deps.news.userSources(userId);
    const order = { parent: 0, curated: 1, own: 2 };
    const sources = rows
      .map(toMySource)
      .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'pt-BR'));
    return {
      sources,
      ownLimit: OWN_FEEDS_LIMIT,
      ownCount: sources.filter((source) => source.kind === 'own').length,
    };
  }

  /** Lê o feed na hora (§4.2) e só então liga o usuário a ele. */
  async addFeed(userId: string, input: NewOwnFeedInput): Promise<OwnFeedCreated> {
    const existing = await this.deps.news.sourceByUrl(input.url);
    if (existing && existing.kind !== 'user') throw new SourceAlreadyInAppError(existing.id);
    // Antes de buscar o feed (que demora): o repositório confere de novo, na transação.
    const own = (await this.deps.news.userSources(userId)).filter(
      (row) => row.source.kind === 'user',
    );
    if (own.some((row) => row.source.url === input.url)) throw new OwnFeedExistsError();
    if (own.length >= OWN_FEEDS_LIMIT) throw new OwnFeedLimitError();

    const { xml, items } = await this.read(input.url);
    const at = this.clock();
    const row = await this.deps.news.addOwnSource(
      userId,
      {
        url: input.url,
        title: parseFeedTitle(xml) ?? new URL(input.url).hostname,
        name: input.name ?? null,
      },
      OWN_FEEDS_LIMIT,
      at,
    );
    const news = await this.store(row.source.id, items, at);
    return {
      source: toMySource({ ...row, source: readNow(row.source, at), news: row.news + news }),
      items: items.length,
    };
  }

  async update(userId: string, id: string, input: UpdateMySourceInput): Promise<MyNewsSource> {
    const row = await this.find(userId, id);
    if (row.source.kind === 'parent') throw new ParentSourceError();
    if (input.name !== undefined && row.source.kind !== 'user') {
      throw new SourceNameNotEditableError();
    }
    const preference = await this.deps.news.savePreference(userId, id, input, this.clock());
    return toMySource({ ...row, preference });
  }

  /** "Tentar de novo": lê o feed parado na hora; se responder, volta a ser lido de hora em hora. */
  async retry(userId: string, id: string): Promise<OwnFeedCreated> {
    const row = await this.find(userId, id);
    if (row.source.kind !== 'user' || row.source.stoppedAt === null) {
      throw new OwnFeedNotStoppedError();
    }
    const { items } = await this.read(row.source.url);
    const at = this.clock();
    await this.deps.news.setStopped(id, null);
    const news = await this.store(id, items, at);
    return {
      source: toMySource({ ...row, source: readNow(row.source, at), news: row.news + news }),
      items: items.length,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.find(userId, id);
    if (row.source.kind !== 'user') throw new NotOwnSourceError();
    await this.deps.news.removeOwnSource(userId, id);
  }

  /** A tela Notícias: 20 por vez, com o tom ponderado do filtro (§4.2). */
  async feed(userId: string, query: NewsFeedQuery): Promise<NewsFeedPage> {
    if (query.asset && !(await this.deps.news.assetExists(query.asset))) {
      throw new NewsAssetNotFoundError();
    }
    const model = await this.visibleModel();
    const base: NewsFeedFilter = {
      from: new Date(this.clock().getTime() - NEWS_FEED_PERIOD_DAYS[query.period] * DAY_MS),
      ...(query.asset ? { assetId: query.asset } : {}),
      ...(query.sector ? { sector: query.sector } : {}),
      ...(query.source ? { sourceId: query.source } : {}),
    };
    // Sem modelo visível, o filtro de sentimento não existe para o usuário (SPEC-044).
    const filter: NewsFeedFilter =
      query.sentiment && model
        ? { ...base, sentiment: { value: query.sentiment, modelVersionId: model.id } }
        : base;
    const [page, tones] = await Promise.all([
      this.deps.news.newsFeed(userId, filter, {
        offset: query.offset,
        limit: NEWS_FEED_PAGE_SIZE,
      }),
      // O tom é o do filtro sem o sentimento: com ele, daria sempre 100% de um tom só.
      model ? this.deps.news.newsFeedTones(userId, base, model.id) : Promise.resolve(null),
    ]);
    const tone = tones && tones.length >= NEWS_TONE_MIN ? weightedTone(tones) : null;
    return {
      total: page.total,
      news: page.rows.map(({ classification, ...row }) => ({
        ...row,
        publishedAt: row.publishedAt.toISOString(),
        sentiment: sentimentFor(classification, model),
      })),
      model: model ? { name: model.name, number: model.number } : null,
      tone,
      toneHidden: !model ? 'no_model' : tone ? null : 'few_news',
    };
  }

  /** Uma das fontes que o usuário vê (a pai, uma curada ligada ou um feed dele); senão, 404. */
  private async find(userId: string, id: string): Promise<UserSourceRow> {
    const row = (await this.deps.news.userSources(userId)).find((r) => r.source.id === id);
    if (!row) throw new NewsSourceNotFoundError();
    return row;
  }

  /** Busca e lê o feed, com o motivo de cada recusa para o usuário (§5.2). */
  private async read(url: string): Promise<{ xml: string; items: FeedItem[] }> {
    let xml: string;
    try {
      xml = await this.deps.feeds.fetch(url);
    } catch (error) {
      if (error instanceof FeedAddressError) throw new FeedRejectedError(error.reason);
      if (error instanceof NewsSourceError && error.message === FEED_TOO_LARGE) {
        throw new FeedRejectedError('too_large');
      }
      if (error instanceof NewsSourceError && error.kind === 'invalid') {
        throw new FeedRejectedError('not_a_feed');
      }
      // Fora do ar, tempo esgotado, nome que não resolve, bloqueado.
      throw new FeedRejectedError('unreachable');
    }
    let items: FeedItem[];
    try {
      items = parseFeed(xml, this.clock());
    } catch (error) {
      if (error instanceof NewsLayoutError) throw new FeedRejectedError('not_a_feed');
      throw error;
    }
    if (items.length === 0) throw new FeedRejectedError('not_a_feed');
    return { xml, items };
  }

  /** Guarda o que a leitura trouxe, como a coleta das curadas, e registra a leitura. */
  private async store(sourceId: string, items: readonly FeedItem[], at: Date): Promise<number> {
    const saved = await this.deps.news.saveNews(
      sourceId,
      items.map((item) => ({
        ...item,
        body: null,
        author: null,
        themes: [],
        companies: [],
        updatedAt: null,
      })),
      at,
    );
    await this.deps.news.recordRun(sourceId, { status: 'success', error: null }, at);
    if (saved > 0) void this.deps.afterCollect?.().catch(() => undefined);
    return saved;
  }

  private visibleModel(): Promise<VisibleModel> {
    return this.deps.sentiment?.visibleModel() ?? Promise.resolve(null);
  }
}

/** A fonte como fica depois de uma leitura que deu certo agora. */
function readNow(source: UserSourceRow['source'], at: Date): UserSourceRow['source'] {
  return {
    ...source,
    lastRunAt: at,
    lastStatus: 'success',
    lastError: null,
    failures: 0,
    stoppedAt: null,
  };
}

function sentimentFor(
  classification: StoredClassification | null,
  model: VisibleModel,
): NewsSentiment | null {
  return model && classification?.modelVersionId === model.id ? classification.sentiment : null;
}

/** Como a Minhas fontes mostra cada fonte (§5.2). */
export function toMySource(row: UserSourceRow): MyNewsSource {
  const { source, preference } = row;
  const own = source.kind === 'user';
  const priority = preference?.priority ?? DEFAULT_SOURCE_PRIORITY;
  return {
    id: source.id,
    kind: source.kind === 'parent' ? 'parent' : own ? 'own' : 'curated',
    name: (own ? preference?.name : null) ?? source.name,
    url: source.url,
    active: source.kind === 'parent' ? true : (preference?.active ?? true),
    priority: source.kind === 'parent' ? null : priority,
    weight: sourceWeight(source.kind, priority),
    category: source.kind === 'curated' ? source.category : null,
    status: own
      ? source.stoppedAt
        ? 'stopped'
        : source.failures >= NEWS_SOURCE_PROBLEM_AFTER
          ? 'failing'
          : source.lastRunAt
            ? 'ok'
            : 'pending'
      : null,
    lastRunAt: own ? (source.lastRunAt?.toISOString() ?? null) : null,
    news: own ? row.news : null,
  };
}
