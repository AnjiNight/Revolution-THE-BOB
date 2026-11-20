import {
  addDays,
  ASSET_NEWS_PAGE_SIZE,
  isoDateInBrasilia,
  newsReferenceDay,
  newsReferenceDayStart,
  type AssetNewsDays,
  type AssetNewsPage,
  type AssetNewsQuery,
  type NewsSentiment,
  type PriceHistoryPeriod,
  type SentimentCounts,
  type SentimentModelName,
} from '@simulador/shared';
import { periodStart } from '../../financial-calculation/price-history.js';
import type { LinkRelevance } from '../domain/asset-links.js';
import { NewsAssetNotFoundError } from '../domain/errors.js';
import type { AssetNewsFilter, NewsRepository, StoredClassification } from './ports.js';

/** O ativo é o assunto ou é citado; as listas ficam num grupo à parte (SPEC-029 §4.1, decisão 2). */
const MAIN: readonly LinkRelevance[] = ['principal', 'citado'];
const LIST: readonly LinkRelevance[] = ['lista'];

/** SPEC-044: a versão do modelo cujo sentimento o usuário vê, ou `null`. */
type VisibleModel = (SentimentModelName & { id: number }) | null;

export interface AssetNewsServiceDeps {
  news: NewsRepository;
  sentiment?: { visibleModel(): Promise<VisibleModel> };
  clock?: () => Date;
}

/** O tom só aparece se veio da versão visível; o de outra versão é como pendente. */
function sentimentFor(
  classification: StoredClassification | null,
  model: VisibleModel,
): NewsSentiment | null {
  return model && classification?.modelVersionId === model.id ? classification.sentiment : null;
}

const modelName = (model: VisibleModel): SentimentModelName | null =>
  model ? { name: model.name, number: model.number } : null;

/** Notícias do ativo na ficha e os marcadores do gráfico (SPEC-029 §5.1). */
export class AssetNewsService {
  private readonly clock: () => Date;

  constructor(private readonly deps: AssetNewsServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async page(assetId: string, query: AssetNewsQuery): Promise<AssetNewsPage> {
    await this.ensureAsset(assetId);
    const filter: AssetNewsFilter = {
      relevances: query.group === 'list' ? LIST : MAIN,
      // O painel de um pregão: os dias de referência depois de `after` até `until`.
      ...(query.after && query.until
        ? {
            from: newsReferenceDayStart(addDays(query.after, 1)),
            to: newsReferenceDayStart(addDays(query.until, 1)),
          }
        : {}),
    };
    const page = { offset: query.offset, limit: ASSET_NEWS_PAGE_SIZE };
    const [found, lists, model] = await Promise.all([
      this.deps.news.assetNews(assetId, filter, page),
      query.group === 'list'
        ? null
        : this.deps.news.assetNews(assetId, { relevances: LIST }, { offset: 0, limit: 0 }),
      this.visibleModel(),
    ]);
    return {
      total: found.total,
      listTotal: lists ? lists.total : found.total,
      news: found.rows.map(({ classification, ...row }) => ({
        ...row,
        publishedAt: row.publishedAt.toISOString(),
        sentiment: sentimentFor(classification, model),
      })),
      model: modelName(model),
    };
  }

  /**
   * Quantas notícias principal e citado por dia de referência, desde o começo do período contado a
   * partir de hoje. O app liga cada dia ao pregão do gráfico e ignora o que fica antes dele.
   */
  async days(assetId: string, period: PriceHistoryPeriod): Promise<AssetNewsDays> {
    await this.ensureAsset(assetId);
    const start = periodStart(isoDateInBrasilia(this.clock()), period);
    const [dates, model] = await Promise.all([
      this.deps.news.assetNewsDates(assetId, {
        relevances: MAIN,
        ...(start ? { from: newsReferenceDayStart(start) } : {}),
      }),
      this.visibleModel(),
    ]);
    const days = new Map<string, { count: number; sentiment: SentimentCounts }>();
    for (const date of dates) {
      const key = newsReferenceDay(date.publishedAt);
      const day = days.get(key) ?? {
        count: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0 },
      };
      day.count += 1;
      const sentiment = sentimentFor(date.classification, model);
      if (sentiment) day.sentiment[sentiment] += 1;
      days.set(key, day);
    }
    return {
      period,
      days: [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, { count, sentiment }]) => ({
          day,
          count,
          sentiment: model ? sentiment : null,
        })),
      model: modelName(model),
    };
  }

  private visibleModel(): Promise<VisibleModel> {
    return this.deps.sentiment?.visibleModel() ?? Promise.resolve(null);
  }

  private async ensureAsset(assetId: string): Promise<void> {
    if (!(await this.deps.news.assetExists(assetId))) throw new NewsAssetNotFoundError();
  }
}
