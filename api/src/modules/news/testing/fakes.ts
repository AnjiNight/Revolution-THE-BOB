import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SOURCE_PRIORITY,
  isoDateInBrasilia,
  PARENT_SOURCE_WEIGHT,
  SOURCE_PRIORITY_WEIGHT,
  type AssetClass,
  type NewsCategory,
  type NewsSentiment,
  type SectorCode,
  type SourcePriority,
  type UserSourcesTotals,
} from '@simulador/shared';
import type { AuditEntry } from '../../audit/application/audit.js';
import type {
  ArchiveProgress,
  AssetNewsDate,
  AssetNewsFilter,
  AssetNewsRow,
  Classification,
  FeedFetcher,
  LabelRow,
  LatestNewsRow,
  NewsFeedFilter,
  NewsFeedRow,
  NewsRepository,
  ScenarioNewsRow,
  ScenarioRecord,
  NewsRunLog,
  NewsTask,
  NewsToClassify,
  NewsToLink,
  NewsToSave,
  ParentNewsSource,
  SentimentRepository,
  StoredClassification,
  StoredEvaluation,
  StoredLabel,
  StoredLink,
  StoredModelVersion,
  StoredNewsSource,
  StoredNewsToLabel,
  StoredPreference,
  UserSourceRow,
} from '../application/ports.js';
import type { CatalogTicker } from '../domain/asset-links.js';
import {
  NewsNotFoundError,
  NewsSourceExistsError,
  NewsSourceNotFoundError,
  OwnFeedExistsError,
  OwnFeedLimitError,
  SourceAlreadyInAppError,
} from '../domain/errors.js';

/** SPEC-030: a escolha de um usuário sobre uma fonte, em memória. */
interface MemoryPreference extends StoredPreference {
  userId: string;
  createdAt: Date;
}

function toStoredPreference(p: MemoryPreference): StoredPreference {
  return { sourceId: p.sourceId, active: p.active, priority: p.priority, name: p.name };
}

function classificationOf(item: StoredNews): StoredClassification | null {
  return item.classification
    ? {
        sentiment: item.classification.sentiment,
        modelVersionId: item.classification.modelVersionId,
      }
    : null;
}

type StoredNews = NewsToSave & {
  id: string;
  sourceId: string;
  collectedAt: Date;
  /** SPEC-028: versão da regra do último vínculo, ou `null`. */
  linkVersion: number | null;
  links: StoredLink[];
  /** SPEC-044: a classificação, ou `null` se a notícia está pendente. */
  classification: (StoredClassification & { score: number; at: Date }) | null;
};

/** Fontes e notícias em memória (SPEC-027), com a fonte pai e a Agência Brasil da migração. */
export class InMemoryNewsRepository implements NewsRepository {
  readonly list: StoredNewsSource[] = [];
  readonly news: StoredNews[] = [];
  readonly archives = new Map<string, ArchiveProgress>();
  readonly audit: AuditEntry[] = [];
  /** SPEC-028: o catálogo que o vinculador usa. */
  readonly catalog: CatalogTicker[] = [];
  /** SPEC-030: as escolhas dos usuários e o setor de cada ativo, para o filtro. */
  readonly preferences: MemoryPreference[] = [];
  readonly sectors = new Map<string, { class: AssetClass; code: SectorCode }>();
  /** SPEC-031: os cenários registrados. */
  readonly scenarioRecords: ScenarioRecord[] = [];

  constructor() {
    const base = {
      licenseCheckedAt: null,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      failures: 0,
      stoppedAt: null,
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
    return Promise.resolve(
      this.list.filter((source) => source.kind !== 'user').map((source) => ({ ...source })),
    );
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
          classification: null,
        };
      } else {
        this.news.push({
          ...item,
          id: randomUUID(),
          sourceId,
          collectedAt: at,
          linkVersion: null,
          links: [],
          classification: null,
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
      this.official()
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
    const official = this.official();
    return Promise.resolve({
      total: official.length,
      linked: official.filter((item) => item.links.length > 0).length,
    });
  }

  /** SPEC-030 (RB30): as notícias da fonte pai e das curadas. */
  official(): StoredNews[] {
    return this.news.filter(
      (item) => this.list.find((s) => s.id === item.sourceId)?.kind !== 'user',
    );
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
        classification: classificationOf(item),
        ownSource: this.viewOf(filter.viewerId, item).own,
      })),
    });
  }

  assetNewsDates(assetId: string, filter: AssetNewsFilter): Promise<AssetNewsDate[]> {
    return Promise.resolve(
      this.linkedTo(assetId, filter).map(({ item }) => ({
        publishedAt: item.publishedAt,
        classification: classificationOf(item),
      })),
    );
  }

  /** As notícias ligadas ao ativo, das fontes de quem vê, na ordem da SPEC-030. */
  private linkedTo(assetId: string, filter: AssetNewsFilter) {
    const order = this.byViewerOrder(filter.viewerId);
    return this.news
      .filter((item) => this.viewOf(filter.viewerId, item).visible)
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
      .sort((a, b) => order(a.item, b.item));
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
      stoppedAt: null,
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

  // --- SPEC-030: fontes do usuário ---

  /** A notícia é de uma fonte que o usuário vê (§4.2), e o peso dela para ele. */
  viewOf(userId: string, item: StoredNews): { visible: boolean; weight: number; own: boolean } {
    const source = this.list.find((s) => s.id === item.sourceId);
    const preference = this.preferences.find(
      (p) => p.userId === userId && p.sourceId === item.sourceId,
    );
    if (!source) return { visible: false, weight: 0, own: false };
    const weight =
      source.kind === 'parent'
        ? PARENT_SOURCE_WEIGHT
        : SOURCE_PRIORITY_WEIGHT[preference?.priority ?? DEFAULT_SOURCE_PRIORITY];
    const visible =
      source.kind === 'parent' ||
      (source.kind === 'curated' && source.active && (preference?.active ?? true)) ||
      (source.kind === 'user' && preference?.active === true);
    return { visible, weight, own: source.kind === 'user' };
  }

  /** Por dia de publicação em Brasília, pelo peso dentro do dia e pelo horário. */
  private byViewerOrder(userId: string) {
    const day = (date: Date) => isoDateInBrasilia(date);
    return (a: StoredNews, b: StoredNews) =>
      day(b.publishedAt).localeCompare(day(a.publishedAt)) ||
      this.viewOf(userId, b).weight - this.viewOf(userId, a).weight ||
      b.publishedAt.getTime() - a.publishedAt.getTime() ||
      a.id.localeCompare(b.id);
  }

  private sourceName(userId: string, item: StoredNews): string {
    const source = this.list.find((s) => s.id === item.sourceId);
    const preference = this.preferences.find(
      (p) => p.userId === userId && p.sourceId === item.sourceId,
    );
    return (source?.kind === 'user' ? preference?.name : null) ?? source?.name ?? '';
  }

  userSources(userId: string): Promise<UserSourceRow[]> {
    const rows = this.list
      .filter(
        (source) =>
          source.kind === 'parent' ||
          (source.kind === 'curated' && source.active) ||
          (source.kind === 'user' &&
            this.preferences.some((p) => p.userId === userId && p.sourceId === source.id)),
      )
      .map((source) => {
        const preference = this.preferences.find(
          (p) => p.userId === userId && p.sourceId === source.id,
        );
        return {
          source: { ...source },
          preference: preference ? toStoredPreference(preference) : null,
          news: this.news.filter((item) => item.sourceId === source.id).length,
        };
      });
    return Promise.resolve(rows);
  }

  sourceByUrl(url: string): Promise<StoredNewsSource | null> {
    const found = this.list.find((s) => s.url === url);
    return Promise.resolve(found ? { ...found } : null);
  }

  savePreference(
    userId: string,
    sourceId: string,
    changes: { active?: boolean; priority?: SourcePriority; name?: string },
    at: Date,
  ): Promise<StoredPreference> {
    const source = this.list.find((s) => s.id === sourceId);
    if (source?.kind === 'parent') return Promise.reject(new Error('RB29: sem preferência'));
    let preference = this.preferences.find((p) => p.userId === userId && p.sourceId === sourceId);
    if (!preference) {
      preference = {
        userId,
        sourceId,
        active: true,
        priority: DEFAULT_SOURCE_PRIORITY,
        name: null,
        createdAt: at,
      };
      this.preferences.push(preference);
    }
    if (changes.active !== undefined) preference.active = changes.active;
    if (changes.priority !== undefined) preference.priority = changes.priority;
    if (changes.name !== undefined) preference.name = changes.name;
    return Promise.resolve(toStoredPreference(preference));
  }

  addOwnSource(
    userId: string,
    feed: { url: string; title: string; name: string | null },
    limit: number,
    at: Date,
  ): Promise<UserSourceRow> {
    let source = this.list.find((s) => s.url === feed.url);
    if (source && source.kind !== 'user') {
      return Promise.reject(new SourceAlreadyInAppError(source.id));
    }
    if (source && this.preferences.some((p) => p.userId === userId && p.sourceId === source?.id)) {
      return Promise.reject(new OwnFeedExistsError());
    }
    const own = this.preferences.filter(
      (p) => p.userId === userId && this.list.find((s) => s.id === p.sourceId)?.kind === 'user',
    ).length;
    if (own >= limit) return Promise.reject(new OwnFeedLimitError());
    if (!source) {
      source = {
        id: randomUUID(),
        kind: 'user',
        name: feed.title,
        url: feed.url,
        category: null,
        reliability: null,
        active: true,
        licenseCheckedAt: null,
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        failures: 0,
        stoppedAt: null,
      };
      this.list.push(source);
    }
    const preference = {
      userId,
      sourceId: source.id,
      active: true,
      priority: DEFAULT_SOURCE_PRIORITY,
      name: feed.name,
      createdAt: at,
    };
    this.preferences.push(preference);
    const sourceId = source.id;
    return Promise.resolve({
      source: { ...source },
      preference: toStoredPreference(preference),
      news: this.news.filter((item) => item.sourceId === sourceId).length,
    });
  }

  /** Como o gatilho do banco: sem ninguém, a fonte e as notícias dela saem. */
  removeOwnSource(userId: string, sourceId: string): Promise<boolean> {
    const index = this.preferences.findIndex(
      (p) =>
        p.userId === userId &&
        p.sourceId === sourceId &&
        this.list.find((s) => s.id === sourceId)?.kind === 'user',
    );
    if (index < 0) return Promise.resolve(false);
    this.preferences.splice(index, 1);
    if (!this.preferences.some((p) => p.sourceId === sourceId)) {
      for (let i = this.news.length - 1; i >= 0; i -= 1) {
        if (this.news[i]?.sourceId === sourceId) this.news.splice(i, 1);
      }
      this.list.splice(
        this.list.findIndex((s) => s.id === sourceId),
        1,
      );
    }
    return Promise.resolve(true);
  }

  collectableUserSources(): Promise<StoredNewsSource[]> {
    return Promise.resolve(
      this.list
        .filter(
          (s) =>
            s.kind === 'user' &&
            s.stoppedAt === null &&
            this.preferences.some((p) => p.sourceId === s.id && p.active),
        )
        .map((s) => ({ ...s })),
    );
  }

  setStopped(sourceId: string, stoppedAt: Date | null): Promise<void> {
    const source = this.list.find((s) => s.id === sourceId);
    if (source) {
      source.stoppedAt = stoppedAt;
      if (stoppedAt === null) source.failures = 0;
    }
    return Promise.resolve();
  }

  deleteUserNewsBefore(cutoff: Date): Promise<number> {
    const before = this.news.length;
    for (let i = this.news.length - 1; i >= 0; i -= 1) {
      const item = this.news[i];
      const source = this.list.find((s) => s.id === item?.sourceId);
      if (item && source?.kind === 'user' && item.publishedAt < cutoff) this.news.splice(i, 1);
    }
    return Promise.resolve(before - this.news.length);
  }

  userSourceTotals(problemAfter: number): Promise<UserSourcesTotals> {
    const user = this.list.filter((s) => s.kind === 'user');
    return Promise.resolve({
      total: user.length,
      failing: user.filter((s) => s.stoppedAt === null && s.failures >= problemAfter).length,
      stopped: user.filter((s) => s.stoppedAt !== null).length,
    });
  }

  private feedMatches(userId: string, filter: NewsFeedFilter) {
    const linkedMain = (item: StoredNews) =>
      item.links.filter((l) => l.relevance === 'principal' || l.relevance === 'citado');
    return this.news.filter(
      (item) =>
        this.viewOf(userId, item).visible &&
        item.publishedAt >= filter.from &&
        (!filter.assetId || linkedMain(item).some((l) => l.assetId === filter.assetId)) &&
        (!filter.sector ||
          linkedMain(item).some((l) => {
            const sector = this.sectors.get(l.assetId);
            return sector?.class === filter.sector?.class && sector?.code === filter.sector?.code;
          })) &&
        (!filter.sourceId || item.sourceId === filter.sourceId) &&
        (!filter.sentiment ||
          (item.classification?.sentiment === filter.sentiment.value &&
            item.classification.modelVersionId === filter.sentiment.modelVersionId)),
    );
  }

  newsFeed(
    userId: string,
    filter: NewsFeedFilter,
    page: { offset: number; limit: number },
  ): Promise<{ total: number; rows: NewsFeedRow[] }> {
    const found = this.feedMatches(userId, filter).sort(this.byViewerOrder(userId));
    const ticker = (assetId: string) =>
      this.catalog.find((asset) => asset.assetId === assetId)?.ticker ?? '';
    return Promise.resolve({
      total: found.length,
      rows: found.slice(page.offset, page.offset + page.limit).map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: this.sourceName(userId, item),
        ownSource: this.viewOf(userId, item).own,
        publishedAt: item.publishedAt,
        classification: classificationOf(item),
        assets: item.links
          .filter((l) => l.relevance === 'principal' || l.relevance === 'citado')
          .sort(
            (a, b) =>
              (a.relevance === 'principal' ? 0 : 1) - (b.relevance === 'principal' ? 0 : 1) ||
              ticker(a.assetId).localeCompare(ticker(b.assetId)),
          )
          .map((l) => ({ id: l.assetId, ticker: ticker(l.assetId) })),
      })),
    });
  }

  newsFeedTones(
    userId: string,
    filter: NewsFeedFilter,
    modelVersionId: number,
  ): Promise<Array<{ sentiment: NewsSentiment; weight: number }>> {
    return Promise.resolve(
      this.feedMatches(userId, filter).flatMap((item) =>
        item.classification?.modelVersionId === modelVersionId
          ? [{ sentiment: item.classification.sentiment, weight: this.viewOf(userId, item).weight }]
          : [],
      ),
    );
  }

  // --- SPEC-031: cenários por sentimento ---

  private officialClassified(modelVersionId: number): StoredNews[] {
    return this.official().filter((item) => item.classification?.modelVersionId === modelVersionId);
  }

  scenarioNews(assetId: string, modelVersionId: number): Promise<ScenarioNewsRow[]> {
    return Promise.resolve(
      this.officialClassified(modelVersionId)
        .filter((item) =>
          item.links.some(
            (l) =>
              l.assetId === assetId && (l.relevance === 'principal' || l.relevance === 'citado'),
          ),
        )
        .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
        .map((item) => ({
          publishedAt: item.publishedAt,
          score: item.classification?.score ?? 0,
        })),
    );
  }

  firstClassifiedNewsAt(modelVersionId: number): Promise<Date | null> {
    const dates = this.officialClassified(modelVersionId).map((item) => item.publishedAt.getTime());
    return Promise.resolve(dates.length > 0 ? new Date(Math.min(...dates)) : null);
  }

  recordScenarios(rows: readonly ScenarioRecord[]): Promise<void> {
    for (const row of rows) {
      const exists = this.scenarioRecords.some(
        (r) =>
          r.assetId === row.assetId &&
          r.day === row.day &&
          r.horizon === row.horizon &&
          r.modelVersionId === row.modelVersionId,
      );
      if (!exists) this.scenarioRecords.push({ ...row });
    }
    return Promise.resolve();
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

/** SPEC-044 em memória, sobre as notícias do repositório de notícias. */
export class InMemorySentimentRepository implements SentimentRepository {
  readonly versions: StoredModelVersion[] = [];
  readonly labelsById = new Map<string, { label: NewsSentiment; at: Date }>();

  constructor(private readonly newsRepo: InMemoryNewsRepository) {}

  useVersion(name: string, number: number, at: Date): Promise<number> {
    const found = this.versions.find((v) => v.name === name && v.number === number);
    if (found?.status === 'in_use') return Promise.resolve(found.id);
    for (const version of this.versions) version.status = 'retired';
    if (found) {
      found.status = 'in_use';
      return Promise.resolve(found.id);
    }
    const id = this.versions.length + 1;
    this.versions.push({ id, name, number, status: 'in_use', createdAt: at, evaluation: null });
    return Promise.resolve(id);
  }

  currentVersion(): Promise<StoredModelVersion | null> {
    const found = this.versions.find((v) => v.status === 'in_use');
    return Promise.resolve(found ? { ...found } : null);
  }

  retiredVersions(): Promise<StoredModelVersion[]> {
    return Promise.resolve(
      this.versions
        .filter((v) => v.status === 'retired')
        .reverse()
        .map((v) => ({ ...v })),
    );
  }

  newsToClassify(versionId: number, limit: number): Promise<NewsToClassify[]> {
    return Promise.resolve(
      [...this.newsRepo.news]
        .filter((item) => item.classification?.modelVersionId !== versionId)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, limit)
        .map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    );
  }

  saveClassifications(
    versionId: number,
    items: readonly Classification[],
    at: Date,
  ): Promise<void> {
    for (const { newsId, sentiment, score } of items) {
      const item = this.newsRepo.news.find((n) => n.id === newsId);
      if (item) item.classification = { sentiment, score, modelVersionId: versionId, at };
    }
    return Promise.resolve();
  }

  classifiedCounts(versionId: number | null): Promise<{ total: number; classified: number }> {
    const official = this.newsRepo.official();
    return Promise.resolve({
      total: official.length,
      classified: official.filter(
        (item) => versionId !== null && item.classification?.modelVersionId === versionId,
      ).length,
    });
  }

  labels(versionId: number | null): Promise<LabelRow[]> {
    return Promise.resolve(
      [...this.labelsById].flatMap(([id, { label }]) => {
        const item = this.newsRepo.news.find((n) => n.id === id);
        if (!item) return [];
        const c = item.classification;
        return [
          {
            publishedAt: item.publishedAt,
            label,
            predicted:
              c && versionId !== null && c.modelVersionId === versionId ? c.sentiment : null,
          },
        ];
      }),
    );
  }

  recentLabels(limit: number): Promise<StoredLabel[]> {
    return Promise.resolve(
      [...this.labelsById]
        .sort(([, a], [, b]) => b.at.getTime() - a.at.getTime())
        .slice(0, limit)
        .flatMap(([id, { label, at }]) => {
          const item = this.newsRepo.news.find((n) => n.id === id);
          return item
            ? [
                {
                  id,
                  title: item.title,
                  url: item.url,
                  publishedAt: item.publishedAt,
                  label,
                  labeledAt: at,
                },
              ]
            : [];
        }),
    );
  }

  /** Sem sorteio: a primeira com ativo principal, na ordem guardada. */
  nextToLabel(skip: readonly string[]): Promise<StoredNewsToLabel | null> {
    const principal = (item: StoredNews) =>
      item.links
        .filter((link) => link.relevance === 'principal')
        .map(
          (link) =>
            this.newsRepo.catalog.find((asset) => asset.assetId === link.assetId)?.ticker ?? '',
        )
        .sort();
    const candidates = this.newsRepo
      .official()
      .filter((item) => !this.labelsById.has(item.id) && !skip.includes(item.id));
    const item =
      candidates.find((candidate) => principal(candidate).length > 0) ?? candidates[0] ?? null;
    if (!item) return Promise.resolve(null);
    return Promise.resolve({
      id: item.id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      source: this.newsRepo.list.find((s) => s.id === item.sourceId)?.name ?? '',
      publishedAt: item.publishedAt,
      principal: principal(item),
    });
  }

  saveLabel(newsId: string, sentiment: NewsSentiment, at: Date): Promise<void> {
    if (!this.newsRepo.official().some((n) => n.id === newsId)) {
      return Promise.reject(new NewsNotFoundError());
    }
    this.labelsById.set(newsId, { label: sentiment, at });
    return Promise.resolve();
  }

  deleteLabel(newsId: string): Promise<boolean> {
    return Promise.resolve(this.labelsById.delete(newsId));
  }

  saveEvaluation(versionId: number, evaluation: StoredEvaluation): Promise<void> {
    const version = this.versions.find((v) => v.id === versionId);
    if (version) version.evaluation = { ...evaluation };
    return Promise.resolve();
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
