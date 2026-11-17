import {
  addDays,
  ASSET_NEWS_PAGE_SIZE,
  isoDateInBrasilia,
  newsReferenceDay,
  newsReferenceDayStart,
  type AssetNewsDays,
  type AssetNewsPage,
  type AssetNewsQuery,
  type PriceHistoryPeriod,
} from '@simulador/shared';
import { periodStart } from '../../financial-calculation/price-history.js';
import type { LinkRelevance } from '../domain/asset-links.js';
import { NewsAssetNotFoundError } from '../domain/errors.js';
import type { AssetNewsFilter, NewsRepository } from './ports.js';

/** O ativo é o assunto ou é citado; as listas ficam num grupo à parte (SPEC-029 §4.1, decisão 2). */
const MAIN: readonly LinkRelevance[] = ['principal', 'citado'];
const LIST: readonly LinkRelevance[] = ['lista'];

export interface AssetNewsServiceDeps {
  news: NewsRepository;
  clock?: () => Date;
}

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
    const [found, lists] = await Promise.all([
      this.deps.news.assetNews(assetId, filter, page),
      query.group === 'list'
        ? null
        : this.deps.news.assetNews(assetId, { relevances: LIST }, { offset: 0, limit: 0 }),
    ]);
    return {
      total: found.total,
      listTotal: lists ? lists.total : found.total,
      news: found.rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() })),
    };
  }

  /**
   * Quantas notícias principal e citado por dia de referência, desde o começo do período contado a
   * partir de hoje. O app liga cada dia ao pregão do gráfico e ignora o que fica antes dele.
   */
  async days(assetId: string, period: PriceHistoryPeriod): Promise<AssetNewsDays> {
    await this.ensureAsset(assetId);
    const start = periodStart(isoDateInBrasilia(this.clock()), period);
    const dates = await this.deps.news.assetNewsDates(assetId, {
      relevances: MAIN,
      ...(start ? { from: newsReferenceDayStart(start) } : {}),
    });
    const counts = new Map<string, number>();
    for (const date of dates) {
      const day = newsReferenceDay(date);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return {
      period,
      days: [...counts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count })),
    };
  }

  private async ensureAsset(assetId: string): Promise<void> {
    if (!(await this.deps.news.assetExists(assetId))) throw new NewsAssetNotFoundError();
  }
}
