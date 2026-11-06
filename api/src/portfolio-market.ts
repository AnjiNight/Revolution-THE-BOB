import type { StoredAsset } from './modules/asset-catalog/domain/asset.js';
import type {
  DailySession,
  LatestIntradayQuote,
  QuoteLevel,
} from './modules/market-data/application/ports.js';
import type { PortfolioMarket } from './modules/portfolios/application/ports.js';

export interface PortfolioMarketSources {
  assets: { findById(id: string): Promise<StoredAsset | null> };
  intraday: { latestOf(level: QuoteLevel, assetId: string): Promise<LatestIntradayQuote | null> };
  history: { sessions(assetId: string, count: number): Promise<DailySession[]> };
}

/**
 * SPEC-014: o que a carteira precisa do catálogo (SPEC-006) e das cotações (SPECs 008 e 009). Fica
 * na raiz da composição, como o `main.ts`: os módulos não se conhecem (arquitetura §6).
 */
export function portfolioMarket(sources: PortfolioMarketSources): PortfolioMarket {
  return {
    async asset(assetId) {
      const asset = await sources.assets.findById(assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        assetClass: asset.assetClass,
        active: asset.deactivatedAt === null,
      };
    },
    async latestQuote(assetId, level) {
      const quote = await sources.intraday.latestOf(
        level === 'subscriber' ? 'assinante' : 'gratuito',
        assetId,
      );
      if (!quote) return null;
      return { price: quote.price, at: quote.at, level, source: 'brapi' };
    },
    async lastClose(assetId) {
      const [last] = await sources.history.sessions(assetId, 1);
      return last ? { date: last.date, close: last.close } : null;
    },
  };
}
